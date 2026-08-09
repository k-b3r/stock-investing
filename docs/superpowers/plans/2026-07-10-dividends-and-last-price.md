# Dividends + Last Price Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show last traded price in the stock page header, dividend yield as a MetricStrip card, a DPS history tab in FinancialTabs, and a DPS growth column in the screener.

**Architecture:** DPS data already lives in `keyMetrics.annual.incomeStatementList.dividentPerShare` (Morningstar's typo — match exactly) in the `financials` table. `transformFinancials` extracts it into `tabs.dividends.dps` and computes `summary.dpsGrowth`. Last price is fetched at render time from PSE Edge via a new server-side module. Dividend yield (latestDPS ÷ lastPrice × 100) is computed in the stock page server component and passed as a prop.

**Tech Stack:** TypeScript, Next.js 14 App Router, Vitest, native `fetch` + regex for PSE Edge scraping, Shadcn/ui Tabs, existing MetricCard/MetricTable/FinancialTabs components.

## Global Constraints

- Use `pnpm` not `npm` for all commands
- All PSE Edge scraping is server-side only — never import `pse-edge.ts` from a client component
- Use `null` (not `undefined`) for missing values
- Morningstar spells the field `dividentPerShare` — match exactly in interfaces
- Test runner: `cd app && pnpm test`
- Branch: `feat/dividends-last-price` — create before any code changes

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `app/src/lib/types/financials.ts` | Modify | Add `dpsGrowth` to `SummaryMetrics`; add `dividends` tab to `FinancialTabs` |
| `app/src/service/financials.ts` | Modify | Add `dividentPerShare` to `IncomeRow`; extract DPS series + compute `dpsGrowth` |
| `app/src/service/__fixtures__/bdo.ts` | Modify | Add `dividentPerShare` to income rows |
| `app/src/service/financials.test.ts` | Modify | Add DPS extraction and growth tests |
| `app/src/lib/pse-edge.ts` | Create | `getLastPrice(ticker): Promise<number \| null>` |
| `app/src/app/stock/[ticker]/page.tsx` | Modify | Fetch price in parallel; show in header; compute + pass `dividendYield` |
| `app/src/components/dashboard/MetricStrip.tsx` | Modify | Accept `dividendYield` prop; add Dividend Yield MetricCard |
| `app/src/components/dashboard/FinancialTabs.tsx` | Modify | Add Dividends tab with DPS history table |
| `app/src/app/screener/page.tsx` | Modify | Extract `dpsGrowth` from `summary` |
| `app/src/components/screener/ScreenerTable.tsx` | Modify | Add `dpsGrowth` column to `ScreenerRow` and table |

---

### Task 1: Extract DPS from financials — types, service, tests

**Files:**
- Modify: `app/src/lib/types/financials.ts`
- Modify: `app/src/service/financials.ts`
- Modify: `app/src/service/__fixtures__/bdo.ts`
- Modify: `app/src/service/financials.test.ts`

**Interfaces:**
- Produces: `SummaryMetrics.dpsGrowth: GrowthMetric`; `FinancialTabs.dividends.dps: YearDataPoint[]`

- [ ] **Step 1: Create feature branch**

```bash
git checkout -b feat/dividends-last-price
```

- [ ] **Step 2: Update types**

In `app/src/lib/types/financials.ts`, make these two changes:

Add `dpsGrowth` to `SummaryMetrics`:
```typescript
export interface SummaryMetrics {
  roic: number | null;
  epsGrowth: GrowthMetric;
  revenueGrowth: GrowthMetric;
  netIncomeGrowth: GrowthMetric;
  fcfGrowth: GrowthMetric;
  bookValueGrowth: number | null;
  debtEquity: number | null;
  dpsGrowth: GrowthMetric;
}
```

Add `dividends` to `FinancialTabs`:
```typescript
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
  dividends: {
    dps: YearDataPoint[];
  };
}
```

- [ ] **Step 3: Update `IncomeRow` interface and `transformFinancials` in `app/src/service/financials.ts`**

Change `IncomeRow` (around line 46) to add `dividentPerShare`:
```typescript
interface IncomeRow {
  fiscalPeriodYearMonth: string;
  basicEPS: number | null;
  revenue: number | null;
  netIncome: number | null;
  dividentPerShare: number | null;
}
```

In `transformFinancials`, after `const netIncomeGrowth = ...` line, add:
```typescript
const dpsGrowth = computeGrowthMetricFromValues(
  annualIncome.map((r) => toEntry(r.dividentPerShare, r.fiscalPeriodYearMonth))
);
```

In the `summary` return object, add `dpsGrowth`:
```typescript
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
```

In the `tabs` return object, add `dividends` after `cashFlow`:
```typescript
dividends: {
  dps: annualIncome.map((r) => toYDP(yearFromYM(r.fiscalPeriodYearMonth), r.dividentPerShare)),
},
```

- [ ] **Step 4: Add `dividentPerShare` to BDO fixture**

In `app/src/service/__fixtures__/bdo.ts`, update the three income rows (use real BDO DPS values from DB: 2015 has no data → null, 2016 → 0.883856, 2024 → 3.75):

```typescript
'keyMetrics.annual': {
  incomeStatementList: {
    dataList: [
      { fiscalPeriodYearMonth: '2015-12', basicEPS: 5.45, revenue: 85.19, netIncome: 24.68, revenueGrowthPer: 9.83, dividentPerShare: null },
      { fiscalPeriodYearMonth: '2016-12', basicEPS: 5.89, revenue: 92.4, netIncome: 26.04, revenueGrowthPer: 8.46, dividentPerShare: 0.883856 },
      { fiscalPeriodYearMonth: '2024-12', basicEPS: 9.47, revenue: 185.2, netIncome: 51.3, revenueGrowthPer: -2.84, dividentPerShare: 3.75 },
    ],
  },
  balanceSheetList: { dataList: [] },
  cashFlowList: { dataList: [] },
},
```

- [ ] **Step 5: Write failing DPS tests**

Add these tests to `app/src/service/financials.test.ts` inside a new `describe('DPS / dividends', ...)` block after the existing tests:

```typescript
describe('DPS / dividends', () => {
  it('extracts dps series from BDO fixture', () => {
    const f = transformFinancials(bdoRaw);
    expect(f.tabs.dividends.dps).toEqual([
      { year: '2015', value: null },
      { year: '2016', value: 0.883856 },
      { year: '2024', value: 3.75 },
    ]);
  });

  it('computes dpsGrowth — skips null, uses CAGR from first positive in window', () => {
    const f = transformFinancials(bdoRaw);
    const g = f.summary.dpsGrowth;
    // pts: [{v: 0.883856, y: 2016}, {v: 3.75, y: 2024}]
    // YoY: (3.75 - 0.883856) / 0.883856 * 100 ≈ 324.2
    // 3Y/5Y windows (2021–2024, 2019–2024): no point in range → null
    // 10Y window (2014–2024): first = 2016, years = 8
    //   (3.75/0.883856)^(1/8) - 1 ≈ 19.8%
    expect(r(g.yearOverYear)).toBe(324.2);
    expect(g.threeYearAvg).toBeNull();
    expect(g.fiveYearAvg).toBeNull();
    expect(r(g.tenYearAvg)).toBe(19.8);
  });

  it('dpsGrowth is all-null when no positive DPS values', () => {
    const raw = {
      ...bdoRaw,
      data: {
        ...bdoRaw.data,
        'keyMetrics.annual': {
          incomeStatementList: {
            dataList: [
              { fiscalPeriodYearMonth: '2022-12', basicEPS: 1, revenue: 1, netIncome: 1, revenueGrowthPer: 0, dividentPerShare: null },
              { fiscalPeriodYearMonth: '2023-12', basicEPS: 1, revenue: 1, netIncome: 1, revenueGrowthPer: 0, dividentPerShare: null },
            ],
          },
          balanceSheetList: { dataList: [] },
          cashFlowList: { dataList: [] },
        },
      },
    };
    const f = transformFinancials(raw as typeof bdoRaw);
    expect(f.summary.dpsGrowth).toEqual({ tenYearAvg: null, fiveYearAvg: null, threeYearAvg: null, yearOverYear: null });
  });
});
```

- [ ] **Step 6: Run tests — expect failures (DPS tests will fail, existing tests may fail due to TypeScript)**

```bash
cd app && pnpm test 2>&1 | tail -20
```

Expected: TypeScript compile errors or test failures on the new DPS tests.

- [ ] **Step 7: Run tests — expect all pass**

After implementing Steps 2–4:
```bash
cd app && pnpm test 2>&1 | tail -20
```

Expected output:
```
✓ src/service/financials.test.ts (34 tests)
Test Files  1 passed
Tests       34 passed
```

- [ ] **Step 8: Commit**

```bash
git add app/src/lib/types/financials.ts app/src/service/financials.ts app/src/service/__fixtures__/bdo.ts app/src/service/financials.test.ts
git commit -m "extract dps from incomeStatementList; add dpsGrowth to summary and dividends tab"
```

---

### Task 2: PSE Edge last price scraper

**Files:**
- Create: `app/src/lib/pse-edge.ts`

**Interfaces:**
- Produces: `getLastPrice(ticker: string): Promise<number | null>`

- [ ] **Step 1: Create `app/src/lib/pse-edge.ts`**

```typescript
// app/src/lib/pse-edge.ts
// Server-side only — never import from a client component

const BASE = 'https://edge.pse.com.ph';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://edge.pse.com.ph/',
};

async function getCmpyId(ticker: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${BASE}/autoComplete/searchCompanyNameSymbol.ax?term=${encodeURIComponent(ticker)}`,
      { headers: HEADERS, next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const data = await res.json() as { cmpyId: string }[];
    return data[0]?.cmpyId ?? null;
  } catch {
    return null;
  }
}

export async function getLastPrice(ticker: string): Promise<number | null> {
  try {
    const cmpyId = await getCmpyId(ticker);
    if (!cmpyId) return null;

    const res = await fetch(
      `${BASE}/companyPage/stockData.do?cmpy_id=${cmpyId}`,
      { headers: HEADERS, next: { revalidate: 300 } }
    );
    if (!res.ok) return null;

    const html = await res.text();
    // HTML: <th>Last Traded Price</th><td style="...">253.00</td>
    const match = html.match(/Last Traded Price<\/th>\s*<td[^>]*>\s*([\d,]+(?:\.\d+)?)/);
    if (!match) return null;

    const price = parseFloat(match[1].replace(/,/g, ''));
    return isNaN(price) ? null : price;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Smoke test the scraper**

```bash
cd app && node --loader tsx/esm -e "
import { getLastPrice } from './src/lib/pse-edge.ts';
getLastPrice('MBT').then(p => console.log('MBT last price:', p));
"
```

Expected: `MBT last price: <some number e.g. 82.50>` (not null)

If that doesn't work, try:
```bash
cd app && npx tsx -e "
import { getLastPrice } from './src/lib/pse-edge.ts';
getLastPrice('MBT').then(p => console.log('MBT last price:', p));
"
```

- [ ] **Step 3: Commit**

```bash
git add app/src/lib/pse-edge.ts
git commit -m "add PSE Edge last price scraper"
```

---

### Task 3: Stock page — price in header + dividend yield in MetricStrip

**Files:**
- Modify: `app/src/app/stock/[ticker]/page.tsx`
- Modify: `app/src/components/dashboard/MetricStrip.tsx`

**Interfaces:**
- Consumes: `getLastPrice(ticker): Promise<number | null>` from `@/lib/pse-edge`
- Consumes: `financials.tabs.dividends.dps: YearDataPoint[]` from Task 1
- Consumes: `financials.summary.dpsGrowth: GrowthMetric` from Task 1

- [ ] **Step 1: Update stock page to fetch price and compute yield**

Replace the content of `app/src/app/stock/[ticker]/page.tsx` with:

```typescript
export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getFinancials } from '@/storage/financials';
import { transformFinancials } from '@/service/financials';
import { getLastPrice } from '@/lib/pse-edge';
import { MetricStrip } from '@/components/dashboard/MetricStrip';
import { FinancialTabs } from '@/components/dashboard/FinancialTabs';

interface Props {
  params: Promise<{ ticker: string }>;
}

export default async function StockPage({ params }: Props) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();

  const [raw, lastPrice] = await Promise.all([
    getFinancials(upper),
    getLastPrice(upper),
  ]);

  if (!raw) notFound();

  const financials = transformFinancials(raw);

  const latestDps = financials.tabs.dividends.dps.findLast((d) => d.value !== null)?.value ?? null;
  const dividendYield = latestDps && lastPrice ? (latestDps / lastPrice) * 100 : null;

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">
            {upper}
            {lastPrice && (
              <span className="ml-3 text-xl font-normal text-muted-foreground">
                ₱{lastPrice.toFixed(2)}
              </span>
            )}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">PSE-listed · Morningstar data</p>
        </div>
        <MetricStrip financials={financials} dividendYield={dividendYield} />
        <FinancialTabs financials={financials} />
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Update MetricStrip to accept dividendYield and show Dividend Yield card**

In `app/src/components/dashboard/MetricStrip.tsx`, change the `Props` interface:
```typescript
interface Props {
  financials: TransformedFinancials;
  dividendYield?: number | null;
}
```

Change the function signature:
```typescript
export function MetricStrip({ financials, dividendYield = null }: Props) {
```

Add the Dividend Yield card at the end of the `metrics` array (after `Debt / Equity`):
```typescript
{
  label: 'Dividend Yield',
  value: dividendYield,
  threshold: classifyMetric('growth', dividendYield) as ReturnType<typeof classifyMetric>,
  sparkData: tabs.dividends.dps,
  unit: '%',
},
```

- [ ] **Step 3: Verify in browser — load `/stock/MBT`**

```bash
cd app && pnpm dev
```

Open http://localhost:3000/stock/MBT. Verify:
- Header shows `MBT  ₱82.50` (or whatever the live price is)
- MetricStrip shows a "Dividend Yield" card with a value (not N/A, assuming MBT pays dividends)
- Sparkline on Dividend Yield card shows DPS history bars

- [ ] **Step 4: Commit**

```bash
git add app/src/app/stock/\[ticker\]/page.tsx app/src/components/dashboard/MetricStrip.tsx
git commit -m "add last price to stock page header and dividend yield to MetricStrip"
```

---

### Task 4: Dividends tab in FinancialTabs

**Files:**
- Modify: `app/src/components/dashboard/FinancialTabs.tsx`

**Interfaces:**
- Consumes: `financials.tabs.dividends.dps: YearDataPoint[]` from Task 1

- [ ] **Step 1: Add Dividends tab to FinancialTabs**

In `app/src/components/dashboard/FinancialTabs.tsx`, add the dividends rows after `cashFlowRows`:

```typescript
const dividendRows: MetricRow[] = [
  { label: 'Dividends / Share (₱)', data: tabs.dividends.dps, format: fmt.abs },
];
```

In the `<Tabs>` JSX, add a new trigger and content (after `cashflow`):

```tsx
<TabsList>
  <TabsTrigger value="growth">Growth</TabsTrigger>
  <TabsTrigger value="profitability">Profitability</TabsTrigger>
  <TabsTrigger value="health">Financial Health</TabsTrigger>
  <TabsTrigger value="cashflow">Cash Flow</TabsTrigger>
  <TabsTrigger value="dividends">Dividends</TabsTrigger>
</TabsList>

{/* existing TabsContent blocks ... */}

<TabsContent value="dividends" className="mt-4">
  <MetricTable rows={dividendRows} />
</TabsContent>
```

- [ ] **Step 2: Verify in browser**

With dev server running, open http://localhost:3000/stock/MBT.
- Click "Dividends" tab — should show a table with DPS per year
- Values should match: MBT 2024-12 = ₱5.00, 2025-12 = ₱5.00

- [ ] **Step 3: Commit**

```bash
git add app/src/components/dashboard/FinancialTabs.tsx
git commit -m "add Dividends tab with DPS history to FinancialTabs"
```

---

### Task 5: Screener — DPS growth column

**Files:**
- Modify: `app/src/components/screener/ScreenerTable.tsx`
- Modify: `app/src/app/screener/page.tsx`

**Interfaces:**
- Consumes: `summary.dpsGrowth: GrowthMetric` from Task 1

- [ ] **Step 1: Add `dpsGrowth` to `ScreenerRow` and column definitions**

In `app/src/components/screener/ScreenerTable.tsx`, update `ScreenerRow`:

```typescript
export interface ScreenerRow {
  ticker: string;
  roic: number | null;
  epsGrowth: number | null;
  revenueGrowth: number | null;
  niGrowth: number | null;
  fcfGrowth: number | null;
  bvGrowth: number | null;
  debtEquity: number | null;
  dpsGrowth: number | null;
  score: number;
}
```

In `COLS`, add `dpsGrowth` after `bvGrowth`:
```typescript
const COLS: { key: Col; label: string; unit: string }[] = [
  { key: 'score',         label: '★ Score',        unit: ''  },
  { key: 'roic',          label: 'ROIC',            unit: '%' },
  { key: 'epsGrowth',     label: 'EPS Growth',      unit: '%' },
  { key: 'revenueGrowth', label: 'Rev Growth',      unit: '%' },
  { key: 'niGrowth',      label: 'NI Growth',       unit: '%' },
  { key: 'fcfGrowth',     label: 'FCF Growth',      unit: '%' },
  { key: 'bvGrowth',      label: 'BV Growth',       unit: '%' },
  { key: 'dpsGrowth',     label: 'DPS Growth',      unit: '%' },
  { key: 'debtEquity',    label: 'D/E',             unit: 'x' },
];
```

- [ ] **Step 2: Update screener page to include dpsGrowth**

In `app/src/app/screener/page.tsx`, update the `partial` object inside the `flatMap`:

```typescript
const dpsGrowth = summary.dpsGrowth;
const dpsPeriod = dpsGrowth.tenYearAvg ?? dpsGrowth.fiveYearAvg ?? dpsGrowth.threeYearAvg ?? null;

const partial = {
  ticker: raw.ticker,
  roic: summary.roic,
  epsGrowth: period ?? null,
  revenueGrowth: revPeriod ?? null,
  niGrowth: niPeriod ?? null,
  fcfGrowth: fcfPeriod ?? null,
  bvGrowth: summary.bookValueGrowth,
  debtEquity: summary.debtEquity,
  dpsGrowth: dpsPeriod,
};
```

- [ ] **Step 3: Verify in browser**

Open http://localhost:3000/screener. Verify:
- New "DPS Growth" column is visible and sortable
- Companies with consistent dividends show a positive CAGR (e.g. BDO ≈ 19.8%, MBT ≈ varies)
- Companies that don't pay dividends show N/A
- Sorting by DPS Growth works (nulls sort to bottom)

- [ ] **Step 4: Commit**

```bash
git add app/src/components/screener/ScreenerTable.tsx app/src/app/screener/page.tsx
git commit -m "add DPS growth column to screener"
```

---

### Final: Push + open PR

- [ ] **Push branch**

```bash
git push -u origin feat/dividends-last-price
```

- [ ] **Open PR**

```bash
gh pr create \
  --title "feat: dividends — last price, yield, DPS history tab, screener column" \
  --body "$(cat <<'EOF'
## Summary

- Shows last traded price (from PSE Edge) in stock page header
- Adds Dividend Yield MetricCard (latestDPS ÷ lastPrice) to MetricStrip
- Adds Dividends tab with DPS-per-year history table to FinancialTabs
- Adds sortable DPS Growth column (10Y CAGR) to screener

## Test plan

- [ ] Load `/stock/MBT` — header shows ₱price; Dividend Yield card shows a value
- [ ] Click Dividends tab — DPS per year table renders correctly
- [ ] `/screener` — DPS Growth column visible, sortable, nulls at bottom
- [ ] `cd app && pnpm test` passes (34 tests)
- [ ] `pnpm build` succeeds (no TS errors)
EOF
)"
```

---

## Self-Review

**Spec coverage:**
- ✅ Last price in header → Task 3
- ✅ Dividend yield in MetricStrip → Task 3
- ✅ DPS history tab → Task 4
- ✅ DPS growth column in screener → Task 5
- ✅ Tests for DPS extraction → Task 1

**Placeholder scan:** None found — all steps include full code.

**Type consistency:**
- `dpsGrowth: GrowthMetric` defined in types (Task 1) → used in screener page (Task 5) ✅
- `tabs.dividends.dps: YearDataPoint[]` defined in types (Task 1) → used in MetricStrip (Task 3) and FinancialTabs (Task 4) ✅
- `dividendYield: number | null` — computed inline in page.tsx, passed as prop — no type gap ✅
- `getLastPrice` defined in Task 2, imported in Task 3 ✅
