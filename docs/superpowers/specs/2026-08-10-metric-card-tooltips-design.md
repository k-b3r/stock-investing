# Metric Card Info Badges

## Purpose
Extend the hover info badge already built for the Sticker Price / MOS Buy Price cards
(`app/src/components/dashboard/MetricCard.tsx`'s `tooltip` prop) to the remaining 11
cards in `MetricStrip`: ROIC, EPS Growth, Revenue Growth, Net Income Growth, FCF Growth,
Book Value Growth, Debt/Equity, Dividend Yield, P/E, P/B, PEG. Each card gets a one-line
formula/definition plus its green/yellow/red threshold cutoffs.

## Scope Decision
Sticker Price/MOS tooltips show real numbers plugged in for the current ticker (a
multi-step calculation where seeing the intermediate values adds real information). These
11 cards are all single-step formulas (`price ÷ eps`, `debt ÷ equity`, etc.) — showing the
real numbers would just repeat what the card's own displayed value already says, with no
new information. This feature uses static formula + explanation + threshold text instead,
matching the level of detail the Sticker Price/MOS tooltips had *before* the real-values
enhancement was added.

## Threshold Reference
Pulled from `app/src/service/thresholds.ts`'s `classifyMetric`:
- `debtEquity`: ≤0.5 green, ≤1.0 yellow, >1.0 red
- `pe`: ≤15 green, ≤25 yellow, >25 red
- `pb`: ≤1.5 green, ≤3 yellow, >3 red
- `peg`: ≤1 green, ≤2 yellow, >2 red
- everything else (`growth`, `roic` — this covers ROIC, EPS/Revenue/NI/FCF/Book Value
  Growth, and Dividend Yield, which all call `classifyMetric('growth', ...)` or
  `classifyMetric('roic', ...)`): ≥10% green, ≥5% yellow, <5% red

## Component
No changes to `MetricCard.tsx` or `thresholds.ts` — the `tooltip` prop and its rendering
already exist from the Sticker Price/MOS work. This is purely additive data in
`app/src/components/dashboard/MetricStrip.tsx`'s `metrics` array: each of the 11 existing
entries (currently missing a `tooltip` field) gets one added.

Growth-category tooltips (EPS/Revenue/Net Income Growth) interpolate the component's
existing `period` state variable (`'3Y' | '5Y' | '10Y'`, already in scope) since the
period toggle changes what CAGR window is shown — the tooltip should say which window is
currently active, not a fixed claim. FCF Growth and Book Value Growth get accuracy notes
instead of period interpolation:
- FCF Growth is computed as an averaged year-over-year percentage
  (`computeFcfGrowthAvgs` in `service/financials.ts`), not a compound annual growth rate
  like the others — its tooltip says "average year-over-year growth" instead of "compound
  annual growth rate" to avoid implying a CAGR calculation that isn't actually happening.
- Book Value Growth (`computeBookValueGrowth`) is a single CAGR over the entire available
  history and does **not** respond to the period toggle at all (confirmed by reading
  `service/financials.ts`) — its tooltip says so explicitly, since showing an unqualified
  "compound annual growth rate" next to a toggle that visibly changes other cards but not
  this one would read as a bug.

## Exact Copy
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

## Testing
No automated tests — `MetricStrip.tsx` has no existing tests (it's a presentational
component reading pre-computed props, matching the project's convention that dashboard
components aren't unit tested). Verification is `pnpm tsc --noEmit` plus manual browser
check that all 13 cards (11 new + the 2 already done) show an info icon and correct
hover text, including confirming EPS/Revenue/Net Income/FCF Growth tooltip text updates
when the 3Y/5Y/10Y toggle changes.

## Out of scope
- No real-number interpolation for these 11 cards (decided above).
- No changes to threshold values or card layout/colors.
- No tooltip for the period toggle buttons themselves (3Y/5Y/10Y) — only the metric cards.
