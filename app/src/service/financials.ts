// app/src/service/financials.ts
import type {
  RawFinancials,
  TransformedFinancials,
  GrowthMetric,
  YearDataPoint,
} from '@/lib/types/financials';
import type {
  GrowthDataRow,
  ProfitabilityRow,
  HealthRow,
  CashFlowRow,
} from '../../../shared/types/financials';

// --- helpers ---

function isAnnualYM(s: string): boolean {
  return /^\d{4}-\d{2}$/.test(s);
}

function isAnnualYear(s: string): boolean {
  return /^\d{4}$/.test(s);
}

function avgNonNull(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v !== null);
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

export function computeGrowthMetricFromValues(
  entries: { value: number | null; year: number }[]
): GrowthMetric {
  // Only positive values are meaningful for CAGR (exclude null and zero)
  const pts = entries
    .filter((e): e is { value: number; year: number } => e.value !== null && e.value > 0)
    .map((e) => ({ v: e.value, y: e.year }));

  if (pts.length < 2) return { tenYearAvg: null, fiveYearAvg: null, threeYearAvg: null, yearOverYear: null };

  const last = pts[pts.length - 1];
  const secondLast = pts[pts.length - 2];

  const yoy = ((last.v - secondLast.v) / secondLast.v) * 100;

  // CAGR: oldest positive value within the calendar-year window as the start
  function windowCagr(windowYears: number): number | null {
    const windowStart = last.y - windowYears;
    const first = pts.find((p) => p.y >= windowStart && p.y < last.y);
    if (!first) return null;
    const years = last.y - first.y;
    if (years <= 0) return null;
    return ((last.v / first.v) ** (1 / years) - 1) * 100;
  }

  return {
    yearOverYear: yoy,
    threeYearAvg: windowCagr(3),
    fiveYearAvg: windowCagr(5),
    tenYearAvg: windowCagr(10),
  };
}

function computeFcfGrowthAvgs(annualRows: CashFlowRow[]): GrowthMetric {
  const vals = annualRows.map((r) => r.freeCashFlowGrowthPer);
  const n = vals.length;
  return {
    yearOverYear: vals[n - 1] ?? null,
    threeYearAvg: avgNonNull(vals.slice(Math.max(0, n - 3))),
    fiveYearAvg: avgNonNull(vals.slice(Math.max(0, n - 5))),
    tenYearAvg: avgNonNull(vals.slice(Math.max(0, n - 10))),
  };
}

function computeBookValueGrowth(annualHealthRows: HealthRow[]): number | null {
  const withBV = annualHealthRows.filter(
    (r): r is HealthRow & { bookValuePerShare: number } => r.bookValuePerShare !== null
  );
  if (withBV.length < 2) return null;
  const first = withBV[0];
  const last = withBV[withBV.length - 1];
  const yearSpan =
    parseInt(last.fiscalPeriodYearMonth.slice(0, 4), 10) -
    parseInt(first.fiscalPeriodYearMonth.slice(0, 4), 10);
  if (yearSpan <= 0) return null;
  return ((last.bookValuePerShare / first.bookValuePerShare) ** (1 / yearSpan) - 1) * 100;
}

function toYDP(year: string, value: number | null): YearDataPoint {
  return { year, value };
}

// --- main export ---

export function transformFinancials(raw: RawFinancials): TransformedFinancials {
  const data = raw.data;

  const currency = data.growth?.currency ?? 'PHP';

  // --- filter to annual-only rows ---
  const annualGrowth = (data.growth?.dataList ?? []).filter((r) => isAnnualYM(r.fiscalPeriodYearMonth));
  const annualProfit = (data.profitability?.dataList ?? []).filter((r) => isAnnualYear(r.fiscalPeriodYear));
  const annualHealth = (data.financialHealth?.dataList ?? []).filter((r) =>
    isAnnualYM(r.fiscalPeriodYearMonth)
  );
  const annualCF = (data.cashFlow?.dataList ?? []).filter((r) => isAnnualYM(r.fiscalPeriodYearMonth));
  const annualIncome = (data['keyMetrics.annual']?.incomeStatementList?.dataList ?? []).filter((r) =>
    isAnnualYM(r.fiscalPeriodYearMonth)
  );

  const toEntry = (value: number | null, ym: string) => ({
    value,
    year: parseInt(ym.slice(0, 4), 10),
  });
  const epsGrowth = computeGrowthMetricFromValues(annualIncome.map((r) => toEntry(r.basicEPS, r.fiscalPeriodYearMonth)));
  const revenueGrowth = computeGrowthMetricFromValues(annualIncome.map((r) => toEntry(r.revenue, r.fiscalPeriodYearMonth)));
  const netIncomeGrowth = computeGrowthMetricFromValues(annualIncome.map((r) => toEntry(r.netIncome, r.fiscalPeriodYearMonth)));
  const dpsGrowth = computeGrowthMetricFromValues(annualIncome.map((r) => toEntry(r.dividentPerShare, r.fiscalPeriodYearMonth)));

  // --- summary: ROIC from most recent annual profitability row ---
  const latestProfit = annualProfit[annualProfit.length - 1];
  const roic = latestProfit?.roic ?? null;

  // --- summary: debt/equity from most recent annual health row ---
  const latestHealth = annualHealth[annualHealth.length - 1];
  const debtEquity = latestHealth?.debtEquityRatio ?? null;

  // --- summary: FCF growth avgs and book value CAGR ---
  const fcfGrowth = computeFcfGrowthAvgs(annualCF);
  const bookValueGrowth = computeBookValueGrowth(annualHealth);

  // --- tabs ---
  const yearFromYM = (ym: string) => ym.slice(0, 4);

  return {
    ticker: raw.ticker,
    scrapedAt: raw.scraped_at,
    currency,
    summary: {
      roic,
      epsGrowth,
      revenueGrowth,
      netIncomeGrowth,
      fcfGrowth,
      bookValueGrowth,
      debtEquity,
      dpsGrowth,
    },
    tabs: {
      growth: {
        eps: annualIncome.map((r) => toYDP(yearFromYM(r.fiscalPeriodYearMonth), r.basicEPS)),
        revenue: annualIncome.map((r) => toYDP(yearFromYM(r.fiscalPeriodYearMonth), r.revenue)),
        netIncome: annualIncome.map((r) => toYDP(yearFromYM(r.fiscalPeriodYearMonth), r.netIncome)),
        epsGrowthPct: annualGrowth.map((r) => toYDP(yearFromYM(r.fiscalPeriodYearMonth), r.epsPer.yearOverYear)),
        revenueGrowthPct: annualGrowth.map((r) => toYDP(yearFromYM(r.fiscalPeriodYearMonth), r.revenuePer.yearOverYear)),
        netIncomeGrowthPct: annualGrowth.map((r) => toYDP(yearFromYM(r.fiscalPeriodYearMonth), r.netIncomePer.yearOverYear)),
      },
      profitability: {
        roe: annualProfit.map((r) => toYDP(r.fiscalPeriodYear, r.roe)),
        roa: annualProfit.map((r) => toYDP(r.fiscalPeriodYear, r.roa)),
        roic: annualProfit.map((r) => toYDP(r.fiscalPeriodYear, r.roic)),
      },
      financialHealth: {
        debtEquity: annualHealth.map((r) =>
          toYDP(yearFromYM(r.fiscalPeriodYearMonth), r.debtEquityRatio)
        ),
        currentRatio: annualHealth.map((r) =>
          toYDP(yearFromYM(r.fiscalPeriodYearMonth), r.currentRatio)
        ),
        bookValuePerShare: annualHealth.map((r) =>
          toYDP(yearFromYM(r.fiscalPeriodYearMonth), r.bookValuePerShare)
        ),
      },
      cashFlow: {
        fcfGrowth: annualCF.map((r) =>
          toYDP(yearFromYM(r.fiscalPeriodYearMonth), r.freeCashFlowGrowthPer)
        ),
        operatingCFGrowth: annualCF.map((r) =>
          toYDP(yearFromYM(r.fiscalPeriodYearMonth), r.operatingCFGrowthPer)
        ),
        fcfToNetIncome: annualCF.map((r) =>
          toYDP(yearFromYM(r.fiscalPeriodYearMonth), r.freeCashFlowPerNetIncome)
        ),
      },
      dividends: {
        dps: annualIncome.map((r) => toYDP(yearFromYM(r.fiscalPeriodYearMonth), r.dividentPerShare)),
      },
    },
  };
}
