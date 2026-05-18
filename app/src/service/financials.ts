// app/src/service/financials.ts
import type {
  RawFinancials,
  TransformedFinancials,
  GrowthMetric,
  YearDataPoint,
} from '@/lib/types/financials';

// --- type aliases for raw JSONB rows ---

interface GrowthPerRow {
  tenYearAvg: number | null;
  fiveYearAvg: number | null;
  threeYearAvg: number | null;
  yearOverYear: number | null;
}

interface GrowthDataRow {
  fiscalPeriodYearMonth: string;
  epsPer: GrowthPerRow;
  revenuePer: GrowthPerRow;
  netIncomePer: GrowthPerRow;
}

interface ProfitabilityRow {
  fiscalPeriodYear: string;
  roe: number | null;
  roa: number | null;
  roic: number | null;
}

interface HealthRow {
  fiscalPeriodYearMonth: string;
  debtEquityRatio: number | null;
  bookValuePerShare: number | null;
  currentRatio: number | null;
}

interface CashFlowRow {
  fiscalPeriodYearMonth: string;
  freeCashFlowGrowthPer: number | null;
  operatingCFGrowthPer: number | null;
  freeCashFlowPerNetIncome: number | null;
}

interface IncomeRow {
  fiscalPeriodYearMonth: string;
  basicEPS: number | null;
  revenue: number | null;
  netIncome: number | null;
}

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

function computeGrowthMetricFromValues(values: (number | null)[]): GrowthMetric {
  // Build indexed list of non-null values; index = year offset (consecutive rows = 1 year apart)
  const pts: { v: number; i: number }[] = [];
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (v !== null) pts.push({ v, i });
  }
  if (pts.length < 2) return { tenYearAvg: null, fiveYearAvg: null, threeYearAvg: null, yearOverYear: null };

  const last = pts[pts.length - 1];
  const secondLast = pts[pts.length - 2];

  // YoY: simple % change between two most-recent non-null values
  const yoy = secondLast.v !== 0
    ? ((last.v - secondLast.v) / Math.abs(secondLast.v)) * 100
    : null;

  // CAGR over windowYears: find the non-null point closest to `windowYears` back from last
  function windowCagr(windowYears: number): number | null {
    const targetIdx = last.i - windowYears;
    // pick the point at or before targetIdx (or oldest available)
    let first = pts[0];
    for (let j = pts.length - 2; j >= 0; j--) {
      if (pts[j].i <= targetIdx) { first = pts[j]; break; }
    }
    const years = last.i - first.i;
    if (years <= 0 || first.v <= 0 || last.v <= 0) return null;
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
  const data = raw.data as {
    growth: { dataList: GrowthDataRow[] };
    profitability: { dataList: ProfitabilityRow[] };
    financialHealth: { dataList: HealthRow[] };
    cashFlow: { dataList: CashFlowRow[] };
    'keyMetrics.annual': {
      incomeStatementList: { dataList: IncomeRow[] };
    };
  };

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

  const epsGrowth = computeGrowthMetricFromValues(annualIncome.map((r) => r.basicEPS));
  const revenueGrowth = computeGrowthMetricFromValues(annualIncome.map((r) => r.revenue));
  const netIncomeGrowth = computeGrowthMetricFromValues(annualIncome.map((r) => r.netIncome));

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
    summary: {
      roic,
      epsGrowth,
      revenueGrowth,
      netIncomeGrowth,
      fcfGrowth,
      bookValueGrowth,
      debtEquity,
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
    },
  };
}
