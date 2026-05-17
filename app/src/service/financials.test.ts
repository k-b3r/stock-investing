// app/src/service/financials.test.ts
import { describe, it, expect } from 'vitest';
import { transformFinancials } from './financials';
import { bdoRaw } from './__fixtures__/bdo';

describe('transformFinancials', () => {
  it('returns ticker and scrapedAt', () => {
    const result = transformFinancials(bdoRaw);
    expect(result.ticker).toBe('BDO');
    expect(result.scrapedAt).toBe(bdoRaw.scraped_at);
  });

  it('extracts EPS growth from most recent annual row with non-null avgs (2024-12)', () => {
    const { summary } = transformFinancials(bdoRaw);
    expect(summary.epsGrowth.tenYearAvg).toBeCloseTo(11.94, 2);
    expect(summary.epsGrowth.fiveYearAvg).toBeCloseTo(13.07, 2);
    expect(summary.epsGrowth.threeYearAvg).toBeCloseTo(24.22, 2);
    expect(summary.epsGrowth.yearOverYear).toBeCloseTo(11.65, 2);
  });

  it('extracts Revenue growth from most recent annual row', () => {
    const { summary } = transformFinancials(bdoRaw);
    expect(summary.revenueGrowth.tenYearAvg).toBeCloseTo(11.59, 2);
    expect(summary.revenueGrowth.yearOverYear).toBeCloseTo(-2.84, 2);
  });

  it('extracts Net Income growth from most recent annual row', () => {
    const { summary } = transformFinancials(bdoRaw);
    expect(summary.netIncomeGrowth.tenYearAvg).toBeCloseTo(13.66, 2);
  });

  it('returns null ROIC for banks (all annual roic rows are null)', () => {
    const { summary } = transformFinancials(bdoRaw);
    expect(summary.roic).toBeNull();
  });

  it('filters out 5-Yr and Index rows when extracting ROIC', () => {
    // The "5-Yr" row has roic: 0 — it must NOT be used
    const { summary } = transformFinancials(bdoRaw);
    expect(summary.roic).toBeNull(); // not 0
  });

  it('extracts debtEquity from most recent annual financialHealth row', () => {
    const { summary } = transformFinancials(bdoRaw);
    expect(summary.debtEquity).toBeCloseTo(0.489, 3);
  });

  it('filters out Latest Qtr from financialHealth', () => {
    // Latest Qtr has debtEquityRatio: 0.4903 — must not be used
    const { summary } = transformFinancials(bdoRaw);
    expect(summary.debtEquity).toBeCloseTo(0.489, 3); // 2024-12 value
  });

  it('computes FCF growth averages from annual cashFlow rows', () => {
    const { summary } = transformFinancials(bdoRaw);
    // Annual non-null freeCashFlowGrowthPer values: 12.5, 8.2, -3.1, 6.4, -15.2, 20.1, 5.3, 11.8, 7.6
    // yearOverYear = last annual = 7.6 (2024-12)
    expect(summary.fcfGrowth.yearOverYear).toBeCloseTo(7.6, 1);
    // threeYearAvg = avg(5.3, 11.8, 7.6) = 8.233...
    expect(summary.fcfGrowth.threeYearAvg).toBeCloseTo(8.23, 1);
    // last 5 annual rows: 2020, 2021, 2022, 2023, 2024 → -15.2, 20.1, 5.3, 11.8, 7.6 → avg = 6.0
    expect(summary.fcfGrowth.fiveYearAvg).toBeCloseTo(6.0, 0);
    // tenYearAvg = avg of all non-null: 12.5+8.2-3.1+6.4-15.2+20.1+5.3+11.8+7.6=53.6 / 9 = 5.96
    expect(summary.fcfGrowth.tenYearAvg).toBeCloseTo(5.96, 0);
  });

  it('filters out TTM from cashFlow when computing FCF avgs', () => {
    const { summary } = transformFinancials(bdoRaw);
    // TTM has freeCashFlowGrowthPer: null anyway, but it must be excluded positionally
    expect(summary.fcfGrowth.yearOverYear).toBeCloseTo(7.6, 1); // not null from TTM
  });

  it('computes bookValue CAGR using calendar year span (not entry count)', () => {
    const { summary } = transformFinancials(bdoRaw);
    // BV: 40.76 (2015) → 110.5 (2024), yearSpan = 9
    // CAGR = (110.5/40.76)^(1/9) - 1 ≈ 11.75%
    expect(summary.bookValueGrowth).toBeCloseTo(11.75, 0);
  });

  describe('tabs.growth', () => {
    it('maps incomeStatementList to YearDataPoint arrays', () => {
      const { tabs } = transformFinancials(bdoRaw);
      expect(tabs.growth.eps).toHaveLength(3);
      expect(tabs.growth.eps[0]).toEqual({ year: '2015', value: 5.45 });
      expect(tabs.growth.eps[2]).toEqual({ year: '2024', value: 9.47 });
    });

    it('maps revenue from incomeStatementList', () => {
      const { tabs } = transformFinancials(bdoRaw);
      expect(tabs.growth.revenue[0]).toEqual({ year: '2015', value: 85.19 });
    });

    it('maps netIncome from incomeStatementList', () => {
      const { tabs } = transformFinancials(bdoRaw);
      expect(tabs.growth.netIncome[0]).toEqual({ year: '2015', value: 24.68 });
    });
  });

  describe('tabs.profitability', () => {
    it('maps annual profitability rows only (excludes 5-Yr and Index)', () => {
      const { tabs } = transformFinancials(bdoRaw);
      expect(tabs.profitability.roe).toHaveLength(3); // 2015, 2016, 2024
      expect(tabs.profitability.roe[0]).toEqual({ year: '2015', value: 13.42 });
    });

    it('maps roic (null for banks)', () => {
      const { tabs } = transformFinancials(bdoRaw);
      expect(tabs.profitability.roic[0]).toEqual({ year: '2015', value: null });
    });
  });

  describe('tabs.financialHealth', () => {
    it('maps annual financialHealth rows only (excludes Latest Qtr)', () => {
      const { tabs } = transformFinancials(bdoRaw);
      expect(tabs.financialHealth.debtEquity).toHaveLength(3); // 2015, 2016, 2024
      expect(tabs.financialHealth.debtEquity[2]).toEqual({ year: '2024', value: 0.489 });
    });

    it('maps bookValuePerShare', () => {
      const { tabs } = transformFinancials(bdoRaw);
      expect(tabs.financialHealth.bookValuePerShare[0]).toEqual({ year: '2015', value: 40.76 });
    });
  });

  describe('tabs.cashFlow', () => {
    it('maps annual cashFlow rows only (excludes TTM)', () => {
      const { tabs } = transformFinancials(bdoRaw);
      expect(tabs.cashFlow.fcfGrowth).toHaveLength(10); // 2015–2024, no TTM
      expect(tabs.cashFlow.fcfGrowth[0]).toEqual({ year: '2015', value: null });
      expect(tabs.cashFlow.fcfGrowth[1]).toEqual({ year: '2016', value: 12.5 });
    });
  });
});
