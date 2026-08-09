# Sticker Price / Margin of Safety (Phil Town Rule #1)

> **Note:** implementation deviated from this doc during final review — `classifyStickerPrice` ended up taking `mosPrice` as a third argument (not re-deriving it internally), and the sticker price computation moved from `page.tsx` into `MetricStrip.tsx` so it tracks the period toggle. See commit `451d003` for the actual shipped design.

## Purpose
Add Phil Town's "Sticker Price" and "Margin of Safety (MOS) Buy Price" valuation metrics
to the stock dashboard, using data already available (EPS, historical EPS growth, last
traded price). No new scraping required.

## Formula
```
computeStickerPrice(eps: number, growthRatePct: number): { stickerPrice; mosPrice } | null

- return null if eps <= 0 or growthRatePct <= 0
- cappedGrowth = min(growthRatePct, 15) / 100          // Town's 15% growth cap
- futurePE = min(cappedGrowth * 100 * 2, 20)            // 2x growth rate, capped at 20
- futureEps = eps * (1 + cappedGrowth) ** 10            // 10-year horizon
- futureValue = futureEps * futurePE
- stickerPrice = futureValue / (1.15 ** 10)             // 15% discount rate
- mosPrice = stickerPrice * 0.5                         // 50% margin of safety
```

Growth rate input: same fallback chain already used for PEG in
`app/src/app/stock/[ticker]/page.tsx` — `summary.epsGrowth.tenYearAvg ?? fiveYearAvg ?? threeYearAvg`.
EPS input: `latestEps` (already computed in `page.tsx` for P/E).

## Components

### `app/src/service/valuation.ts` (new)
Pure function `computeStickerPrice`, as above. Unit tested in isolation.

### `app/src/service/thresholds.ts`
New function `classifyStickerPrice(lastPrice: number | null, stickerPrice: number | null): ThresholdResult`.
Kept separate from `classifyMetric` because it compares two values, not one value against
a fixed category threshold.

```
ratio = lastPrice / stickerPrice
ratio <= 0.5 -> green   (at or below MOS price)
ratio <= 1   -> yellow  (below sticker, above MOS)
ratio > 1    -> red     (above sticker price)
missing data -> neutral
```

### `app/src/app/stock/[ticker]/page.tsx`
Compute `{ stickerPrice, mosPrice }` via `computeStickerPrice(latestEps, epsGrowthRate)`.
Pass `stickerPrice`, `mosPrice`, `lastPrice` down to `MetricStrip`.

### `app/src/components/dashboard/MetricStrip.tsx`
Two new cards, following the existing P/E, P/B, PEG pattern:
- **Sticker Price (₱)** — value = `stickerPrice`, threshold via `classifyStickerPrice(lastPrice, stickerPrice)`,
  sparkline reuses `tabs.growth.eps`.
- **MOS Buy Price (₱)** — value = `mosPrice`, threshold always `'neutral'` (informational only —
  it's a derived target price, not itself a judged metric), sparkline reuses `tabs.growth.eps`.

Unit for both cards: `''` (empty), label carries the `(₱)` suffix — matches the existing
"Dividends / Share (₱)" convention in `FinancialTabs.tsx`.

## Testing
`app/src/service/valuation.test.ts`, mirroring the style of `financials.test.ts` / `thresholds.test.ts`:
- null when eps <= 0
- null when growthRate <= 0
- growth rate capped at 15% (growth input of 30% behaves same as 15%)
- future P/E capped at 20 (growth input of 15% would otherwise give P/E of 30)
- normal case produces expected sticker/MOS numbers (hand-computed fixture)

## Out of scope
- Debt payback time, net cash, inventory turns — blocked on missing absolute balance-sheet
  data (`balanceSheetList` currently comes back empty from the Morningstar scrape).
- No UI for adjusting discount rate / growth cap / MOS % — hardcoded per Town's classic
  defaults (15% discount, 15% growth cap, 20 max future P/E, 50% MOS).
