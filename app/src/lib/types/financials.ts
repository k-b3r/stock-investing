export interface RawFinancials {
  ticker: string;
  performance_id: string | null;
  data: Record<string, unknown>;
  scraped_at: string;
}

export interface GrowthMetric {
  tenYearAvg: number | null;
  fiveYearAvg: number | null;
  threeYearAvg: number | null;
  yearOverYear: number | null;
}

export interface SummaryMetrics {
  roic: number | null;
  epsGrowth: GrowthMetric;
  revenueGrowth: GrowthMetric;
  netIncomeGrowth: GrowthMetric;
  fcfGrowth: GrowthMetric;
  bookValueGrowth: number | null;
  debtEquity: number | null;
}

export type ThresholdResult = 'green' | 'yellow' | 'red' | 'neutral';
export type MetricCategory = 'growth' | 'roic' | 'debtEquity';

export interface YearDataPoint {
  year: string;
  value: number | null;
}

export interface FinancialTabs {
  growth: {
    eps: YearDataPoint[];
    revenue: YearDataPoint[];
    netIncome: YearDataPoint[];
    epsGrowthPct: YearDataPoint[];
    revenueGrowthPct: YearDataPoint[];
    netIncomeGrowthPct: YearDataPoint[];
  };
  profitability: {
    roe: YearDataPoint[];
    roa: YearDataPoint[];
    roic: YearDataPoint[];
  };
  financialHealth: {
    debtEquity: YearDataPoint[];
    currentRatio: YearDataPoint[];
    bookValuePerShare: YearDataPoint[];
  };
  cashFlow: {
    fcfGrowth: YearDataPoint[];
    operatingCFGrowth: YearDataPoint[];
    fcfToNetIncome: YearDataPoint[];
  };
}

export interface TransformedFinancials {
  ticker: string;
  scrapedAt: string;
  summary: SummaryMetrics;
  tabs: FinancialTabs;
}
