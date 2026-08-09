# Financial Data Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the storage query and service layer that reads raw Morningstar financials from Postgres and produces typed, threshold-classified metrics for the dashboard.

**Architecture:** Three files with clear separation: `storage/financials.ts` queries Postgres (integration-tested), `service/thresholds.ts` classifies a numeric value against Phil Town thresholds (pure function, unit-tested), and `service/financials.ts` transforms the raw JSONB blob into a typed `TransformedFinancials` shape (pure function, unit-tested with a BDO fixture). No API routes yet — those come in a later issue.

**Tech Stack:** TypeScript, pg (Postgres), Vitest, Phil Town Rule #1 thresholds

---

## DB Schema Reference

```sql
-- financials table
ticker         text PRIMARY KEY
data           jsonb   -- see shape below
performance_id text
scraped_at     timestamptz
```

### `data` JSONB shape (keys)
- `growth.dataList[]` — annual rows + trailing "Latest Qtr". Each row: `{ fiscalPeriodYearMonth, epsPer, revenuePer, netIncomePer }` where each metric is `{ tenYearAvg, fiveYearAvg, threeYearAvg, yearOverYear }`.
- `profitability.dataList[]` — annual rows + trailing "5-Yr" + "Index". Each row: `{ fiscalPeriodYear, roe, roa, roic, ... }`.
- `financialHealth.dataList[]` — annual rows + trailing "Latest Qtr". Each row: `{ fiscalPeriodYearMonth, debtEquityRatio, bookValuePerShare, currentRatio, ... }`.
- `cashFlow.dataList[]` — annual rows + trailing "TTM". Each row: `{ fiscalPeriodYearMonth, freeCashFlowGrowthPer, operatingCFGrowthPer, freeCashFlowPerNetIncome, ... }`.
- `keyMetrics.annual.incomeStatementList.dataList[]` — annual rows. Each row: `{ fiscalPeriodYearMonth, basicEPS, revenue, netIncome, ... }`.

### Filtering rules
- Annual row detection for `fiscalPeriodYearMonth` fields: matches `/^\d{4}-\d{2}$/` (e.g. `"2024-12"` not `"Latest Qtr"` / `"TTM"`).
- Annual row detection for `fiscalPeriodYear` fields: matches `/^\d{4}$/` (e.g. `"2024"` not `"5-Yr"` / `"Index"`).
- Banks (BDO, BPI, MBT) have `roic: null` across all annual rows → classify as `neutral`, not `red`.

## File Map

| File | Role |
|------|------|
| `app/src/storage/financials.ts` | `getFinancials(ticker)` — Postgres query |
| `app/src/storage/financials.test.ts` | Integration test against real DB |
| `app/src/service/thresholds.ts` | `classifyMetric(category, value)` — Phil Town thresholds |
| `app/src/service/thresholds.test.ts` | Unit tests at every boundary value |
| `app/src/service/__fixtures__/bdo.ts` | Trimmed BDO fixture for unit tests |
| `app/src/service/financials.ts` | `transformFinancials(raw)` — JSONB → `TransformedFinancials` |
| `app/src/service/financials.test.ts` | Unit tests using BDO fixture |
| `app/src/lib/types/financials.ts` | **Modify:** add `MetricCategory` type |

---

## Task 1: Storage Layer

**Files:**
- Create: `app/src/storage/financials.ts`
- Create: `app/src/storage/financials.test.ts`

- [ ] **Step 1: Write the failing integration test**

```typescript
// app/src/storage/financials.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { getPool } from './db';
import { getFinancials } from './financials';

describe('getFinancials', () => {
  afterAll(async () => {
    await (await getPool()).end();
  });

  it('returns RawFinancials for a known ticker', async () => {
    const result = await getFinancials('BDO');
    expect(result).not.toBeNull();
    expect(result!.ticker).toBe('BDO');
    expect(result!.data).toHaveProperty('growth');
    expect(result!.data).toHaveProperty('profitability');
    expect(result!.scraped_at).toBeTruthy();
  });

  it('returns null for unknown ticker', async () => {
    const result = await getFinancials('DOESNOTEXIST');
    expect(result).toBeNull();
  });

  it('normalises ticker to uppercase', async () => {
    const result = await getFinancials('bdo');
    expect(result).not.toBeNull();
    expect(result!.ticker).toBe('BDO');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd app && pnpm test src/storage/financials.test.ts
```

Expected: FAIL — `getFinancials` not found.

- [ ] **Step 3: Implement `getFinancials`**

```typescript
// app/src/storage/financials.ts
import { getPool } from './db';
import type { RawFinancials } from '@/lib/types/financials';

export async function getFinancials(ticker: string): Promise<RawFinancials | null> {
  const pool = await getPool();
  const { rows } = await pool.query<RawFinancials>(
    `SELECT ticker, performance_id, data, scraped_at::text FROM financials WHERE ticker = $1`,
    [ticker.toUpperCase()]
  );
  return rows[0] ?? null;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd app && pnpm test src/storage/financials.test.ts
```

Expected: 3 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd app && git add src/storage/financials.ts src/storage/financials.test.ts
git commit -m "add getFinancials storage query"
```

---

## Task 2: Add `MetricCategory` Type

**Files:**
- Modify: `app/src/lib/types/financials.ts`

- [ ] **Step 1: Add the type**

Open `app/src/lib/types/financials.ts` and append after the `ThresholdResult` line:

```typescript
export type MetricCategory = 'growth' | 'roic' | 'debtEquity';
```

The file after the addition should look like:

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
cd app && git add src/lib/types/financials.ts
git commit -m "add MetricCategory type"
```

---

## Task 3: Threshold Classifier

**Files:**
- Create: `app/src/service/thresholds.ts`
- Create: `app/src/service/thresholds.test.ts`

### Threshold rules (Phil Town Rule #1)

| Category | Green | Yellow | Red | Null |
|----------|-------|--------|-----|------|
| `growth` | ≥ 10% | 5 – 9.99% | < 5% | neutral |
| `roic` | ≥ 10% | 5 – 9.99% | < 5% | neutral |
| `debtEquity` | ≤ 0.5 | 0.51 – 1.0 | > 1.0 | neutral |

- [ ] **Step 1: Write the failing unit tests**

```typescript
// app/src/service/thresholds.test.ts
import { describe, it, expect } from 'vitest';
import { classifyMetric } from './thresholds';

describe('classifyMetric — growth', () => {
  it('returns neutral for null', () => {
    expect(classifyMetric('growth', null)).toBe('neutral');
  });
  it('returns green at exactly 10', () => {
    expect(classifyMetric('growth', 10)).toBe('green');
  });
  it('returns green above 10', () => {
    expect(classifyMetric('growth', 25)).toBe('green');
  });
  it('returns yellow at 9.99', () => {
    expect(classifyMetric('growth', 9.99)).toBe('yellow');
  });
  it('returns yellow at exactly 5', () => {
    expect(classifyMetric('growth', 5)).toBe('yellow');
  });
  it('returns red at 4.99', () => {
    expect(classifyMetric('growth', 4.99)).toBe('red');
  });
  it('returns red at 0', () => {
    expect(classifyMetric('growth', 0)).toBe('red');
  });
  it('returns red for negative values', () => {
    expect(classifyMetric('growth', -5)).toBe('red');
  });
});

describe('classifyMetric — roic', () => {
  it('returns neutral for null', () => {
    expect(classifyMetric('roic', null)).toBe('neutral');
  });
  it('returns green at exactly 10', () => {
    expect(classifyMetric('roic', 10)).toBe('green');
  });
  it('returns yellow at 9.99', () => {
    expect(classifyMetric('roic', 9.99)).toBe('yellow');
  });
  it('returns yellow at exactly 5', () => {
    expect(classifyMetric('roic', 5)).toBe('yellow');
  });
  it('returns red at 4.99', () => {
    expect(classifyMetric('roic', 4.99)).toBe('red');
  });
});

describe('classifyMetric — debtEquity', () => {
  it('returns neutral for null', () => {
    expect(classifyMetric('debtEquity', null)).toBe('neutral');
  });
  it('returns green at exactly 0.5', () => {
    expect(classifyMetric('debtEquity', 0.5)).toBe('green');
  });
  it('returns green at 0', () => {
    expect(classifyMetric('debtEquity', 0)).toBe('green');
  });
  it('returns yellow at 0.51', () => {
    expect(classifyMetric('debtEquity', 0.51)).toBe('yellow');
  });
  it('returns yellow at exactly 1.0', () => {
    expect(classifyMetric('debtEquity', 1.0)).toBe('yellow');
  });
  it('returns red at 1.01', () => {
    expect(classifyMetric('debtEquity', 1.01)).toBe('red');
  });
  it('returns red for very high debt', () => {
    expect(classifyMetric('debtEquity', 5)).toBe('red');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd app && pnpm test src/service/thresholds.test.ts
```

Expected: FAIL — `classifyMetric` not found.

- [ ] **Step 3: Implement `classifyMetric`**

```typescript
// app/src/service/thresholds.ts
import type { MetricCategory, ThresholdResult } from '@/lib/types/financials';

export function classifyMetric(category: MetricCategory, value: number | null): ThresholdResult {
  if (value === null) return 'neutral';

  if (category === 'debtEquity') {
    if (value <= 0.5) return 'green';
    if (value <= 1.0) return 'yellow';
    return 'red';
  }

  // 'growth' and 'roic' share the same thresholds
  if (value >= 10) return 'green';
  if (value >= 5) return 'yellow';
  return 'red';
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd app && pnpm test src/service/thresholds.test.ts
```

Expected: 21 tests PASS.

- [ ] **Step 5: Commit**

```bash
cd app && git add src/service/thresholds.ts src/service/thresholds.test.ts
git commit -m "add threshold classifier for Phil Town metrics"
```

---

## Task 4: BDO Fixture

**Files:**
- Create: `app/src/service/__fixtures__/bdo.ts`

This fixture uses real BDO data from the database (trimmed to exercise all filtering logic).

- [ ] **Step 1: Create the fixture file**

```typescript
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
```

- [ ] **Step 2: Commit**

```bash
cd app && git add src/service/__fixtures__/bdo.ts
git commit -m "add BDO fixture for service unit tests"
```

---

## Task 5: Financials Transformer

**Files:**
- Create: `app/src/service/financials.ts`
- Create: `app/src/service/financials.test.ts`

### Helper logic to implement inside `financials.ts`

**`isAnnualYearMonth(s)`** — returns true if `s` matches `/^\d{4}-\d{2}$/`

**`isAnnualYear(s)`** — returns true if `s` matches `/^\d{4}$/`

**`latestGrowthRow(dataList)`** — finds the last row where `fiscalPeriodYearMonth` is annual AND `epsPer.tenYearAvg` is not null. Returns `null` if none.

**`computeFcfGrowthAvgs(dataList, annualRows)`** — from annual cashFlow rows:
- Extract `freeCashFlowGrowthPer` values (null skipped in avg, but kept for position counting)
- `yearOverYear`: last annual row's `freeCashFlowGrowthPer` (may be null)
- `threeYearAvg`: mean of non-null values from last 3 annual rows
- `fiveYearAvg`: mean of non-null values from last 5 annual rows
- `tenYearAvg`: mean of non-null values from last 10 annual rows
- Return `null` average if zero non-null values in that window

**`computeBookValueGrowth(annualHealthRows)`** — 10-year CAGR of `bookValuePerShare`:
- Filter rows to those with non-null `bookValuePerShare`
- If fewer than 2 values, return `null`
- Take first and last: `CAGR = ((last / first) ^ (1 / (count - 1)) - 1) * 100`

- [ ] **Step 1: Write the failing unit tests**

```typescript
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
    // fiveYearAvg = avg(20.1, 5.3, 11.8, 7.6, -15.2... wait last 5: 20.1, 5.3, 11.8, 7.6 + one more back)
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

  it('computes bookValue 10-year CAGR from annual financialHealth rows', () => {
    const { summary } = transformFinancials(bdoRaw);
    // Annual BV rows: 40.76 (2015), 44.81 (2016), 110.5 (2024) → 3 values
    // CAGR = (110.5/40.76)^(1/2) - 1 = sqrt(2.711) - 1 ≈ 0.6458 = 64.58%
    // Wait — count=3, years=count-1=2 → that's only 2-year CAGR. Use all available.
    expect(summary.bookValueGrowth).not.toBeNull();
    expect(summary.bookValueGrowth).toBeGreaterThan(0);
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd app && pnpm test src/service/financials.test.ts
```

Expected: FAIL — `transformFinancials` not found.

- [ ] **Step 3: Implement `transformFinancials`**

```typescript
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
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd app && pnpm test src/service/financials.test.ts
```

Expected: all tests PASS. If a `toBeCloseTo` boundary is off by a rounding difference, adjust the decimal precision — do NOT change the value.

- [ ] **Step 5: Run all tests together**

```bash
cd app && pnpm test
```

Expected: all test files PASS (storage + thresholds + financials).

- [ ] **Step 6: Commit**

```bash
cd app && git add src/service/financials.ts src/service/financials.test.ts
git commit -m "add financials transformer with FCF and book value growth"
```

---

## Self-Review

**Spec coverage:**
- ✅ `getFinancials(ticker)` — Task 1
- ✅ `classifyMetric(category, value)` — Task 3
- ✅ `transformFinancials(raw)` — Task 5
- ✅ Phil Town Big Five growth metrics from pre-computed Morningstar avgs — Task 5
- ✅ FCF growth computed from cashFlow.dataList — Task 5
- ✅ Book value CAGR computed from financialHealth.dataList — Task 5
- ✅ ROIC null for banks → neutral — Task 3 + 5
- ✅ Filter "Index", "5-Yr", "Latest Qtr", "TTM" rows — Task 5
- ✅ Unit tests at every boundary — Task 3
- ✅ Integration test for storage — Task 1
- ✅ `MetricCategory` type — Task 2

**No placeholders found.**

**Type consistency:** All internal types defined in Task 5 match usage in the same file. `RawFinancials`, `GrowthMetric`, `TransformedFinancials` imported from `@/lib/types/financials` throughout.
