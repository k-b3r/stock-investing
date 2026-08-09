# Sticker Price / MOS Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Phil Town's Sticker Price and Margin of Safety (MOS) Buy Price as two new
metric cards on the stock dashboard, computed entirely from data already in hand (EPS,
historical EPS growth, last traded price).

**Architecture:** A new pure-function module (`app/src/service/valuation.ts`) computes the
sticker/MOS numbers. A new classification function in `thresholds.ts` compares last price
against sticker price to pick a color. `page.tsx` wires the two together and passes results
to `MetricStrip`, which renders two new `MetricCard`s alongside the existing P/E, P/B, PEG
cards.

**Tech Stack:** Next.js 14 App Router, TypeScript, Vitest (`app/package.json` → `pnpm test` runs `vitest run`).

## Global Constraints

- Growth rate capped at 15% before use in the formula.
- Future P/E = min(2 × capped growth %, 20).
- Projection horizon: 10 years. Discount rate: 15%. MOS haircut: 50% of sticker price.
- `computeStickerPrice` returns `null` if `eps <= 0` or `growthRatePct <= 0` (mirrors existing
  null-guard style in `app/src/service/financials.ts`).
- Follow existing code style: no comments unless explaining non-obvious "why", 2-space indent,
  single quotes, no semicolons omitted (existing files use semicolons — keep them).

---

### Task 1: `computeStickerPrice` valuation function

**Files:**
- Create: `app/src/service/valuation.ts`
- Test: `app/src/service/valuation.test.ts`

**Interfaces:**
- Produces: `computeStickerPrice(eps: number | null, growthRatePct: number | null): { stickerPrice: number; mosPrice: number } | null`
  — used by Task 3 (`page.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `app/src/service/valuation.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { computeStickerPrice } from './valuation';

describe('computeStickerPrice', () => {
  it('returns null when eps is null', () => {
    expect(computeStickerPrice(null, 12)).toBeNull();
  });

  it('returns null when eps is zero or negative', () => {
    expect(computeStickerPrice(0, 12)).toBeNull();
    expect(computeStickerPrice(-5, 12)).toBeNull();
  });

  it('returns null when growthRatePct is null', () => {
    expect(computeStickerPrice(10, null)).toBeNull();
  });

  it('returns null when growthRatePct is zero or negative', () => {
    expect(computeStickerPrice(10, 0)).toBeNull();
    expect(computeStickerPrice(10, -3)).toBeNull();
  });

  it('computes sticker price and MOS for a normal case (eps=10, growth=12%)', () => {
    // cappedGrowth = 0.12 (under 15% cap)
    // futurePE = min(0.12 * 100 * 2, 20) = min(24, 20) = 20
    // futureEps = 10 * (1.12 ** 10) = 31.058...
    // futureValue = 31.058... * 20 = 621.17...
    // stickerPrice = 621.17... / (1.15 ** 10) = 621.17... / 4.0456... = 153.57...
    // mosPrice = stickerPrice * 0.5
    const result = computeStickerPrice(10, 12);
    expect(result).not.toBeNull();
    expect(result!.stickerPrice).toBeCloseTo(153.57, 1);
    expect(result!.mosPrice).toBeCloseTo(76.78, 1);
  });

  it('caps growth rate at 15% even when input is higher', () => {
    // growth=30 and growth=15 must produce identical output since both cap to 15%
    const atCap = computeStickerPrice(10, 15);
    const aboveCap = computeStickerPrice(10, 30);
    expect(aboveCap!.stickerPrice).toBeCloseTo(atCap!.stickerPrice, 6);
    expect(aboveCap!.mosPrice).toBeCloseTo(atCap!.mosPrice, 6);
  });

  it('caps future P/E at 20 even when 2x growth rate would exceed it', () => {
    // growth=15 -> 2*15=30, capped to 20 -> futurePE must be 20, not 30
    // futureEps = 10 * (1.15 ** 10) = 40.4556...
    // if futurePE were uncapped (30): futureValue = 1213.67..., stickerPrice = 300.05...
    // with cap (20): futureValue = 809.11..., stickerPrice = 200.03...
    const result = computeStickerPrice(10, 15);
    expect(result!.stickerPrice).toBeCloseTo(200.03, 1);
  });

  it('mosPrice is always exactly half of stickerPrice', () => {
    const result = computeStickerPrice(7.5, 9);
    expect(result!.mosPrice).toBeCloseTo(result!.stickerPrice * 0.5, 10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && pnpm vitest run src/service/valuation.test.ts`
Expected: FAIL — `Cannot find module './valuation'` (file doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `app/src/service/valuation.ts`:

```typescript
export function computeStickerPrice(
  eps: number | null,
  growthRatePct: number | null
): { stickerPrice: number; mosPrice: number } | null {
  if (eps === null || eps <= 0) return null;
  if (growthRatePct === null || growthRatePct <= 0) return null;

  const cappedGrowth = Math.min(growthRatePct, 15) / 100;
  const futurePE = Math.min(cappedGrowth * 100 * 2, 20);
  const futureEps = eps * (1 + cappedGrowth) ** 10;
  const futureValue = futureEps * futurePE;
  const stickerPrice = futureValue / 1.15 ** 10;
  const mosPrice = stickerPrice * 0.5;

  return { stickerPrice, mosPrice };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && pnpm vitest run src/service/valuation.test.ts`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add app/src/service/valuation.ts app/src/service/valuation.test.ts
git commit -m "add computeStickerPrice valuation function"
```

---

### Task 2: `classifyStickerPrice` threshold function

**Files:**
- Modify: `app/src/service/thresholds.ts`
- Test: `app/src/service/thresholds.test.ts`

**Interfaces:**
- Consumes: `ThresholdResult` type from `app/src/lib/types/financials.ts` (already imported in `thresholds.ts`).
- Produces: `classifyStickerPrice(lastPrice: number | null, stickerPrice: number | null): ThresholdResult`
  — used by Task 3 (`page.tsx`) and Task 4 (`MetricStrip.tsx`).

- [ ] **Step 1: Write the failing tests**

Append to `app/src/service/thresholds.test.ts` (add at the end of the file, same `describe`/`it` style as existing blocks):

```typescript
import { classifyStickerPrice } from './thresholds';

describe('classifyStickerPrice', () => {
  it('returns neutral when lastPrice is null', () => {
    expect(classifyStickerPrice(null, 100)).toBe('neutral');
  });

  it('returns neutral when stickerPrice is null', () => {
    expect(classifyStickerPrice(50, null)).toBe('neutral');
  });

  it('returns neutral when stickerPrice is zero', () => {
    expect(classifyStickerPrice(50, 0)).toBe('neutral');
  });

  it('returns green when price is at exactly 50% of sticker (at MOS)', () => {
    expect(classifyStickerPrice(50, 100)).toBe('green');
  });

  it('returns green when price is below 50% of sticker', () => {
    expect(classifyStickerPrice(30, 100)).toBe('green');
  });

  it('returns yellow when price is between MOS and sticker', () => {
    expect(classifyStickerPrice(75, 100)).toBe('yellow');
  });

  it('returns yellow when price is at exactly sticker price', () => {
    expect(classifyStickerPrice(100, 100)).toBe('yellow');
  });

  it('returns red when price is above sticker price', () => {
    expect(classifyStickerPrice(120, 100)).toBe('red');
  });
});
```

Note: `thresholds.test.ts` currently imports only `classifyMetric` at the top of the file
(`import { classifyMetric } from './thresholds';`) — add `classifyStickerPrice` to that same
import line instead of a second import statement:

```typescript
import { classifyMetric, classifyStickerPrice } from './thresholds';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && pnpm vitest run src/service/thresholds.test.ts`
Expected: FAIL — `classifyStickerPrice is not exported` / `is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `app/src/service/thresholds.ts` (after the existing `classifyMetric` function):

```typescript
export function classifyStickerPrice(
  lastPrice: number | null,
  stickerPrice: number | null
): ThresholdResult {
  if (lastPrice === null || stickerPrice === null || stickerPrice <= 0) return 'neutral';

  const ratio = lastPrice / stickerPrice;
  if (ratio <= 0.5) return 'green';
  if (ratio <= 1) return 'yellow';
  return 'red';
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && pnpm vitest run src/service/thresholds.test.ts`
Expected: PASS — all tests green (existing `classifyMetric` tests + new `classifyStickerPrice` tests).

- [ ] **Step 5: Commit**

```bash
git add app/src/service/thresholds.ts app/src/service/thresholds.test.ts
git commit -m "add classifyStickerPrice threshold function"
```

---

### Task 3: Wire sticker price / MOS into the stock page

**Files:**
- Modify: `app/src/app/stock/[ticker]/page.tsx:1-45`

**Interfaces:**
- Consumes: `computeStickerPrice` from `@/service/valuation` (Task 1).
- Produces: `stickerPrice: number | null`, `mosPrice: number | null` passed as new props to `MetricStrip` (Task 4 defines the prop names it expects — they must match exactly: `stickerPrice`, `mosPrice`, `lastPrice`).

- [ ] **Step 1: Add the import and computation**

In `app/src/app/stock/[ticker]/page.tsx`, add the import at the top (after the existing `getFinancials`/`transformFinancials` imports):

```typescript
import { computeStickerPrice } from '@/service/valuation';
```

Then, immediately after the existing line (currently line 45):
```typescript
  const peg = pe && epsGrowthRate && epsGrowthRate > 0 ? pe / epsGrowthRate : null;
```

add:

```typescript
  const stickerResult = computeStickerPrice(latestEps, epsGrowthRate);
  const stickerPrice = stickerResult?.stickerPrice ?? null;
  const mosPrice = stickerResult?.mosPrice ?? null;
```

- [ ] **Step 2: Pass new props to `MetricStrip`**

Change the existing `<MetricStrip ... />` call (currently lines 64-70):

```typescript
        <MetricStrip
          financials={financials}
          dividendYield={dividendYield}
          pe={pe}
          pb={pb}
          peg={peg}
        />
```

to:

```typescript
        <MetricStrip
          financials={financials}
          dividendYield={dividendYield}
          pe={pe}
          pb={pb}
          peg={peg}
          lastPrice={lastPrice}
          stickerPrice={stickerPrice}
          mosPrice={mosPrice}
        />
```

- [ ] **Step 3: Type-check**

Run: `cd app && pnpm tsc --noEmit`
Expected: errors about `MetricStrip` not accepting `lastPrice`/`stickerPrice`/`mosPrice` props
(Task 4 hasn't added them yet) — this is expected at this point, confirms the wiring compiles
on the `page.tsx` side once Task 4 lands. If your tsc setup type-checks the whole project and
fails the build here, that's fine — proceed to Task 4 before running the full check again.

- [ ] **Step 4: Commit**

```bash
git add "app/src/app/stock/[ticker]/page.tsx"
git commit -m "compute sticker price / MOS on stock page"
```

---

### Task 4: Render Sticker Price and MOS cards in `MetricStrip`

**Files:**
- Modify: `app/src/components/dashboard/MetricStrip.tsx`

**Interfaces:**
- Consumes: `classifyStickerPrice` from `@/service/thresholds` (Task 2); `lastPrice`, `stickerPrice`,
  `mosPrice` props (Task 3 passes these).
- Produces: two new cards rendered in the existing `metrics` array / grid — no new exports.

- [ ] **Step 1: Update imports and `Props` interface**

In `app/src/components/dashboard/MetricStrip.tsx`, change the import line (currently line 5):

```typescript
import { classifyMetric } from '@/service/thresholds';
```

to:

```typescript
import { classifyMetric, classifyStickerPrice } from '@/service/thresholds';
```

Change the `Props` interface (currently lines 9-15):

```typescript
interface Props {
  financials: TransformedFinancials;
  dividendYield?: number | null;
  pe?: number | null;
  pb?: number | null;
  peg?: number | null;
}
```

to:

```typescript
interface Props {
  financials: TransformedFinancials;
  dividendYield?: number | null;
  pe?: number | null;
  pb?: number | null;
  peg?: number | null;
  lastPrice?: number | null;
  stickerPrice?: number | null;
  mosPrice?: number | null;
}
```

- [ ] **Step 2: Update the component signature**

Change (currently line 25):

```typescript
export function MetricStrip({ financials, dividendYield = null, pe = null, pb = null, peg = null }: Props) {
```

to:

```typescript
export function MetricStrip({
  financials,
  dividendYield = null,
  pe = null,
  pb = null,
  peg = null,
  lastPrice = null,
  stickerPrice = null,
  mosPrice = null,
}: Props) {
```

- [ ] **Step 3: Add the two new cards to the `metrics` array**

After the existing `PEG` entry (currently lines 106-113, ending with the closing `},` of the PEG
object) and before the closing `];` of the `metrics` array, add:

```typescript
    {
      label: 'Sticker Price (₱)',
      value: stickerPrice,
      threshold: classifyStickerPrice(lastPrice, stickerPrice),
      sparkData: tabs.growth.eps,
      unit: '',
      sparkUnit: '',
    },
    {
      label: 'MOS Buy Price (₱)',
      value: mosPrice,
      threshold: 'neutral' as const,
      sparkData: tabs.growth.eps,
      unit: '',
      sparkUnit: '',
    },
```

- [ ] **Step 4: Type-check and lint**

Run: `cd app && pnpm tsc --noEmit`
Expected: no errors.

Run: `cd app && pnpm lint`
Expected: no errors.

- [ ] **Step 5: Run full test suite**

Run: `cd app && pnpm test`
Expected: PASS — all existing tests plus the new `valuation.test.ts` and `classifyStickerPrice`
tests in `thresholds.test.ts` are green.

- [ ] **Step 6: Manual verification**

Run: `cd app && pnpm dev`
Visit `http://localhost:3000/stock/BDO` (or any ticker with EPS + growth data). Confirm two new
cards "Sticker Price (₱)" and "MOS Buy Price (₱)" appear after PEG in the metric grid, showing
peso values (not "N/A", assuming BDO has positive EPS and positive historical growth). Confirm
the Sticker Price card is colored (green/yellow/red) based on how last price compares to it, and
MOS Buy Price card renders in the neutral/gray style.

- [ ] **Step 7: Commit**

```bash
git add app/src/components/dashboard/MetricStrip.tsx
git commit -m "render sticker price / MOS cards in MetricStrip"
```

---

## Self-Review Notes

- **Spec coverage:** formula (Task 1), threshold/coloring (Task 2), page wiring (Task 3), UI
  rendering (Task 4) — all spec sections covered. Testing section covered across Task 1 (valuation
  tests) and Task 2 (threshold tests). "Out of scope" items intentionally have no tasks.
- **Type consistency:** `computeStickerPrice` return shape (`{ stickerPrice, mosPrice }`) matches
  usage in Task 3 (`stickerResult?.stickerPrice`, `stickerResult?.mosPrice`). `classifyStickerPrice(lastPrice, stickerPrice)`
  signature matches its Task 2 definition and Task 4 call site exactly. Prop names (`lastPrice`,
  `stickerPrice`, `mosPrice`) match between Task 3 (passed to `MetricStrip`) and Task 4 (received
  by `MetricStrip`).
