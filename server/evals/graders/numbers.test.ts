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
