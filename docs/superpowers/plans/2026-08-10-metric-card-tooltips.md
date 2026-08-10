# Metric Card Info Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `tooltip` (formula + explanation + threshold cutoffs) to each of the 11
`MetricStrip` cards that don't already have one — ROIC, EPS Growth, Revenue Growth, Net
Income Growth, FCF Growth, Book Value Growth, Debt/Equity, Dividend Yield, P/E, P/B, PEG.

**Architecture:** The `tooltip` prop and its rendering (info icon + hover popup) already
exist on `MetricCard` from the Sticker Price/MOS work. This is a pure data addition to the
`metrics` array literal in `MetricStrip.tsx` — one `tooltip: '...'` field per existing
entry, no component or logic changes.

**Tech Stack:** Next.js 14, TypeScript, React.

## Global Constraints

- No changes to `MetricCard.tsx` or `thresholds.ts` — the `tooltip` prop and threshold
  values already exist and are correct.
- Static text only, no real-number interpolation, except: EPS Growth, Revenue Growth, and
  Net Income Growth interpolate the component's existing `period` variable
  (`'3Y' | '5Y' | '10Y'`) into their tooltip string, since the toggle changes which CAGR
  window is shown.
- FCF Growth's tooltip says "average year-over-year growth" (not "compound annual growth
  rate") — it's computed differently from the CAGR-based growth metrics
  (`computeFcfGrowthAvgs` in `service/financials.ts`).
- Book Value Growth's tooltip explicitly notes it does NOT respond to the period toggle
  (`computeBookValueGrowth` always uses full available history) — this must be stated, not
  omitted, since the toggle visibly affects the other growth cards next to it.
- Exact tooltip copy (verbatim, from the design spec):
  ```
  ROIC:               "Return on Invested Capital: NOPAT ÷ Invested Capital. ≥10% green, ≥5% yellow, <5% red."
  EPS Growth:          `EPS compound annual growth rate over the selected ${period} period. ≥10% green, ≥5% yellow, <5% red.`
  Revenue Growth:      `Revenue compound annual growth rate over the selected ${period} period. ≥10% green, ≥5% yellow, <5% red.`
  Net Income Growth:   `Net Income compound annual growth rate over the selected ${period} period. ≥10% green, ≥5% yellow, <5% red.`
  FCF Growth:          `Free Cash Flow average year-over-year growth over the selected ${period} period. ≥10% green, ≥5% yellow, <5% red.`
  Book Value Growth:   "Book Value Per Share compound annual growth rate over the full available history (not affected by the period toggle above). ≥10% green, ≥5% yellow, <5% red."
  Debt / Equity:       "Total Debt ÷ Total Equity. ≤0.5x green, ≤1.0x yellow, >1.0x red."
  Dividend Yield:      "Annual Dividend Per Share ÷ Current Price × 100. ≥10% green, ≥5% yellow, <5% red."
  P/E:                 "Price ÷ Earnings Per Share. Lower means cheaper relative to earnings. ≤15x green, ≤25x yellow, >25x red."
  P/B:                 "Price ÷ Book Value Per Share. Lower means cheaper relative to net assets. ≤1.5x green, ≤3x yellow, >3x red."
  PEG:                 "P/E ÷ EPS Growth Rate. Below 1 suggests undervalued relative to growth. ≤1x green, ≤2x yellow, >2x red."
  ```
- No automated tests (matches existing convention — `MetricStrip.tsx` has none).
- Follow existing code style: no comments unless explaining non-obvious "why", 2-space
  indent, single quotes, semicolons.

---

### Task 1: Add tooltips to all 11 remaining metric cards

**Files:**
- Modify: `app/src/components/dashboard/MetricStrip.tsx`

**Interfaces:**
- Consumes: `MetricCard`'s existing `tooltip?: string` prop (already implemented, no
  changes needed) — each entry in the `metrics` array is spread onto a `<MetricCard {...m} />`
  via `metrics.map((m) => <MetricCard key={m.label} {...m} .../>)`, so adding a `tooltip`
  key to an array entry is sufficient for it to reach the component.
- Produces: nothing new — this task only adds data to an existing array, no new exports.

- [ ] **Step 1: Add the tooltip field to each of the 11 entries**

In `app/src/components/dashboard/MetricStrip.tsx`, the `metrics` array currently looks
like this (relevant entries only, in order):

```typescript
  const metrics = [
    {
      label: 'ROIC',
      value: summary.roic,
      threshold: classifyMetric('roic', summary.roic),
      sparkData: tabs.profitability.roic,
    },
    {
      label: 'EPS Growth',
      value: epsGrowth,
      threshold: classifyMetric('growth', epsGrowth),
      sparkData: tabs.growth.eps,
      sparkUnit: '',
    },
    {
      label: 'Revenue Growth',
      value: rev,
      threshold: classifyMetric('growth', rev),
      sparkData: tabs.growth.revenue,
      sparkUnit: 'B',
    },
    {
      label: 'Net Income Growth',
      value: ni,
      threshold: classifyMetric('growth', ni),
      sparkData: tabs.growth.netIncome,
      sparkUnit: 'B',
    },
    {
      label: 'FCF Growth',
      value: fcf,
      threshold: classifyMetric('growth', fcf),
      sparkData: tabs.cashFlow.fcfGrowth,
    },
    {
      label: 'Book Value Growth',
      value: summary.bookValueGrowth,
      threshold: classifyMetric('growth', summary.bookValueGrowth),
      sparkData: tabs.financialHealth.bookValuePerShare,
    },
    {
      label: 'Debt / Equity',
      value: summary.debtEquity,
      threshold: classifyMetric('debtEquity', summary.debtEquity),
      sparkData: tabs.financialHealth.debtEquity,
      unit: 'x',
    },
    {
      label: 'Dividend Yield',
      value: dividendYield,
      threshold: classifyMetric('growth', dividendYield),
      sparkData: tabs.dividends?.dps ?? [],
      unit: '%',
      sparkUnit: '',
    },
    {
      label: 'P/E',
      value: pe,
      threshold: classifyMetric('pe', pe),
      sparkData: tabs.growth.eps,
      unit: 'x',
      sparkUnit: '',
    },
    {
      label: 'P/B',
      value: pb,
      threshold: classifyMetric('pb', pb),
      sparkData: tabs.financialHealth.bookValuePerShare,
      unit: 'x',
      sparkUnit: '',
    },
    {
      label: 'PEG',
      value: peg,
      threshold: classifyMetric('peg', peg),
      sparkData: tabs.growth.epsGrowthPct,
      unit: 'x',
      sparkUnit: '%',
    },
```

Replace that entire block (from `const metrics = [` through the closing `},` after the
`PEG` entry — i.e. everything up to, but not including, the existing `Sticker Price (₱)`
entry that follows it) with:

```typescript
  const metrics = [
    {
      label: 'ROIC',
      value: summary.roic,
      threshold: classifyMetric('roic', summary.roic),
      sparkData: tabs.profitability.roic,
      tooltip: 'Return on Invested Capital: NOPAT ÷ Invested Capital. ≥10% green, ≥5% yellow, <5% red.',
    },
    {
      label: 'EPS Growth',
      value: epsGrowth,
      threshold: classifyMetric('growth', epsGrowth),
      sparkData: tabs.growth.eps,
      sparkUnit: '',
      tooltip: `EPS compound annual growth rate over the selected ${period} period. ≥10% green, ≥5% yellow, <5% red.`,
    },
    {
      label: 'Revenue Growth',
      value: rev,
      threshold: classifyMetric('growth', rev),
      sparkData: tabs.growth.revenue,
      sparkUnit: 'B',
      tooltip: `Revenue compound annual growth rate over the selected ${period} period. ≥10% green, ≥5% yellow, <5% red.`,
    },
    {
      label: 'Net Income Growth',
      value: ni,
      threshold: classifyMetric('growth', ni),
      sparkData: tabs.growth.netIncome,
      sparkUnit: 'B',
      tooltip: `Net Income compound annual growth rate over the selected ${period} period. ≥10% green, ≥5% yellow, <5% red.`,
    },
    {
      label: 'FCF Growth',
      value: fcf,
      threshold: classifyMetric('growth', fcf),
      sparkData: tabs.cashFlow.fcfGrowth,
      tooltip: `Free Cash Flow average year-over-year growth over the selected ${period} period. ≥10% green, ≥5% yellow, <5% red.`,
    },
    {
      label: 'Book Value Growth',
      value: summary.bookValueGrowth,
      threshold: classifyMetric('growth', summary.bookValueGrowth),
      sparkData: tabs.financialHealth.bookValuePerShare,
      tooltip: 'Book Value Per Share compound annual growth rate over the full available history (not affected by the period toggle above). ≥10% green, ≥5% yellow, <5% red.',
    },
    {
      label: 'Debt / Equity',
      value: summary.debtEquity,
      threshold: classifyMetric('debtEquity', summary.debtEquity),
      sparkData: tabs.financialHealth.debtEquity,
      unit: 'x',
      tooltip: 'Total Debt ÷ Total Equity. ≤0.5x green, ≤1.0x yellow, >1.0x red.',
    },
    {
      label: 'Dividend Yield',
      value: dividendYield,
      threshold: classifyMetric('growth', dividendYield),
      sparkData: tabs.dividends?.dps ?? [],
      unit: '%',
      sparkUnit: '',
      tooltip: 'Annual Dividend Per Share ÷ Current Price × 100. ≥10% green, ≥5% yellow, <5% red.',
    },
    {
      label: 'P/E',
      value: pe,
      threshold: classifyMetric('pe', pe),
      sparkData: tabs.growth.eps,
      unit: 'x',
      sparkUnit: '',
      tooltip: 'Price ÷ Earnings Per Share. Lower means cheaper relative to earnings. ≤15x green, ≤25x yellow, >25x red.',
    },
    {
      label: 'P/B',
      value: pb,
      threshold: classifyMetric('pb', pb),
      sparkData: tabs.financialHealth.bookValuePerShare,
      unit: 'x',
      sparkUnit: '',
      tooltip: 'Price ÷ Book Value Per Share. Lower means cheaper relative to net assets. ≤1.5x green, ≤3x yellow, >3x red.',
    },
    {
      label: 'PEG',
      value: peg,
      threshold: classifyMetric('peg', peg),
      sparkData: tabs.growth.epsGrowthPct,
      unit: 'x',
      sparkUnit: '%',
      tooltip: 'P/E ÷ EPS Growth Rate. Below 1 suggests undervalued relative to growth. ≤1x green, ≤2x yellow, >2x red.',
    },
```

Do not touch the `Sticker Price (₱)` and `MOS Buy Price (₱)` entries that follow — they
already have `tooltip` fields from prior work and are unchanged by this task.

- [ ] **Step 2: Typecheck**

Run: `cd app && pnpm tsc --noEmit`
Expected: zero errors.

- [ ] **Step 3: Run the test suite**

Run: `cd app && pnpm vitest run`
Expected: all existing tests still pass (this task adds no logic, only string literals —
test count should be unchanged from before this task).

- [ ] **Step 4: Manual verification**

Run: `cd app && pnpm dev` (check `docker ps` / `lsof -i:3000` first to avoid port
conflicts with any already-running instance).

Visit `http://localhost:3000/stock/BDO`. Hover the info icon (ⓘ) on each of the 13 cards
in the metric strip (11 new + Sticker Price + MOS Buy Price) and confirm each shows a
tooltip with the correct text from this task's copy. Specifically verify:
- EPS Growth's tooltip mentions "10Y" when the period toggle is on 10Y, and updates to
  say "5Y" or "3Y" when you click those toggle buttons (confirms the `period`
  interpolation works).
- Book Value Growth's tooltip is present and mentions it's unaffected by the toggle.
- P/E, P/B, PEG, Debt/Equity, Dividend Yield, ROIC all show a tooltip with their formula
  and cutoffs.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/dashboard/MetricStrip.tsx
git commit -m "add info badges to remaining metric strip cards"
```

## Self-Review Notes

- **Spec coverage:** all 11 cards' exact copy from the spec is reproduced verbatim in
  Step 1; the `period` interpolation requirement (EPS/Revenue/NI/FCF Growth) and the
  Book Value Growth toggle-independence note are both present; no real-number
  interpolation added anywhere (per the spec's explicit scope decision); no changes to
  `MetricCard.tsx`/`thresholds.ts` (per Global Constraints).
- **Type consistency:** the `tooltip` field being added is a plain `string` in every
  entry, matching `MetricCard`'s existing `tooltip?: string` prop type exactly — no new
  types introduced, so there's nothing to drift.
