import { describe, it, expect } from 'vitest';
import { findBySymbol, type PseCompanySearchResult } from '../../../shared/pse-edge';

const row = (cmpyId: string, symbol: string, cmpyNm = symbol): PseCompanySearchResult => ({ cmpyId, cmpyNm, symbol, etfYn: '0' });

describe('findBySymbol', () => {
  it('picks the exact symbol even when it is not the first fuzzy hit (AC)', () => {
    const results = [row('233', 'ACEN'), row('48', 'ACE'), row('121', 'ACR'), row('57', 'AC', 'Ayala Corporation')];
    expect(findBySymbol(results, 'AC')?.cmpyId).toBe('57');
  });

  it('picks LFM over LPC (LFM Properties)', () => {
    const results = [row('698', 'LPC', 'LFM Properties Corporation'), row('227', 'LFM', 'Liberty Flour Mills, Inc.')];
    expect(findBySymbol(results, 'lfm')?.cmpyId).toBe('227');
  });

  it('returns null when no exact symbol match', () => {
    expect(findBySymbol([row('233', 'ACEN')], 'AC')).toBeNull();
  });
});
