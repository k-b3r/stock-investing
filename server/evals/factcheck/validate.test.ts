import { describe, expect, it } from 'vitest';
import { applyEdits, validatePlanted } from './validate.ts';
import type { PlantedError } from './types.ts';

const thesis = 'AREIT posts ROIC of 5.9% and trades above its MOS price. Incorporated in 2006.';
const dataBlock = '- ROIC: 5.9%\n- Current price is ABOVE MOS by 65.9%\nincorporated on September 4, 2006';
const good: PlantedError = {
  type: 'year',
  original: 'Incorporated in 2006.',
  claim: 'Incorporated in 2016.',
  trueValue: 'incorporated September 4, 2006',
  sourceQuote: 'incorporated on September 4, 2006',
  match: ['2016'],
};

describe('applyEdits', () => {
  it('applies edits in order', () => {
    expect(applyEdits('a b c', [{ find: 'b', replace: 'B', reason: '' }, { find: 'B c', replace: 'x', reason: '' }])).toBe('a x');
  });

  it('keeps $ patterns in the replacement literal', () => {
    expect(applyEdits('price ₱1', [{ find: '₱1', replace: "US$1 and $&", reason: '' }])).toBe('price US$1 and $&');
  });

  it('rejects a find that is missing or ambiguous', () => {
    expect(() => applyEdits('a a', [{ find: 'a', replace: 'b', reason: '' }])).toThrow('occurs 2 times');
    expect(() => applyEdits('a', [{ find: 'z', replace: 'b', reason: '' }])).toThrow('occurs 0 times');
  });
});

describe('validatePlanted', () => {
  it('accepts a well-formed planted error', () => {
    expect(validatePlanted(good, thesis, dataBlock)).toEqual([]);
  });

  it('rejects an original not found once in the thesis', () => {
    expect(validatePlanted({ ...good, original: 'Incorporated in 1999.' }, thesis, dataBlock)[0]).toContain('occurs 0 times');
  });

  it('rejects a source quote not verbatim in the data block', () => {
    expect(validatePlanted({ ...good, sourceQuote: 'founded 2006' }, thesis, dataBlock)[0]).toContain('sourceQuote');
  });

  it('rejects match strings missing from the claim or present in the source or clean thesis', () => {
    expect(validatePlanted({ ...good, match: ['1999'] }, thesis, dataBlock)).toEqual(['match "1999" not in claim']);
    const direction = { ...good, type: 'direction' as const, original: 'trades above its MOS price', claim: 'trades below its MOS price', match: ['below', 'MOS'] };
    expect(validatePlanted(direction, thesis, dataBlock)).toEqual(['match "MOS" appears in source']);
    expect(validatePlanted({ ...good, claim: 'Incorporated in 2016, ROIC 5.9%.', match: ['2016', 'roic'] }, thesis, dataBlock)).toEqual(['match "roic" appears in source']);
  });
});
