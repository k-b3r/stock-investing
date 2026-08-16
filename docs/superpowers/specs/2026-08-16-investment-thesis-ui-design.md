# Investment Thesis UI

## Purpose
Display the stored investment thesis (from `investment_theses`, populated by
`scripts/generate-thesis.ts`) on `/stock/[ticker]`, below `CompanyAbout`. Shows a summary
first — verdict, key figures, 2-3 highlight bullets, generation date — then the full
prose thesis behind a collapsible "Full Analysis" section.

## Data Model Changes
The generation script currently stores only `thesis TEXT`. This plan extends it to also
capture, at generation time:
- **Verdict** (`buy` / `watch` / `pass`) and **2-3 highlight bullets** — from the AI
  itself, via an explicit delimited block appended to its response (not a second API call,
  not `--json-schema`, whose interaction with `--output-format json`/streaming is
  unverified and not worth the risk for a well-specified small addition).
- **Key figures snapshot** (`last_price`, `sticker_price`, `mos_price`, `pe`) — from our
  own already-computed `TickerContext`, zero AI involvement. Stored as a snapshot, not
  re-fetched live at page-render time: a thesis reasons about the numbers *as they were
  when generated*, and re-showing different live numbers next to old prose would read as
  self-contradictory as prices drift.

### Schema (additive — `investment_theses` already has one row, for BDO)
```sql
ALTER TABLE investment_theses ADD COLUMN IF NOT EXISTS verdict TEXT;
ALTER TABLE investment_theses ADD COLUMN IF NOT EXISTS highlights TEXT[];
ALTER TABLE investment_theses ADD COLUMN IF NOT EXISTS last_price NUMERIC;
ALTER TABLE investment_theses ADD COLUMN IF NOT EXISTS sticker_price NUMERIC;
ALTER TABLE investment_theses ADD COLUMN IF NOT EXISTS mos_price NUMERIC;
ALTER TABLE investment_theses ADD COLUMN IF NOT EXISTS pe NUMERIC;
```
Existing BDO row will have `NULL` for the new columns until `generate-thesis.ts` is
re-run for it after this plan lands (explicit step, not silent — the UI must handle a row
with `verdict`/`highlights`/key figures all `NULL` gracefully, since that's BDO's current
real state until regenerated).

## Generation Script Changes (`scripts/generate-thesis.ts`)
- `INSTRUCTIONS` gains a final requirement: after the 5-paragraph prose thesis, append a
  delimited block in this exact format:
  ```
  ---VERDICT---
  buy
  ---HIGHLIGHTS---
  - <highlight 1>
  - <highlight 2>
  - <highlight 3>
  ```
  (`verdict` is exactly one of `buy`/`watch`/`pass`, lowercase; 2-3 highlight bullets,
  each one line.)
- After Pass 1 returns, before fact-checking: split the response on the `---VERDICT---`
  marker. Everything before it is the prose thesis (stored in `thesis`, same as today —
  the fact-check pass and sanity checks still run against this prose portion only, no
  change to that logic). Everything after is parsed for `verdict` (the line after
  `---VERDICT---`) and `highlights` (bullet lines after `---HIGHLIGHTS---`, `- ` prefix
  stripped). If the markers are missing or parsing fails, `verdict`/`highlights` are
  stored as `null`/`[]` and a warning is logged — this must **not** fail the whole
  ticker, since the prose thesis (the part that matters most, and the part fact-checked)
  is still valid and storable.
- `upsertThesis` gains 4 more parameters (`verdict`, `highlights`, and the 4 key-figure
  numbers already present on `TickerContext` — `lastPrice`, `stickerPrice`, `mosPrice`,
  `pe`) and writes them into the new columns.

## New Files

### `api/src/routes/investment-theses.ts`
Same shape as `api/src/routes/company-profiles.ts`: `GET /investment-theses/:ticker`,
selects all columns, 404 if no row, 200 with the row (snake_case) otherwise. Registered in
`api/src/index.ts` alongside the existing routes.

### `app/src/storage/investment-thesis.ts`
Same shape as `app/src/storage/company-profiles.ts`: `getInvestmentThesis(ticker)` fetches
from the new API route, maps snake_case → camelCase, returns
`InvestmentThesis | null`:
```typescript
export interface InvestmentThesis {
  thesis: string;
  verdict: 'buy' | 'watch' | 'pass' | null;
  highlights: string[];
  lastPrice: number | null;
  stickerPrice: number | null;
  mosPrice: number | null;
  pe: number | null;
  generatedAt: string;
}
```

### `app/src/components/dashboard/InvestmentThesisCard.tsx`
Presentational, matches `CompanyAbout.tsx`'s conventions (`Card`/`CardContent`, returns
`null` if the prop is `null`, matching "no card for missing data"). Layout:
- Header row: "Investment Thesis" label + generation date (`generatedAt`, formatted like
  the disclosure dates already are elsewhere in this app) + a verdict badge (color-coded:
  green for `buy`, yellow for `watch`, red for `pass`, neutral/hidden if `verdict` is
  `null` — matches this app's existing green/yellow/red threshold color convention).
- Key figures row: same 4-value compact layout style as `CompanyAbout`'s Sector/Subsector/
  Incorporation Date/Website facts row — Current Price, Sticker Price, MOS Buy Price, P/E,
  each rendering `N/A` if `null` (existing project-wide convention).
- Highlights: bullet list, only rendered if `highlights.length > 0`.
- Full Analysis: click-to-expand section (reusing the same `useState<boolean>` toggle
  pattern already used for the Disclosures list in `FinancialTabs.tsx`), collapsed by
  default, revealing the full `thesis` prose (with `whitespace-pre-wrap`, matching
  `CompanyAbout`'s description rendering) when expanded.

## Page Wiring (`app/src/app/stock/[ticker]/page.tsx`)
- Fetch `getInvestmentThesis(upper)` in the existing `Promise.all` block, alongside
  `getCompanyProfile`.
- Render `<InvestmentThesisCard thesis={investmentThesis} />` after `<CompanyAbout>`, as
  the new last element on the page.

## Testing
No automated tests — matches this project's established convention (no tests for
scripts/, API routes, storage clients, or dashboard components anywhere in this
codebase). Verification: re-run `pnpm generate-thesis BDO` after the script changes land,
confirm the new columns populate correctly, then visually confirm the card renders on
`/stock/BDO` with the summary showing before the expandable full thesis.

## Out of Scope
- No batch re-generation for other tickers (still just BDO, per this session's ongoing
  single-ticker-first validation).
- No editing/regenerating from the UI — this card is read-only, matching every other
  data card on this page.
- No historical thesis versions — `investment_theses` stays one row per ticker
  (upsert-on-regenerate), same as `company_profiles`. A past thesis is simply overwritten,
  not archived.
