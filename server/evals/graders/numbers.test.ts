import { describe, expect, it } from 'vitest';
import { gradeNumbers } from './numbers.ts';
import { extractFigures } from './figures.ts';
import { areit, areitThesis, withContext } from './fixtures.ts';

describe('extractFigures', () => {
  it('keeps currency, unit and decimal figures and skips bare integers', () => {
    const figures = extractFigures('In 2026 it had 18 buildings, ₱37.50 price, 13.6x P/E, 6% yield, P17.3B swap and 0.77 PEG.');
    expect(figures.map((f) => f.raw)).toEqual(['₱37.50', '13.6x', '6%', 'P17.3B', '0.77']);
    expect(figures.map((f) => f.unit)).toEqual(['peso', 'x', 'pct', 'peso', null]);
  });
});

describe('gradeNumbers', () => {
  it('passes a thesis that only quotes frozen figures, rounded or derived', () => {
    const result = gradeNumbers(areitThesis, areit);
    expect(result.notes).toEqual([]);
    expect(result.pass).toBe(true);
    expect(result.figures).toBeGreaterThan(10);
  });

  it('accepts rounding to the stated precision', () => {
    const rounded = areitThesis.replace('P/E of 13.6x', 'P/E of 14x').replace('At ₱37.50', 'At ₱38');
    expect(gradeNumbers(rounded, areit).pass).toBe(true);
  });

  it('flags a labeled figure that contradicts its field', () => {
    const result = gradeNumbers(areitThesis.replace('P/E of 13.6x', 'P/E of 18.5x'), areit);
    expect(result.wrong).toBe(1);
    expect(result.pass).toBe(false);
    expect(result.notes[0]).toContain('pe');
  });

  it('flags a percentage off by more than 2 points', () => {
    expect(gradeNumbers(areitThesis.replace('ROIC of 5.9%', 'ROIC of 9.5%'), areit).wrong).toBe(1);
  });

  it('counts figures that appear nowhere in the data as invented', () => {
    const result = gradeNumbers(areitThesis.replace('Rising bond yields', 'Occupancy of 97.5% and rising bond yields'), areit);
    expect(result.invented).toBe(1);
    expect(result.notes).toEqual(['"97.5%" not in data']);
  });

  it('skips entry prices the model proposes', () => {
    const text = areitThesis.replace('needs to fall toward ₱22.60', 'needs a pullback toward ₱27, ideally near or below ₱28,');
    expect(gradeNumbers(text, areit).pass).toBe(true);
  });

  it('skips scenario prices, multiples and ranges from real outputs', () => {
    const text = areitThesis.replace(
      'Rising bond yields',
      'Wait for a pullback toward the low ₱30s, into the mid-₱20s, or a buyer at ₱24.30–25.50. A re-rating toward 0.5–0.6x book, applying a 10-12x multiple, means a 60–100% gain. Rising bond yields'
    );
    expect(gradeNumbers(text, areit).notes).toEqual([]);
  });

  it('skips targets and ranges Sonnet wrote on ac-trap-pe and cbc', () => {
    const text = areitThesis.replace('Rising bond yields', 'I would get interested in the low-to-mid ₱30s, or on a pullback toward the high ₱20s to low ₱30s. Rising bond yields');
    expect(gradeNumbers(text, areit).notes).toEqual([]);
  });

  it('skips unlabeled figures in what-if sentences (Sonnet on bdo, sti, plus)', () => {
    const text = areitThesis.replace(
      'Rising bond yields',
      "I'd want to see the price closer to ₱30-32, or roughly 0.75x book. Even if I assume 5% growth and a 10x to 12x exit multiple, fair value holds. Rising bond yields"
    );
    expect(gradeNumbers(text, areit).notes).toEqual([]);
  });

  it('still checks labeled figures in what-if sentences', () => {
    expect(gradeNumbers(areitThesis.replace('Bottom line: watch.', 'Bottom line: watch. I would note the P/E of 25x is rich.'), areit).wrong).toBe(1);
  });

  it('accepts swapped price labels but not an unrelated price (mimo on creit, gtcap-below-mos)', () => {
    const swapped = areitThesis.replace('Rising bond yields', 'At ₱37.50 vs ₱45.20 sticker (₱22.60 MOS buy), upside is limited. Rising bond yields');
    expect(gradeNumbers(swapped, areit).notes).toEqual([]);
    expect(gradeNumbers(areitThesis.replace('Sticker Price of ₱45.20', 'Sticker Price of ₱52.00'), areit).wrong).toBe(1);
  });

  it('skips "wait for" targets and "even if" what-ifs', () => {
    const text = areitThesis.replace('Rising bond yields', 'Even if my Sticker Price is off by 30%, wait for ~₱31 or lower, or wait for roughly ₱29. Rising bond yields');
    expect(gradeNumbers(text, areit).notes).toEqual([]);
  });

  it('checks lower bounds against the data', () => {
    // Revenue growth is 43.1%
    expect(gradeNumbers(areitThesis.replace('Rising bond yields', 'Growth rates of 40%+ and over 30% are unlikely to last. Rising bond yields'), areit).pass).toBe(true);
    expect(gradeNumbers(areitThesis.replace('Rising bond yields', 'Growth rates of 300%+ are unlikely to last. Rising bond yields'), areit).invented).toBe(1);
  });

  it('does not tie a single-year "earnings growth" figure to the 10-year EPS growth', () => {
    // BDO's news says 2025 net income rose 6%; Sonnet wrote "earnings growth (6% in 2025)"
    const text = areitThesis.replace('Rising bond yields', 'Slowing earnings growth (17.5% on average) is worth monitoring. Rising bond yields');
    expect(gradeNumbers(text, areit).pass).toBe(true);
  });

  it('accepts ratios and per-share values derived from the data', () => {
    // 37.50 / 45.20 = 83% of Sticker, 37.50 / 22.60 = 1.7x MOS, EPS = 37.50 / 13.64 = ₱2.75
    const text = areitThesis.replace('Rising bond yields', 'You pay 83% of the Sticker Price, 1.7x the MOS level, for EPS of roughly ₱2.75. Rising bond yields');
    expect(gradeNumbers(text, areit).notes).toEqual([]);
  });

  it('does not let dates in the data vouch for a figure', () => {
    // "June 28, 2019" and "2026-02-27" are in the AREIT data block
    const result = gradeNumbers(areitThesis.replace('Rising bond yields', 'Book value is ₱28 per share and ₱27 of NAV; rising bond yields'), areit);
    expect(result.invented).toBe(2);
  });

  it('counts a value stated for a null field as invented', () => {
    const noRoic = withContext(areit, { roic: null });
    const result = gradeNumbers(areitThesis, noRoic);
    expect(result.invented).toBe(1);
    expect(result.notes[0]).toContain('roic');
  });

  it('does not read a multiple after "trades at" as the price', () => {
    const text = areitThesis.replace('the stock trades at a P/E of 13.6x', 'the stock trades at 13.6x earnings');
    expect(gradeNumbers(text, areit).pass).toBe(true);
  });
});
