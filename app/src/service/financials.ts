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
  const bvs = annualHealthRows
    .map((r) => r.bookValuePerShare)
    .filter((v): v is number => v !== null);
  if (bvs.length < 2) return null;
  const first = bvs[0];
  const last = bvs[bvs.length - 1];
  const years = bvs.length - 1;
  return ((last / first) ** (1 / years) - 1) * 100;
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
  const annualGrowth = data.growth.dataList.filter((r) => isAnnualYM(r.fiscalPeriodYearMonth));
  const annualProfit = data.profitability.dataList.filter((r) => isAnnualYear(r.fiscalPeriodYear));
  const annualHealth = data.financialHealth.dataList.filter((r) =>
    isAnnualYM(r.fiscalPeriodYearMonth)
  );
  const annualCF = data.cashFlow.dataList.filter((r) => isAnnualYM(r.fiscalPeriodYearMonth));
  const annualIncome = data['keyMetrics.annual'].incomeStatementList.dataList.filter((r) =>
    isAnnualYM(r.fiscalPeriodYearMonth)
  );

  // --- summary: growth avgs from most recent annual row where tenYearAvg is non-null ---
  const latestGrowthRow = [...annualGrowth]
    .reverse()
    .find((r) => r.epsPer.tenYearAvg !== null) ?? annualGrowth[annualGrowth.length - 1];

  const epsGrowth: GrowthMetric = latestGrowthRow?.epsPer ?? {
    tenYearAvg: null, fiveYearAvg: null, threeYearAvg: null, yearOverYear: null,
  };
  const revenueGrowth: GrowthMetric = latestGrowthRow?.revenuePer ?? {
    tenYearAvg: null, fiveYearAvg: null, threeYearAvg: null, yearOverYear: null,
  };
  const netIncomeGrowth: GrowthMetric = latestGrowthRow?.netIncomePer ?? {
    tenYearAvg: null, fiveYearAvg: null, threeYearAvg: null, yearOverYear: null,
  };

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
