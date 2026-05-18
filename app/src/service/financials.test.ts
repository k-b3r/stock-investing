// app/src/service/financials.test.ts
import { describe, it, expect } from 'vitest';
import { computeGrowthMetricFromValues, transformFinancials } from './financials';
import { bdoRaw } from './__fixtures__/bdo';

// Helper: round to N decimal places
const r = (v: number | null, d = 1) => (v === null ? null : parseFloat(v.toFixed(d)));

// Helper: build entries from parallel value/year arrays
const entries = (values: (number | null)[], startYear = 2015) =>
  values.map((value, i) => ({ value, year: startYear + i }));

// ---------------------------------------------------------------------------
// computeGrowthMetricFromValues — unit tests
// ---------------------------------------------------------------------------

describe('computeGrowthMetricFromValues', () => {
  describe('null / empty / insufficient data', () => {
    it('all null → all null', () => {
      const g = computeGrowthMetricFromValues(entries([null, null, null]));
      expect(g).toEqual({ tenYearAvg: null, fiveYearAvg: null, threeYearAvg: null, yearOverYear: null });
    });

    it('all zero → all null', () => {
      const g = computeGrowthMetricFromValues(entries([0, 0, 0]));
      expect(g).toEqual({ tenYearAvg: null, fiveYearAvg: null, threeYearAvg: null, yearOverYear: null });
    });

    it('single positive value → all null (need ≥2 pts)', () => {
      const g = computeGrowthMetricFromValues(entries([null, 1.5, null]));
      expect(g).toEqual({ tenYearAvg: null, fiveYearAvg: null, threeYearAvg: null, yearOverYear: null });
    });
  });

  describe('YoY', () => {
    it('simple 20% growth', () => {
      const g = computeGrowthMetricFromValues(entries([1.0, 1.2]));
      expect(r(g.yearOverYear)).toBe(20.0);
    });

    it('-25% decline', () => {
      const g = computeGrowthMetricFromValues(entries([2.0, 1.5]));
      expect(r(g.yearOverYear)).toBe(-25.0);
    });

    it('uses two most-recent positive values (skips trailing zeros/nulls)', () => {
      // last two positive values are 1.0 (2017) and 1.3 (2018)
      const g = computeGrowthMetricFromValues(entries([null, 0, 1.0, 1.3, 0, null]));
      expect(r(g.yearOverYear)).toBe(30.0);
    });
  });

  describe('CAGR windows', () => {
    it('10Y CAGR: double in 10 years = 7.18% pa', () => {
      // 11 values → 10-year span: 1.0 (2015) → 2.0 (2025)
      // CAGR = 2^(1/10) - 1 ≈ 7.177%
      const vals = [1.0, 1.07, 1.15, 1.23, 1.32, 1.41, 1.51, 1.62, 1.74, 1.87, 2.0];
      const g = computeGrowthMetricFromValues(entries(vals, 2015));
      expect(r(g.tenYearAvg, 2)).toBeCloseTo(7.18, 1);
    });

    it('3Y < 5Y < 10Y when early growth faster than recent', () => {
      // fast early, slow recent: 3Y CAGR < 5Y < 10Y
      const vals = [1.0, 2.0, 3.5, 5.0, 6.5, 7.5, 8.0, 8.4, 8.7, 9.0, 9.2];
      const g = computeGrowthMetricFromValues(entries(vals, 2015));
      expect(g.tenYearAvg!).toBeGreaterThan(g.fiveYearAvg!);
      expect(g.fiveYearAvg!).toBeGreaterThan(g.threeYearAvg!);
    });

    it('3Y > 5Y > 10Y when recent growth faster than early', () => {
      // slow early, fast recent: 3Y > 5Y > 10Y
      const vals = [1.0, 1.05, 1.10, 1.15, 1.20, 1.30, 1.60, 2.10, 3.00, 4.50, 7.0];
      const g = computeGrowthMetricFromValues(entries(vals, 2015));
      expect(g.threeYearAvg!).toBeGreaterThan(g.fiveYearAvg!);
      expect(g.fiveYearAvg!).toBeGreaterThan(g.tenYearAvg!);
    });

    it('uses calendar year span, not array index', () => {
      // 2015 and 2025 (gap in between) — 10-year CAGR, not 1-year
      const g = computeGrowthMetricFromValues([
        { value: 1.0, year: 2015 },
        { value: 2.0, year: 2025 },
      ]);
      // CAGR(1.0→2.0, 10yr) ≈ 7.18%
      expect(r(g.tenYearAvg, 1)).toBeCloseTo(7.2, 0);
    });
  });

  describe('zeros / nulls at start (small-base problem)', () => {
    it('skips leading zeros — starts CAGR from first positive year', () => {
      // EPS: 0,0,0,0,0,0.13,0.18,0.24,0.28,0.30 → starts from 0.13 (2020)
      // 10Y window start = 2024-10 = 2014, oldest in window = 2020 (year=2020)
      // CAGR(0.13→0.30, 4yr) = (0.30/0.13)^(1/4)-1 ≈ 23.3%
      const vals = [0, 0, 0, 0, 0, 0.13, 0.18, 0.24, 0.28, 0.30];
      const g = computeGrowthMetricFromValues(entries(vals, 2015));
      expect(r(g.tenYearAvg, 1)).toBeCloseTo(23.3, 0);
      // Must not be 1000%+
      expect(g.tenYearAvg!).toBeLessThan(200);
    });

    it('skips leading nulls identically to zeros', () => {
      const withZeros = computeGrowthMetricFromValues(entries([0, 0, 0, 0, 0, 0.13, 0.18, 0.24, 0.28, 0.30], 2015));
      const withNulls = computeGrowthMetricFromValues(entries([null, null, null, null, null, 0.13, 0.18, 0.24, 0.28, 0.30], 2015));
      expect(r(withZeros.tenYearAvg)).toBe(r(withNulls.tenYearAvg));
    });

    it('returns null for window when no positive start exists within it', () => {
      // Only 1 year of positive data (last year) — no prior point → all windows null except if same pt used
      const g = computeGrowthMetricFromValues(entries([0, 0, 0, 0, 0, 0, 0, 0, 0, 1.0], 2015));
      // secondLast is 0 (filtered out) → only 1 positive pt → all null
      expect(g).toEqual({ tenYearAvg: null, fiveYearAvg: null, threeYearAvg: null, yearOverYear: null });
    });
  });

  describe('real-world examples', () => {
    it('CNVRG Net Income 2018–2024: ~43% CAGR', () => {
      // From table: 1.26, 1.57, 3.39, 7.16, 7.44, 9.10, 10.81
      const ni = [1.26, 1.57, 3.39, 7.16, 7.44, 9.10, 10.81];
      const g = computeGrowthMetricFromValues(entries(ni, 2018));
      // 6yr CAGR: (10.81/1.26)^(1/6)-1 ≈ 43.1%
      expect(r(g.tenYearAvg, 1)).toBeCloseTo(43.1, 0);
      // 3Y: oldest in window [2021,2024) = 7.16 (2021); CAGR(7.16→10.81, 3yr) ≈ 14.8%
      expect(r(g.threeYearAvg, 1)).toBeCloseTo(14.8, 0);
      // Recent growth slower than long-term
      expect(g.threeYearAvg!).toBeLessThan(g.tenYearAvg!);
    });

    it('BNCOM EPS 2021–2025: ~30% CAGR from first real EPS', () => {
      // Null for 2016-2020, then 0.82, 1.24, 1.86, 1.98, 2.32
      const eps = [null, null, null, null, null, 0.819185, 1.24, 1.86, 1.98, 2.32];
      const g = computeGrowthMetricFromValues(entries(eps, 2016));
      // 4yr CAGR: (2.32/0.819)^(1/4)-1 ≈ 29.7%
      expect(r(g.tenYearAvg, 0)).toBeCloseTo(30, 0);
      // Not 1000%+ from a zero base
      expect(g.tenYearAvg!).toBeLessThan(200);
      // YoY: (2.32-1.98)/1.98 ≈ 17.2%
      expect(r(g.yearOverYear, 1)).toBeCloseTo(17.2, 0);
    });

    it('negative EPS years are excluded from CAGR base', () => {
      // Loss year (negative) followed by recovery — CAGR starts from first positive
      const eps = [-0.5, -0.2, 0.10, 0.25, 0.50, 0.80, 1.20];
      const g = computeGrowthMetricFromValues(entries(eps, 2018));
      // 5Y window start = 2024-5 = 2019; first positive in window: 0.10 (2020)
      // Actually first positive overall is 0.10 at year 2020
      // 5Y: (1.20/0.10)^(1/4)-1 ≈ 85.9%
      expect(g.fiveYearAvg).not.toBeNull();
      expect(g.fiveYearAvg!).toBeGreaterThan(0);
      // No negative CAGR from using a loss year as base
    });
  });
});

// ---------------------------------------------------------------------------
// transformFinancials — integration tests
// ---------------------------------------------------------------------------

describe('transformFinancials (BDO fixture)', () => {
  it('returns ticker and scrapedAt', () => {
    const result = transformFinancials(bdoRaw);
    expect(result.ticker).toBe('BDO');
    expect(result.scrapedAt).toBe(bdoRaw.scraped_at);
  });

  it('returns null ROIC for banks', () => {
    const { summary } = transformFinancials(bdoRaw);
    expect(summary.roic).toBeNull();
  });

  it('does not use 5-Yr aggregate row for ROIC', () => {
    const { summary } = transformFinancials(bdoRaw);
    expect(summary.roic).toBeNull(); // not 0 (from the 5-Yr row)
  });

  it('extracts debtEquity from most recent annual health row (2024-12)', () => {
    const { summary } = transformFinancials(bdoRaw);
    expect(summary.debtEquity).toBeCloseTo(0.489, 3);
  });

  it('excludes Latest Qtr from debtEquity', () => {
    const { summary } = transformFinancials(bdoRaw);
    expect(summary.debtEquity).not.toBeCloseTo(0.4903, 3);
  });

  it('computes FCF growth averages from annual cashFlow rows', () => {
    const { summary } = transformFinancials(bdoRaw);
    expect(r(summary.fcfGrowth.yearOverYear)).toBe(7.6);
    expect(r(summary.fcfGrowth.threeYearAvg, 2)).toBeCloseTo(8.23, 1);
    expect(r(summary.fcfGrowth.fiveYearAvg, 1)).toBeCloseTo(6.0, 0);
    expect(r(summary.fcfGrowth.tenYearAvg, 1)).toBeCloseTo(5.96, 0);
  });

  it('excludes TTM from FCF averages', () => {
    const { summary } = transformFinancials(bdoRaw);
    expect(summary.fcfGrowth.yearOverYear).toBeCloseTo(7.6, 1); // not null from TTM
  });

  it('computes bookValue CAGR using calendar year span', () => {
    // BV: 40.76 (2015) → 110.5 (2024), yearSpan = 9
    // CAGR = (110.5/40.76)^(1/9)-1 ≈ 11.75%
    const { summary } = transformFinancials(bdoRaw);
    expect(r(summary.bookValueGrowth, 1)).toBeCloseTo(11.75, 0);
  });

  describe('EPS/Revenue/NI growth via CAGR', () => {
    it('EPS growth: 10Y CAGR from 2015 to 2024 (9-year span)', () => {
      // Fixture: EPS 5.45 (2015) → 5.89 (2016) → 9.47 (2024)
      // 10Y window: oldest in window (last.year-10=2014) = 2015 (year=2015)
      // CAGR(5.45→9.47, 9yr) = (9.47/5.45)^(1/9)-1 ≈ 6.3%
      const { summary } = transformFinancials(bdoRaw);
      expect(r(summary.epsGrowth.tenYearAvg, 1)).toBeCloseTo(6.3, 0);
    });

    it('Revenue growth: 10Y CAGR 2015→2024', () => {
      // 85.19 → 185.2 over 9 years ≈ 9.0% CAGR
      const { summary } = transformFinancials(bdoRaw);
      expect(r(summary.revenueGrowth.tenYearAvg, 1)).toBeCloseTo(9.0, 0);
    });

    it('Net Income growth: 10Y CAGR 2015→2024', () => {
      // 24.68 → 51.3 over 9 years ≈ 8.5% CAGR
      const { summary } = transformFinancials(bdoRaw);
      expect(r(summary.netIncomeGrowth.tenYearAvg, 1)).toBeCloseTo(8.5, 0);
    });
  });

  describe('tabs', () => {
    it('growth.eps maps income rows to YearDataPoints', () => {
      const { tabs } = transformFinancials(bdoRaw);
      expect(tabs.growth.eps).toHaveLength(3);
      expect(tabs.growth.eps[0]).toEqual({ year: '2015', value: 5.45 });
      expect(tabs.growth.eps[2]).toEqual({ year: '2024', value: 9.47 });
    });

    it('profitability excludes 5-Yr and Index rows', () => {
      const { tabs } = transformFinancials(bdoRaw);
      expect(tabs.profitability.roe).toHaveLength(3); // 2015, 2016, 2024
      expect(tabs.profitability.roe[0]).toEqual({ year: '2015', value: 13.42 });
    });

    it('financialHealth excludes Latest Qtr', () => {
      const { tabs } = transformFinancials(bdoRaw);
      expect(tabs.financialHealth.debtEquity).toHaveLength(3);
      expect(tabs.financialHealth.debtEquity[2]).toEqual({ year: '2024', value: 0.489 });
    });

    it('cashFlow excludes TTM', () => {
      const { tabs } = transformFinancials(bdoRaw);
      expect(tabs.cashFlow.fcfGrowth).toHaveLength(10);
      expect(tabs.cashFlow.fcfGrowth[0]).toEqual({ year: '2015', value: null });
      expect(tabs.cashFlow.fcfGrowth[1]).toEqual({ year: '2016', value: 12.5 });
    });
  });
});
