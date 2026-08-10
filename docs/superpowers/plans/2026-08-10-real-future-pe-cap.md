# Real Future P/E Cap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `computeStickerPrice`'s hardcoded future-P/E cap of `20` with a per-stock
cap derived from the ticker's 52-week high price (`52-week high ÷ EPS`), falling back to
`20` when that data is unavailable.

**Architecture:** `pse-edge.ts`'s `getLastPrice` is replaced by `getStockData`, which
fetches the same PSE Edge page once and returns both the last price and the 52-week high.
`valuation.ts` gains a `computeFuturePeCap` helper and `computeStickerPrice` accepts the
cap as an optional 3rd parameter (default `20`, preserving current behavior when omitted).
The three call sites that compute sticker price (stock detail page → `MetricStrip`,
screener page, and the viewport-refetch API route) are updated to fetch the 52-week high
and pass the computed cap through.

**Tech Stack:** Next.js 14 App Router, TypeScript, Vitest.

## Global Constraints

- `computeFuturePeCap(high52w: number | null, eps: number | null): number` returns
  `high52w / eps` when both are non-null and `eps > 0` and the result is `> 0`; returns
  `20` in every other case (null inputs, `eps <= 0`, or a non-positive result).
- `computeStickerPrice`'s 3rd parameter `futurePeCap: number = 20` replaces the hardcoded
  `20` inside `futurePE = Math.min(cappedGrowthPct * 2, futurePeCap)`. Calling it with only
  2 arguments must produce byte-identical output to before this change (default preserves
  current behavior).
- `getStockData(ticker): Promise<{ lastPrice: number | null; high52w: number | null }>`
  replaces `getLastPrice(ticker): Promise<number | null>` — one fetch instead of two,
  parses both fields from the same HTML response. Never returns `null` itself; individual
  fields degrade to `null` independently on parse failure.
- 52-Week High regex: `/52-Week High<\/th>\s*<td[^>]*>\s*([\d,]+(?:\.\d+)?)/` — same shape
  as the existing Last Traded Price / Previous Close regexes in the same function.
- No unit tests for `getStockData` — matches this file's existing convention (no PSE-Edge
  scraping function in `pse-edge.ts` has ever been unit tested).
- Follow existing code style: no comments unless explaining non-obvious "why", 2-space
  indent, single quotes, semicolons.

---

### Task 1: `computeFuturePeCap` and `computeStickerPrice`'s new parameter

**Files:**
- Modify: `app/src/service/valuation.ts`
- Modify: `app/src/service/valuation.test.ts`

**Interfaces:**
- Produces: `computeFuturePeCap(high52w: number | null, eps: number | null): number` and
  the updated `computeStickerPrice(eps: number | null, growthRatePct: number | null, futurePeCap: number = 20): StickerPriceResult | null`
  — both used by Task 3 (the three call sites).

- [ ] **Step 1: Write the failing tests**

Append to `app/src/service/valuation.test.ts` (add a new `describe` block after the
existing `computeStickerPrice` block, and add new `it`s inside that existing block for the
3rd-parameter behavior):

```typescript
import { computeFuturePeCap } from './valuation';

describe('computeFuturePeCap', () => {
  it('returns 20 when high52w is null', () => {
    expect(computeFuturePeCap(null, 10)).toBe(20);
  });

  it('returns 20 when eps is null', () => {
    expect(computeFuturePeCap(150, null)).toBe(20);
  });

  it('returns 20 when eps is zero or negative', () => {
    expect(computeFuturePeCap(150, 0)).toBe(20);
    expect(computeFuturePeCap(150, -5)).toBe(20);
  });

  it('computes high52w / eps for a normal case', () => {
    expect(computeFuturePeCap(150, 10)).toBeCloseTo(15, 6);
  });

  it('returns 20 when the computed cap would be zero or negative', () => {
    expect(computeFuturePeCap(-10, 5)).toBe(20);
    expect(computeFuturePeCap(0, 5)).toBe(20);
  });
});
```

Add these two `it`s inside the existing `describe('computeStickerPrice', ...)` block, at
the end (after the `'breakdown values respect...'` test, before the closing `});`):

```typescript
  it('uses the default futurePeCap of 20 when the 3rd argument is omitted', () => {
    const result = computeStickerPrice(10, 12);
    expect(result!.futurePE).toBeCloseTo(20, 6);
  });

  it('uses a custom futurePeCap when provided, instead of the default 20', () => {
    // growth=12 -> 2*12=24, would cap to 20 by default, but with futurePeCap=15 it caps to 15
    const result = computeStickerPrice(10, 12, 15);
    expect(result!.futurePE).toBeCloseTo(15, 6);
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd app && pnpm vitest run src/service/valuation.test.ts`
Expected: FAIL — `computeFuturePeCap is not exported` / `is not a function`, and the new
`futurePeCap` test expects `15` but the current hardcoded implementation always produces
`20` regardless of a 3rd argument (which doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Replace the full contents of `app/src/service/valuation.ts` with:

```typescript
export interface StickerPriceResult {
  stickerPrice: number;
  mosPrice: number;
  cappedGrowthPct: number;
  futurePE: number;
  futureEps: number;
}

export function computeFuturePeCap(high52w: number | null, eps: number | null): number {
  if (high52w === null || eps === null || eps <= 0) return 20;
  const cap = high52w / eps;
  return cap > 0 ? cap : 20;
}

export function computeStickerPrice(
  eps: number | null,
  growthRatePct: number | null,
  futurePeCap: number = 20
): StickerPriceResult | null {
  if (eps === null || eps <= 0) return null;
  if (growthRatePct === null || growthRatePct <= 0) return null;

  const cappedGrowthPct = Math.min(growthRatePct, 15);
  const cappedGrowth = cappedGrowthPct / 100;
  const futurePE = Math.min(cappedGrowthPct * 2, futurePeCap);
  const futureEps = eps * (1 + cappedGrowth) ** 10;
  const futureValue = futureEps * futurePE;
  const stickerPrice = futureValue / 1.15 ** 10;
  const mosPrice = stickerPrice * 0.5;

  return { stickerPrice, mosPrice, cappedGrowthPct, futurePE, futureEps };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd app && pnpm vitest run src/service/valuation.test.ts`
Expected: PASS — all tests green (8 existing + 5 new `computeFuturePeCap` + 2 new
`computeStickerPrice` 3rd-param tests = 15 total in this file).

- [ ] **Step 5: Run the full suite and typecheck**

Run: `cd app && pnpm vitest run && pnpm tsc --noEmit`
Expected: all existing tests across all files still pass (this task only adds to
`valuation.ts`; nothing that calls `computeStickerPrice` with 2 arguments elsewhere in the
codebase changes behavior, since the new 3rd parameter defaults to the same `20`), zero
type errors.

- [ ] **Step 6: Commit**

```bash
git add app/src/service/valuation.ts app/src/service/valuation.test.ts
git commit -m "add computeFuturePeCap and make computeStickerPrice's PE cap configurable"
```

---

### Task 2: `getStockData` replacing `getLastPrice` in `pse-edge.ts`

**Files:**
- Modify: `app/src/lib/pse-edge.ts`

**Interfaces:**
- Produces: `interface StockData { lastPrice: number | null; high52w: number | null }` and
  `getStockData(ticker: string): Promise<StockData>` — used by Task 3 (all three call
  sites, replacing their current `getLastPrice` import and call).
- Removes: `getLastPrice` (no longer exported — Task 3 updates every import site in the
  same pass, so no dangling reference survives past this plan).

- [ ] **Step 1: Replace `getLastPrice` with `getStockData`**

In `app/src/lib/pse-edge.ts`, find the current `getLastPrice` function:

```typescript
export async function getLastPrice(ticker: string): Promise<number | null> {
  try {
    const info = await getCompanyInfo(ticker);
    if (!info) return null;

    const res = await fetch(
      `${BASE}/companyPage/stockData.do?cmpy_id=${info.cmpyId}`,
      { headers: HEADERS, next: { revalidate: 300 } }
    );
    if (!res.ok) return null;

    const html = await res.text();
    // "Last Traded Price" is empty when the stock hasn't traded yet today (pre-market,
    // suspended, etc) — fall back to "Previous Close" so we still surface a usable price.
    const match =
      html.match(/Last Traded Price<\/th>\s*<td[^>]*>\s*([\d,]+(?:\.\d+)?)/) ??
      html.match(/Previous Close and Date<\/th>\s*<td[^>]*>\s*([\d,]+(?:\.\d+)?)/);
    if (!match) return null;

    const price = parseFloat(match[1].replace(/,/g, ''));
    return isNaN(price) ? null : price;
  } catch {
    return null;
  }
}
```

Replace it entirely with:

```typescript
export interface StockData {
  lastPrice: number | null;
  high52w: number | null;
}

export async function getStockData(ticker: string): Promise<StockData> {
  try {
    const info = await getCompanyInfo(ticker);
    if (!info) return { lastPrice: null, high52w: null };

    const res = await fetch(
      `${BASE}/companyPage/stockData.do?cmpy_id=${info.cmpyId}`,
      { headers: HEADERS, next: { revalidate: 300 } }
    );
    if (!res.ok) return { lastPrice: null, high52w: null };

    const html = await res.text();

    const parseField = (regex: RegExp): number | null => {
      const match = html.match(regex);
      if (!match) return null;
      const value = parseFloat(match[1].replace(/,/g, ''));
      return isNaN(value) ? null : value;
    };

    // "Last Traded Price" is empty when the stock hasn't traded yet today (pre-market,
    // suspended, etc) — fall back to "Previous Close" so we still surface a usable price.
    const lastPrice =
      parseField(/Last Traded Price<\/th>\s*<td[^>]*>\s*([\d,]+(?:\.\d+)?)/) ??
      parseField(/Previous Close and Date<\/th>\s*<td[^>]*>\s*([\d,]+(?:\.\d+)?)/);
    const high52w = parseField(/52-Week High<\/th>\s*<td[^>]*>\s*([\d,]+(?:\.\d+)?)/);

    return { lastPrice, high52w };
  } catch {
    return { lastPrice: null, high52w: null };
  }
}
```

Do not change anything else in this file — `getCompanyInfo`, `getCompanyName`,
`getDisclosures`, `BASE`, `HEADERS`, `cheerio` import all stay exactly as they are.

- [ ] **Step 2: Typecheck**

Run: `cd app && pnpm tsc --noEmit`
Expected: errors at every current import site of `getLastPrice` (3 files) — this is
expected at this point, Task 3 resolves them. Confirm the errors are specifically "no
exported member 'getLastPrice'" in `page.tsx`, `screener/page.tsx`, and
`api/price/[ticker]/route.ts` — if there are errors anywhere else, stop and report, since
that would mean `getLastPrice` has a 4th caller this plan didn't account for.

- [ ] **Step 3: Verify the new function against real PSE Edge data**

Run this ad-hoc script to confirm both fields parse correctly against the real live page
(BDO, cmpy_id 260 — known good ticker used throughout this project's history):

```bash
cd app && npx tsx -e '
import { getStockData } from "./src/lib/pse-edge";
getStockData("BDO").then(console.log);
'
```

Expected: an object with both `lastPrice` and `high52w` as non-null numbers (e.g.
`{ lastPrice: 122, high52w: 150.9 }` — exact values will vary with the live market, but
both fields must be populated numbers, not null, for a well-known liquid ticker like BDO).

- [ ] **Step 4: Commit**

```bash
git add app/src/lib/pse-edge.ts
git commit -m "replace getLastPrice with getStockData, adding 52-week high"
```

Note: this commit leaves the codebase in a non-compiling state (3 files still import the
now-removed `getLastPrice`) — that's expected and resolved by Task 3 immediately after.
This is a deliberate two-task split because `pse-edge.ts` and the 3 call sites are
independently reviewable units; Task 3 depends on this task's interface but is a distinct
piece of work (multi-file wiring vs. single-file data-layer change).

---

### Task 3: Wire the new cap through all three sticker-price call sites

**Files:**
- Modify: `app/src/app/stock/[ticker]/page.tsx`
- Modify: `app/src/components/dashboard/MetricStrip.tsx`
- Modify: `app/src/app/screener/page.tsx`
- Modify: `app/src/app/api/price/[ticker]/route.ts`

**Interfaces:**
- Consumes: `getStockData(ticker): Promise<{ lastPrice: number | null; high52w: number | null }>`
  (Task 2), `computeFuturePeCap(high52w, eps): number` and
  `computeStickerPrice(eps, growthRatePct, futurePeCap)` (Task 1).
- Produces: nothing new exported — this task only updates call sites.

- [ ] **Step 1: Update `app/src/app/stock/[ticker]/page.tsx`**

Change the import (currently):

```typescript
import { getLastPrice, getCompanyName } from '@/lib/pse-edge';
```

to:

```typescript
import { getStockData, getCompanyName } from '@/lib/pse-edge';
```

Change the `Promise.all` destructuring (currently):

```typescript
  const [lastPrice, disclosures, newsArticles, usdToPhpRate, companyProfile] = await Promise.all([
    getLastPrice(upper),
    getDisclosures(upper),
    companyName ? getNewsArticles(companyName) : Promise.resolve([]),
    getUsdToPhpRate(),
    getCompanyProfile(upper),
  ]);
```

to:

```typescript
  const [stockData, disclosures, newsArticles, usdToPhpRate, companyProfile] = await Promise.all([
    getStockData(upper),
    getDisclosures(upper),
    companyName ? getNewsArticles(companyName) : Promise.resolve([]),
    getUsdToPhpRate(),
    getCompanyProfile(upper),
  ]);
  const { lastPrice, high52w } = stockData;
```

Every other use of `lastPrice` in this file (the `dividendYield`/`pe`/`pb` calcs, the
header display, the `<MetricStrip lastPrice={lastPrice} ...>` prop) stays exactly as-is —
`lastPrice` is still a plain `number | null` variable in scope, unchanged in type or
meaning.

Add `high52w={high52w}` as a new prop to the existing `<MetricStrip ...>` call (currently):

```typescript
        <MetricStrip
          financials={financials}
          dividendYield={dividendYield}
          pe={pe}
          pb={pb}
          peg={peg}
          lastPrice={lastPrice}
          latestEps={latestEps}
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
          latestEps={latestEps}
          high52w={high52w}
        />
```

- [ ] **Step 2: Update `app/src/components/dashboard/MetricStrip.tsx`**

Add the import (alongside the existing `@/service/valuation` import):

```typescript
import { computeStickerPrice, computeFuturePeCap } from '@/service/valuation';
```

Add `high52w?: number | null;` to the `Props` interface (currently ends with `latestEps?: number | null;`):

```typescript
interface Props {
  financials: TransformedFinancials;
  dividendYield?: number | null;
  pe?: number | null;
  pb?: number | null;
  peg?: number | null;
  lastPrice?: number | null;
  latestEps?: number | null;
  high52w?: number | null;
}
```

Add `high52w = null,` to the destructured component parameters (currently ends with
`latestEps = null,`):

```typescript
export function MetricStrip({
  financials,
  dividendYield = null,
  pe = null,
  pb = null,
  peg = null,
  lastPrice = null,
  latestEps = null,
  high52w = null,
}: Props) {
```

Change the sticker price computation (currently):

```typescript
  const stickerResult = computeStickerPrice(latestEps, epsGrowth);
```

to:

```typescript
  const futurePeCap = computeFuturePeCap(high52w, latestEps);
  const stickerResult = computeStickerPrice(latestEps, epsGrowth, futurePeCap);
```

Nothing else in this file changes — the tooltip strings already interpolate
`stickerResult.futurePE` dynamically, so they automatically reflect the new cap with no
copy changes needed.

- [ ] **Step 3: Update `app/src/app/screener/page.tsx`**

Change the import (currently):

```typescript
import { getLastPrice } from '@/lib/pse-edge';
```

to:

```typescript
import { getStockData } from '@/lib/pse-edge';
```

Change the per-ticker mapping (currently):

```typescript
  const rows: ScreenerRow[] = await Promise.all(
    partials.map(async (p) => {
      const lastPrice = await getLastPrice(p.ticker);
      const stickerResult = computeStickerPrice(p.latestEps, p.epsGrowthRate);
      const { latestEps, epsGrowthRate, ...rest } = p;
      const partial = {
        ...rest,
        lastPrice,
        stickerPrice: stickerResult?.stickerPrice ?? null,
        mosPrice: stickerResult?.mosPrice ?? null,
      };
      return { ...partial, score: bigFiveScore(partial) };
    })
  );
```

to:

```typescript
  const rows: ScreenerRow[] = await Promise.all(
    partials.map(async (p) => {
      const { lastPrice, high52w } = await getStockData(p.ticker);
      const futurePeCap = computeFuturePeCap(high52w, p.latestEps);
      const stickerResult = computeStickerPrice(p.latestEps, p.epsGrowthRate, futurePeCap);
      const { latestEps, epsGrowthRate, ...rest } = p;
      const partial = {
        ...rest,
        lastPrice,
        stickerPrice: stickerResult?.stickerPrice ?? null,
        mosPrice: stickerResult?.mosPrice ?? null,
      };
      return { ...partial, score: bigFiveScore(partial) };
    })
  );
```

Add `computeFuturePeCap` to the existing `@/service/valuation` import (currently
`import { computeStickerPrice } from '@/service/valuation';`):

```typescript
import { computeStickerPrice, computeFuturePeCap } from '@/service/valuation';
```

- [ ] **Step 4: Update `app/src/app/api/price/[ticker]/route.ts`**

Change the imports (currently):

```typescript
import { computeStickerPrice } from '@/service/valuation';
import { toPhp } from '@/service/currency';
import { getLastPrice } from '@/lib/pse-edge';
```

to:

```typescript
import { computeStickerPrice, computeFuturePeCap } from '@/service/valuation';
import { toPhp } from '@/service/currency';
import { getStockData } from '@/lib/pse-edge';
```

Change the body (currently):

```typescript
  const [lastPrice, usdToPhpRate] = await Promise.all([getLastPrice(upper), getUsdToPhpRate()]);
  const { summary, tabs, currency } = transformFinancials(raw);
  const latestEpsRaw = tabs.growth.eps.findLast((d) => d.value !== null)?.value ?? null;
  const latestEps = toPhp(latestEpsRaw, currency, usdToPhpRate);
  const epsGrowthRate = summary.epsGrowth.tenYearAvg ?? summary.epsGrowth.fiveYearAvg ?? summary.epsGrowth.threeYearAvg;
  const stickerResult = computeStickerPrice(latestEps, epsGrowthRate);
```

to:

```typescript
  const [stockData, usdToPhpRate] = await Promise.all([getStockData(upper), getUsdToPhpRate()]);
  const { lastPrice, high52w } = stockData;
  const { summary, tabs, currency } = transformFinancials(raw);
  const latestEpsRaw = tabs.growth.eps.findLast((d) => d.value !== null)?.value ?? null;
  const latestEps = toPhp(latestEpsRaw, currency, usdToPhpRate);
  const epsGrowthRate = summary.epsGrowth.tenYearAvg ?? summary.epsGrowth.fiveYearAvg ?? summary.epsGrowth.threeYearAvg;
  const futurePeCap = computeFuturePeCap(high52w, latestEps);
  const stickerResult = computeStickerPrice(latestEps, epsGrowthRate, futurePeCap);
```

The function's return statement (`return NextResponse.json({ lastPrice, stickerPrice, mosPrice })`)
is unchanged — `lastPrice` is still in scope with the same type and meaning.

- [ ] **Step 5: Typecheck**

Run: `cd app && pnpm tsc --noEmit`
Expected: zero errors — this confirms every `getLastPrice` reference from Task 2 is now
resolved.

- [ ] **Step 6: Run the full test suite**

Run: `cd app && pnpm vitest run`
Expected: all tests pass (this task changes no tested pure-function behavior — only
call-site wiring in files that have no dedicated tests, matching this project's existing
convention that page/route/component files aren't unit tested).

- [ ] **Step 7: Manual verification**

Start the dev server (check `docker ps` / `lsof -i:3000` first to avoid port conflicts
with anything already running): `cd app && pnpm dev`.

Visit `http://localhost:3000/stock/BDO`. Hover the Sticker Price info badge and confirm
the tooltip's "future P/E" number is no longer exactly `20.0` (unless BDO's real
`52-week high ÷ EPS` happens to equal 20, which is very unlikely) — it should now reflect
BDO's actual 52-week-high-derived cap. Cross-check by computing it by hand: fetch
`curl -s http://localhost:3001/company-profiles/BDO` is unrelated — instead compute
`52-week high (from the PSE Edge page) ÷ latestEps (visible in the P/E card's underlying
value, or infer from lastPrice / pe shown on the page)` and confirm it's in the right
ballpark against the tooltip's stated future P/E (whichever is smaller of that value and
`2 × capped growth %`).

Then visit `http://localhost:3000/screener` and confirm it still loads with Price and MOS
Buy columns populated (confirms `getStockData` works in that call site too, not just the
stock detail page).

- [ ] **Step 8: Commit**

```bash
git add "app/src/app/stock/[ticker]/page.tsx" app/src/components/dashboard/MetricStrip.tsx app/src/app/screener/page.tsx "app/src/app/api/price/[ticker]/route.ts"
git commit -m "wire 52-week-high-derived future PE cap through all sticker price call sites"
```

## Self-Review Notes

- **Spec coverage:** `computeFuturePeCap` + `computeStickerPrice`'s new parameter (Task 1),
  `getStockData` replacing `getLastPrice` (Task 2), all 3 call sites updated including the
  `page.tsx` → `MetricStrip` prop threading noted in the spec (Task 3) — all spec sections
  covered. The spec's "Data Flow Note" (EPS/price timing mismatch) and "Out of scope"
  items (no true historical P/E, no extra floor/ceiling, no tooltip copy change) require
  no task since they're explicitly non-actions.
- **Type consistency:** `StockData` (`{ lastPrice: number | null; high52w: number | null }`)
  is defined once in Task 2 and consumed identically in all 3 Task 3 call sites via
  destructuring. `computeFuturePeCap(high52w: number | null, eps: number | null): number`
  signature matches exactly between Task 1's definition and every Task 3 call site.
  `computeStickerPrice`'s 3rd parameter name (`futurePeCap`) and position are consistent
  between Task 1's definition and all Task 3 call sites.
