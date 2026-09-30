import { describe, expect, it } from 'vitest';
import { buildDataBlock, type TickerContext } from '../../scripts/thesis-context.ts';
import { findFigureMentions, plantCurrencyError, plantSizeError, roundingNonError } from './mutations.ts';

const ctx = {
  ticker: 'AREIT', companyName: 'AREIT, Inc.', sector: 'Property', subsector: 'Property', description: null,
  roic: 5.86, epsGrowth: 17.46, revenueGrowth: 43.14, netIncomeGrowth: 50.7, fcfGrowth: null, bookValueGrowth: 24.88,
  debtEquity: 0.0094, lastPrice: 37.5, pe: 13.38, pb: 1.01, peg: 0.77, dividendYield: 6.44,
  stickerPrice: 45.2, mosPrice: 22.6, disclosures: [], news: [],
} satisfies TickerContext;
const dataBlock = buildDataBlock(ctx);
const thesis = 'AREIT trades at ₱37.50, a P/E of 13.4x, with ROIC of 5.9% and revenue growth of 43.1% against a sticker price of ₱45.20. Shares 1,200 units.';

describe('findFigureMentions', () => {
  it('finds figures that restate one source field at the thesis precision', () => {
    const found = findFigureMentions(thesis, ctx).map((m) => [m.field, m.text]);
    expect(found).toEqual([['lastPrice', '₱37.50'], ['pe', '13.4x'], ['roic', '5.9%'], ['revenueGrowth', '43.1%'], ['stickerPrice', '₱45.20']]);
  });

  it('matches a less precise restatement but not a wrong one or the wrong unit', () => {
    expect(findFigureMentions('ROIC near 6%', { ...ctx, dividendYield: null }).map((m) => m.field)).toEqual(['roic']);
    expect(findFigureMentions('ROIC of 7%', ctx)).toEqual([]);
    expect(findFigureMentions('priced at 37.5x', ctx)).toEqual([]);
  });

  it('skips a figure that matches more than one field', () => {
    const same = { ...ctx, pe: 6.44, dividendYield: null, pb: 6.4 };
    expect(findFigureMentions('trades at 6.4x', same)).toEqual([]);
  });
});

describe('plantSizeError', () => {
  it('doubles a small figure and records the source line and match', () => {
    const roic = findFigureMentions(thesis, ctx).find((m) => m.field === 'roic')!;
    const { thesis: mutated, record } = plantSizeError(thesis, dataBlock, roic)!;
    expect(mutated).toContain('ROIC of 11.8%');
    expect(record).toMatchObject({ type: 'size', match: ['11.8'], sourceQuote: '- ROIC: 5.9%', trueValue: 'ROIC 5.9%' });
    expect(record.claim).toContain('11.8%');
    expect(record.original).toContain('5.9%');
    expect(mutated.replace(record.claim, record.original)).toBe(thesis);
  });

  it('halves a large figure', () => {
    const big = findFigureMentions('priced at ₱982.00 today', { ...ctx, lastPrice: 982 })[0];
    expect(plantSizeError('priced at ₱982.00 today', dataBlock, big)!.thesis).toBe('priced at ₱491.00 today');
  });
});

describe('plantCurrencyError', () => {
  it('restates a peso price in US dollars', () => {
    const price = findFigureMentions(thesis, ctx)[0];
    const { thesis: mutated, record } = plantCurrencyError(thesis, dataBlock, price);
    expect(mutated).toContain('trades at US$37.50,');
    expect(record.sourceQuote).toBe('- Current Price: ₱37.50');
  });
});

describe('roundingNonError', () => {
  it('drops a decimal when the result stays within 1.5% of the source', () => {
    const rev = findFigureMentions(thesis, ctx).find((m) => m.field === 'revenueGrowth')!;
    expect(roundingNonError(thesis, rev)!.thesis).toContain('revenue growth of 43%');
  });

  it('refuses rounding that moves the figure more than 1.5%', () => {
    const roic = findFigureMentions(thesis, ctx).find((m) => m.field === 'roic')!;
    expect(roundingNonError(thesis, roic)).toBeNull();
  });
});
