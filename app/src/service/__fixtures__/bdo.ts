// app/src/service/__fixtures__/bdo.ts
import type { RawFinancials } from '@/lib/types/financials';

export const bdoRaw: RawFinancials = {
  ticker: 'BDO',
  performance_id: 'some-perf-id',
  scraped_at: '2025-01-01T00:00:00.000Z',
  data: {
    growth: {
      dataList: [
        // Annual rows with non-null avgs
        {
          fiscalPeriodYearMonth: '2016-12',
          epsPer: { tenYearAvg: 9.35, fiveYearAvg: 14.89, threeYearAvg: 4.54, yearOverYear: 3.22 },
          revenuePer: { tenYearAvg: 22.41, fiveYearAvg: 15.99, threeYearAvg: 12.11, yearOverYear: 19.61 },
          netIncomePer: { tenYearAvg: 23.63, fiveYearAvg: 19.9, threeYearAvg: 4.89, yearOverYear: 4.29 },
          operatingIncome: { tenYearAvg: null, fiveYearAvg: null, threeYearAvg: null, yearOverYear: null },
        },
        {
          fiscalPeriodYearMonth: '2023-12',
          epsPer: { tenYearAvg: 10.88, fiveYearAvg: 17.51, threeYearAvg: 37.57, yearOverYear: 28.92 },
          revenuePer: { tenYearAvg: 12.7, fiveYearAvg: 12.25, threeYearAvg: 11.19, yearOverYear: 20.64 },
          netIncomePer: { tenYearAvg: 12.5, fiveYearAvg: 17.55, threeYearAvg: 37.49, yearOverYear: 28.67 },
          operatingIncome: { tenYearAvg: null, fiveYearAvg: null, threeYearAvg: null, yearOverYear: null },
        },
        {
          // Most recent annual with avgs — transformer should use this
          fiscalPeriodYearMonth: '2024-12',
          epsPer: { tenYearAvg: 11.94, fiveYearAvg: 13.07, threeYearAvg: 24.22, yearOverYear: 11.65 },
          revenuePer: { tenYearAvg: 11.59, fiveYearAvg: 7.52, threeYearAvg: 9.79, yearOverYear: -2.84 },
          netIncomePer: { tenYearAvg: 13.66, fiveYearAvg: 13.16, threeYearAvg: 24.22, yearOverYear: 11.73 },
          operatingIncome: { tenYearAvg: null, fiveYearAvg: null, threeYearAvg: null, yearOverYear: null },
        },
        {
          // Future year — all nulls, must be skipped
          fiscalPeriodYearMonth: '2025-12',
          epsPer: { tenYearAvg: null, fiveYearAvg: null, threeYearAvg: null, yearOverYear: null },
          revenuePer: { tenYearAvg: null, fiveYearAvg: null, threeYearAvg: null, yearOverYear: null },
          netIncomePer: { tenYearAvg: null, fiveYearAvg: null, threeYearAvg: null, yearOverYear: null },
          operatingIncome: { tenYearAvg: null, fiveYearAvg: null, threeYearAvg: null, yearOverYear: null },
        },
        {
          // Non-annual row — must be filtered out
          fiscalPeriodYearMonth: 'Latest Qtr',
          epsPer: { tenYearAvg: null, fiveYearAvg: null, threeYearAvg: null, yearOverYear: 5.82 },
          revenuePer: { tenYearAvg: null, fiveYearAvg: null, threeYearAvg: null, yearOverYear: 10.2 },
          netIncomePer: { tenYearAvg: null, fiveYearAvg: null, threeYearAvg: null, yearOverYear: 6.12 },
          operatingIncome: { tenYearAvg: null, fiveYearAvg: null, threeYearAvg: null, yearOverYear: null },
        },
      ],
    },
    profitability: {
      dataList: [
        // Bank — ROIC is null for annual rows
        { fiscalPeriodYear: '2015', roa: 1.27, roe: 13.42, roic: null, assetsTurnover: 0.0437 },
        { fiscalPeriodYear: '2016', roa: 1.18, roe: 12.7, roic: null, assetsTurnover: 0.0468 },
        { fiscalPeriodYear: '2024', roa: 1.31, roe: 13.1, roic: null, assetsTurnover: 0.0501 },
        // Aggregate rows — must be filtered out
        { fiscalPeriodYear: '5-Yr', roa: 1.222, roe: 12.088, roic: 0, assetsTurnover: 0.0473 },
        { fiscalPeriodYear: 'Index', roa: null, roe: null, roic: null, assetsTurnover: null },
      ],
    },
    financialHealth: {
      dataList: [
        { fiscalPeriodYearMonth: '2015-12', debtEquityRatio: 0.555, bookValuePerShare: 40.76, currentRatio: null },
        { fiscalPeriodYearMonth: '2016-12', debtEquityRatio: 0.503, bookValuePerShare: 44.81, currentRatio: null },
        { fiscalPeriodYearMonth: '2024-12', debtEquityRatio: 0.489, bookValuePerShare: 110.5, currentRatio: null },
        // Non-annual — must be filtered
        { fiscalPeriodYearMonth: 'Latest Qtr', debtEquityRatio: 0.4903, bookValuePerShare: 112.91, currentRatio: null },
      ],
    },
    cashFlow: {
      dataList: [
        // Annual — first year has null growth (no prior year)
        { fiscalPeriodYearMonth: '2015-12', freeCashFlowGrowthPer: null, operatingCFGrowthPer: null, freeCashFlowPerNetIncome: -0.7951 },
        { fiscalPeriodYearMonth: '2016-12', freeCashFlowGrowthPer: 12.5, operatingCFGrowthPer: 8.3, freeCashFlowPerNetIncome: 0.42 },
        { fiscalPeriodYearMonth: '2017-12', freeCashFlowGrowthPer: 8.2, operatingCFGrowthPer: null, freeCashFlowPerNetIncome: 0.38 },
        { fiscalPeriodYearMonth: '2018-12', freeCashFlowGrowthPer: -3.1, operatingCFGrowthPer: 5.1, freeCashFlowPerNetIncome: -0.12 },
        { fiscalPeriodYearMonth: '2019-12', freeCashFlowGrowthPer: 6.4, operatingCFGrowthPer: null, freeCashFlowPerNetIncome: 0.31 },
        { fiscalPeriodYearMonth: '2020-12', freeCashFlowGrowthPer: -15.2, operatingCFGrowthPer: -10.1, freeCashFlowPerNetIncome: -0.55 },
        { fiscalPeriodYearMonth: '2021-12', freeCashFlowGrowthPer: 20.1, operatingCFGrowthPer: 18.3, freeCashFlowPerNetIncome: 0.61 },
        { fiscalPeriodYearMonth: '2022-12', freeCashFlowGrowthPer: 5.3, operatingCFGrowthPer: 4.2, freeCashFlowPerNetIncome: 0.28 },
        { fiscalPeriodYearMonth: '2023-12', freeCashFlowGrowthPer: 11.8, operatingCFGrowthPer: 9.7, freeCashFlowPerNetIncome: 0.44 },
        { fiscalPeriodYearMonth: '2024-12', freeCashFlowGrowthPer: 7.6, operatingCFGrowthPer: null, freeCashFlowPerNetIncome: 0.33 },
        // Non-annual — must be filtered
        { fiscalPeriodYearMonth: 'TTM', freeCashFlowGrowthPer: null, operatingCFGrowthPer: null, freeCashFlowPerNetIncome: 0.018 },
      ],
    },
    'keyMetrics.annual': {
      incomeStatementList: {
        dataList: [
          { fiscalPeriodYearMonth: '2015-12', basicEPS: 5.45, revenue: 85.19, netIncome: 24.68, revenueGrowthPer: 9.83 },
          { fiscalPeriodYearMonth: '2016-12', basicEPS: 5.89, revenue: 92.4, netIncome: 26.04, revenueGrowthPer: 8.46 },
          { fiscalPeriodYearMonth: '2024-12', basicEPS: 9.47, revenue: 185.2, netIncome: 51.3, revenueGrowthPer: -2.84 },
        ],
      },
      balanceSheetList: { dataList: [] },
      cashFlowList: { dataList: [] },
    },
  },
};
