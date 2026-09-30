import { describe, expect, it } from 'vitest';
import { gradeNaHandling } from './na-handling.ts';
import { areit, areitThesis, withContext } from './fixtures.ts';

const noValuation = withContext(areit, { stickerPrice: null, mosPrice: null, roic: null });

describe('gradeNaHandling', () => {
  it('does not apply when no field is null', () => {
    expect(gradeNaHandling(areitThesis, areit)).toBeNull();
  });

  it('passes when null fields are described as unavailable', () => {
    const text = areitThesis
      .replace('ROIC of 5.9% is modest', 'ROIC is not available')
      .replace(/about 17% below the Sticker Price of ₱45\.20 but well above the MOS price of ₱22\.60/, 'and no Sticker Price can be computed')
      .replace('toward ₱22.60', 'much further')
      .replace('Trades 66% above the MOS price of ₱22.60', 'No Sticker Price or MOS price available');
    const result = gradeNaHandling(text, noValuation);
    expect(result?.notes).toEqual([]);
    expect(result?.pass).toBe(true);
  });

  it('fails for each null field given a value', () => {
    const result = gradeNaHandling(areitThesis, noValuation);
    expect(result?.pass).toBe(false);
    expect(result?.checks).toEqual({ roic: false, stickerPrice: false, mosPrice: false });
  });
});
