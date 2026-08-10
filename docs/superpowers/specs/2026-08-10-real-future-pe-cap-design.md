# Real Future P/E Cap for Sticker Price (52-Week High)

## Purpose
Replace the flat `20` future-P/E cap in `computeStickerPrice` with a per-stock cap derived
from the ticker's 52-week high price, moving closer to Phil Town's actual Rule #1 method:
**future P/E = min(2 × growth rate, historical high P/E)**. We don't store multi-year
price history, so we don't have a true "historical high P/E" — but PSE Edge's stock data
page (already fetched for the last traded price) includes a **52-Week High** field we
currently don't parse. `52-week high ÷ current EPS` is a real, current, zero-new-scraping
approximation of "the highest multiple the market has recently paid" — meaningfully closer
to Town's intent than an arbitrary constant.

## Confirmed Data
Manually fetched `https://edge.pse.com.ph/companyPage/stockData.do?cmpy_id=260` (BDO).
Same page `getLastPrice` already fetches. Contains:
```html
<tr>
  <th>52-Week High</th>
  <td style="text-align:right;padding-right:1.2em;">
150.90</td>
  <th>52-Week Low</th>
  ...
```
Same shape as the existing `Last Traded Price` field `getLastPrice` already regex-parses.

## Components

### `app/src/lib/pse-edge.ts` (modify)
Replace `getLastPrice(ticker): Promise<number | null>` with:
```typescript
export interface StockData {
  lastPrice: number | null;
  high52w: number | null;
}

export async function getStockData(ticker: string): Promise<StockData> {
  // fetches companyPage/stockData.do once (same URL/options getLastPrice used),
  // parses Last Traded Price (falling back to Previous Close, same as today) AND
  // 52-Week High via /52-Week High<\/th>\s*<td[^>]*>\s*([\d,]+(?:\.\d+)?)/
  // returns { lastPrice: null, high52w: null } on any fetch/parse failure
  // (never returns null itself — individual fields degrade independently)
}
```
Only 3 files import `getLastPrice` today (`app/src/app/stock/[ticker]/page.tsx`,
`app/src/app/screener/page.tsx`, `app/src/app/api/price/[ticker]/route.ts`) — all three
are touched by this plan anyway, so this is a clean rename with no dangling old export.

### `app/src/service/valuation.ts` (modify)
Add:
```typescript
export function computeFuturePeCap(high52w: number | null, eps: number | null): number {
  if (high52w === null || eps === null || eps <= 0) return 20;
  const cap = high52w / eps;
  return cap > 0 ? cap : 20;
}
```
Change `computeStickerPrice`'s signature to accept a 3rd optional parameter:
```typescript
export function computeStickerPrice(
  eps: number | null,
  growthRatePct: number | null,
  futurePeCap: number = 20
): StickerPriceResult | null
```
Internally, `futurePE = Math.min(cappedGrowthPct * 2, futurePeCap)` replaces the current
hardcoded `Math.min(cappedGrowthPct * 2, 20)`. No other change to the formula (15% growth
cap, 10-year horizon, 15% discount, 50% MOS haircut all unchanged).

### Call sites (modify, 3 files)
Each currently calls `getLastPrice(ticker)` for the display price and separately calls
`computeStickerPrice(eps, growthRate)` (2-arg). Each changes to:
1. Call `getStockData(ticker)` instead of `getLastPrice(ticker)`, destructuring
   `{ lastPrice, high52w }`.
2. Compute `const futurePeCap = computeFuturePeCap(high52w, eps)`.
3. Pass `futurePeCap` as the 3rd argument to `computeStickerPrice`.

- **`app/src/app/stock/[ticker]/page.tsx`**: fetches `getStockData` instead of
  `getLastPrice`; passes `lastPrice` (as before) AND a new `high52w` prop down to
  `MetricStrip` (sticker computation lives in `MetricStrip`, not `page.tsx`, per the
  period-toggle fix from the original Sticker Price feature).
- **`app/src/components/dashboard/MetricStrip.tsx`**: accepts the new `high52w` prop,
  computes `futurePeCap` internally (it already computes `latestEps`-paired
  `computeStickerPrice` calls itself), passes it as the 3rd arg.
- **`app/src/app/screener/page.tsx`**: same pattern, no `MetricStrip` involved — computed
  directly in the page's per-ticker mapping.
- **`app/src/app/api/price/[ticker]/route.ts`**: same pattern — this route recomputes
  sticker price independently for the screener's viewport-triggered refetch.

## Data Flow Note
`high52w` and `eps` are not from the same point in time — `high52w` is the market's actual
52-week trading range, `eps` is the latest reported annual EPS (which may be up to ~1 year
stale depending on fiscal year end vs scrape date). This is an inherent approximation
(same caveat already applies to the existing live `P/E` card, which divides current price
by the same latest EPS). Not a new problem introduced by this change.

## Testing
`app/src/service/valuation.test.ts` (existing file) gets new tests for
`computeFuturePeCap`: null `high52w` → 20, null `eps` → 20, `eps <= 0` → 20, normal case →
`high52w / eps`, and a case producing a negative/zero result → 20 (defensive, even though
not expected in practice). Existing `computeStickerPrice` tests continue to pass
unmodified since the new 3rd parameter defaults to `20` — the exact previous hardcoded
value — so calling it with 2 arguments still produces identical output. Add one new test
confirming a custom `futurePeCap` argument is actually used instead of the default 20.

`pse-edge.ts`'s `getStockData` gets no unit tests — matches the existing convention that
this file's PSE-Edge-scraping functions (`getLastPrice` before it, `getCompanyName`,
`getDisclosures`) have never been unit tested; `pse-edge.test.ts` only ever existed
temporarily for the now-removed `getCompanyProfile` and was deleted when that moved to a
DB-backed approach.

## Out of scope
- No true multi-year historical P/E (would require storing historical prices, which we
  don't — see prior discussion). 52-week high is the closest zero-new-infrastructure
  proxy available.
- No additional floor/ceiling beyond the existing fallback-to-20 behavior — an
  unusually low or high computed cap is used as-is, matching Town's own method not
  applying extra clamps beyond "historical high."
- No UI change beyond the existing Sticker Price/MOS tooltips already showing `futurePE`
  (its value will just reflect the new cap automatically — no new prop or copy needed
  there since the tooltip already interpolates `stickerResult.futurePE`).
