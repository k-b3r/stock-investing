import { describe, expect, it } from 'vitest';
import { gradeConsistency, gradePriceShift, gradeVerdict, modalVerdict } from './verdict.ts';
import { areit, areitThesis, withContext } from './fixtures.ts';

const withVerdict = (v: string) => areitThesis.replace('---VERDICT---\n\nwatch', `---VERDICT---\n\n${v}`);

describe('gradeVerdict', () => {
  it('passes watch/pass between MOS and Sticker Price', () => {
    expect(gradeVerdict(areitThesis, areit).pass).toBe(true);
    expect(gradeVerdict(withVerdict('pass'), areit).pass).toBe(true);
  });

  it('fails buy above the MOS price', () => {
    const result = gradeVerdict(withVerdict('buy'), areit);
    expect(result.pass).toBe(false);
    expect(result.notes).toEqual(['verdict buy, mos-to-sticker allows watch/pass']);
  });

  it('allows buy at or below MOS', () => {
    expect(gradeVerdict(withVerdict('buy'), withContext(areit, { lastPrice: 20 })).pass).toBe(true);
  });

  it("uses the case's allowedVerdicts", () => {
    const passOnly = { ...areit, expect: { ...areit.expect, allowedVerdicts: ['pass' as const] } };
    expect(gradeVerdict(areitThesis, passOnly).pass).toBe(false);
  });

  it('allows only watch/pass without a price', () => {
    const noPrice = withContext(areit, { lastPrice: null });
    expect(noPrice.expect.band).toBe('no-price');
    expect(gradeVerdict(withVerdict('buy'), noPrice).pass).toBe(false);
    expect(gradeVerdict(areitThesis, noPrice).pass).toBe(true);
  });

  it('fails a missing verdict', () => {
    expect(gradeVerdict(withVerdict('hold'), areit).pass).toBe(false);
  });
});

describe('gradePriceShift', () => {
  it('passes when a lower price moves the verdict toward buy', () => {
    expect(gradePriceShift({ price: 36.8, verdict: 'watch' }, { price: 20, verdict: 'buy' }).pass).toBe(true);
  });

  it('passes when a higher price moves the verdict toward pass', () => {
    expect(gradePriceShift({ price: 36.8, verdict: 'watch' }, { price: 60, verdict: 'pass' }).pass).toBe(true);
  });

  it('fails when the verdict does not move or moves the wrong way', () => {
    expect(gradePriceShift({ price: 36.8, verdict: 'watch' }, { price: 20, verdict: 'watch' }).pass).toBe(false);
    expect(gradePriceShift({ price: 36.8, verdict: 'watch' }, { price: 20, verdict: 'pass' }).pass).toBe(false);
  });

  it('fails when a verdict is missing', () => {
    expect(gradePriceShift({ price: 36.8, verdict: null }, { price: 20, verdict: 'buy' }).pass).toBe(false);
  });
});

describe('gradeConsistency', () => {
  it('needs at least 2 runs', () => {
    expect(gradeConsistency(['watch'])).toBeNull();
  });

  it('passes identical verdicts', () => {
    expect(gradeConsistency(['watch', 'watch', 'watch'])?.pass).toBe(true);
  });

  it('fails mixed or missing verdicts', () => {
    expect(gradeConsistency(['watch', 'pass', 'watch'])?.notes).toEqual(['verdicts: watch, pass, watch']);
    expect(gradeConsistency([null, null])?.pass).toBe(false);
  });
});

describe('modalVerdict', () => {
  it('picks the most common verdict, null on a tie', () => {
    expect(modalVerdict(['watch', 'pass', 'watch'])).toBe('watch');
    expect(modalVerdict(['watch', 'pass'])).toBeNull();
    expect(modalVerdict([null])).toBeNull();
  });
});
