export interface GrowthPerRow {
  tenYearAvg: number | null;
  fiveYearAvg: number | null;
  threeYearAvg: number | null;
  yearOverYear: number | null;
}

export interface GrowthDataRow {
  fiscalPeriodYearMonth: string;
  epsPer: GrowthPerRow;
  revenuePer: GrowthPerRow;
  netIncomePer: GrowthPerRow;
  operatingIncome?: GrowthPerRow;
}

export interface ProfitabilityRow {
  fiscalPeriodYear: string;
  roe: number | null;
  roa: number | null;
  roic: number | null;
  assetsTurnover?: number | null;
}

export interface HealthRow {
  fiscalPeriodYearMonth: string;
  debtEquityRatio: number | null;
  bookValuePerShare: number | null;
  currentRatio: number | null;
}

export interface CashFlowRow {
  fiscalPeriodYearMonth: string;
  freeCashFlowGrowthPer: number | null;
  operatingCFGrowthPer: number | null;
  freeCashFlowPerNetIncome: number | null;
}

export interface IncomeRow {
  fiscalPeriodYearMonth: string;
  basicEPS: number | null;
  revenue: number | null;
  netIncome: number | null;
  dividentPerShare: number | null;
  revenueGrowthPer?: number | null;
}

export interface RawFinancialsData {
  growth: { dataList: GrowthDataRow[]; currency?: string };
  profitability: { dataList: ProfitabilityRow[] };
  financialHealth: { dataList: HealthRow[] };
  cashFlow: { dataList: CashFlowRow[] };
  'keyMetrics.annual': {
    incomeStatementList: { dataList: IncomeRow[] };
    balanceSheetList?: { dataList: unknown[] };
    cashFlowList?: { dataList: unknown[] };
  };
}

export interface RawFinancials {
  ticker: string;
  performance_id: string | null;
  data: RawFinancialsData;
  scraped_at: string;
}
