# Investment Thesis Generation (Headless Claude Code)

## Purpose
Generate a written "invest in this stock" thesis per PSEi ticker using the `claude` CLI in
headless mode (`claude -p`), through a Rule #1 / value-investor lens matching the Sticker
Price / MOS work already built. This plan covers **generation and storage only** — no UI
to display the thesis yet (follow-up work once this pipeline is validated).

## Investor Profile (fixed persona, baked into every prompt)
Rule #1 (Phil Town) value investor. Long-term horizon (5-10yr+, matching the existing
10-year Sticker Price model). Moderate risk tolerance. Judges each company through the
Four Ms: **Meaning** (understandable, within circle of competence), **Moat** (durable
competitive advantage), **Management** (honest, competent, skin in the game — inferred
from disclosures/recent news), **Margin of Safety** (price vs. computed Sticker Price).

## Rollout Scope
**Single ticker first (BDO)** — validate the full pipeline (prompt, tool access, fact-check
pass, storage) manually before running the batch. The script supports both from day one
(single-ticker CLI arg vs. the full `PSEI30` list), but the first real run targets one
ticker only; the full-batch run is a deliberate separate step after manual review of BDO's
output.

## Data Sources (all already available, no new scraping)
- `financials` table (via `transformFinancials`-equivalent extraction, duplicated in the
  script per this codebase's scripts-duplicate-not-share convention) → Big Five metrics
  (ROIC, EPS/Revenue/Net Income/FCF/Book Value growth), Debt/Equity.
- `company_profiles` table → description, sector, subsector.
- `disclosures` table → last 10 disclosures (date + template name) for the ticker.
- Live PSE Edge fetch (same pattern as `getStockData` in `app/src/lib/pse-edge.ts`,
  duplicated) → current price, 52-week high.
- Live Google News RSS fetch (same pattern as `app/src/lib/google-news.ts` /
  `scripts/news-google.ts`, duplicated) → recent headlines, for the *prompt's own
  research jumping-off point* — the model is also told to use WebSearch/WebFetch itself
  for anything more recent than what's pre-fetched.
- Sticker Price / MOS computed via the same formula as `app/src/service/valuation.ts`
  (duplicated — pure function, no framework dependency, but kept consistent with the
  existing scripts/ vs app/ separation).

## Prompt Template
```
You are a Rule #1 (Phil Town) value investor evaluating whether to invest in a
Philippine Stock Exchange (PSE) listed company for a long-term (5-10+ year)
portfolio with moderate risk tolerance.

Judge this company through the Four Ms:
- Meaning: Do you understand the business? Is it within a reasonable circle of competence?
- Moat: Does it have a durable competitive advantage (brand, network effect, switching costs, cost advantage, secret)?
- Management: Signs of honest, competent management with skin in the game?
- Margin of Safety: Is the current price meaningfully below intrinsic value (Sticker Price)?

## Company: {companyName} ({ticker})
Sector: {sector} / {subsector}
{companyDescription}

## Key Metrics (10-year averages where available)
- ROIC: {roic}
- EPS Growth: {epsGrowth}%
- Revenue Growth: {revenueGrowth}%
- Net Income Growth: {netIncomeGrowth}%
- FCF Growth: {fcfGrowth}%
- Book Value Growth: {bookValueGrowth}%
- Debt/Equity: {debtEquity}x

## Valuation
- Current Price: ₱{lastPrice}
- P/E: {pe}x | P/B: {pb}x | PEG: {peg}x | Dividend Yield: {dividendYield}%
- Sticker Price (Rule #1 fair value): ₱{stickerPrice}
- MOS Buy Price (50% margin of safety): ₱{mosPrice}
- Current price is {ABOVE/BELOW} MOS by {pct}%

## Recent Disclosures (last {n})
{disclosureList}

## Recent News (last {n})
{newsList}

## Your Task
Using the data above AND your own research — use WebSearch/WebFetch to check
for recent news, competitive developments, regulatory risk, or analyst
sentiment not captured in the static data above — write a concise investment
thesis (3-5 paragraphs) covering:
1. What the business does and whether it's understandable/meaningful
2. Whether it has a durable moat
3. Signs of management quality (or red flags) from disclosures/recent news
4. Valuation verdict: is the current price an attractive entry given the
   margin of safety, and what would you watch for
5. A clear bottom-line: buy, watch, or pass at the current price — and why

Do not hedge excessively. Take a clear position while acknowledging real
risks. Write in plain prose — no headers or bullet lists in the thesis itself.
```
Null/missing fields render as `N/A` in the interpolated prompt (matching this project's
"never hallucinate, always show N/A" convention) rather than being omitted silently.

## `claude -p` Invocation

### Pass 1 — Generation
```bash
claude -p "<assembled prompt>" \
  --model sonnet \
  --tools "WebSearch,WebFetch" \
  --permission-mode bypassPermissions \
  --max-budget-usd 0.50 \
  --output-format json \
  --no-session-persistence
```
`--tools` restricts the entire session to only those 2 read-only tools — with nothing
destructive even reachable, `bypassPermissions` is safe (no interactive approval prompts
to hang an unattended script on). Response parsed as JSON; `.result` is the thesis text,
`.total_cost_usd` logged per ticker.

### Pass 2 — Fact-Check
```bash
claude -p "<fact-check prompt>" \
  --model haiku \
  --tools "" \
  --permission-mode bypassPermissions \
  --max-budget-usd 0.10 \
  --output-format json \
  --no-session-persistence
```
No tools needed — pure text comparison. Fact-check prompt: the same Key Metrics/Valuation
data block plus the generated thesis text, asking for a JSON list of any numeric claim in
the thesis that contradicts the source data:
```
Here is the source financial data for {ticker}:
{same Key Metrics + Valuation block as Pass 1}

Here is a generated investment thesis for {ticker}:
{thesis text}

List any specific numeric claim in the thesis (price, P/E, growth rate, sticker price,
etc.) that contradicts the source data above. Respond with JSON only:
{"contradictions": ["<claim> contradicts <source value>", ...]}
Empty array if none found.
```

## Validation Before Storing
1. Pass 1's JSON parses cleanly and `.result` is non-empty.
2. Pass 2's JSON parses cleanly.
3. `contradictions` array is empty — any non-empty result **fails this ticker** (log the
   mismatches, do not store, move to next ticker in a batch run).
4. Basic sanity checks on the thesis text itself: minimum length (e.g. 500 characters),
   contains the ticker symbol or company name (case-insensitive), matches a verdict
   keyword near the end (`/\b(buy|watch|pass)\b/i`).
5. Only a thesis passing all checks is upserted into `investment_theses`.

## Storage
```sql
CREATE TABLE IF NOT EXISTS investment_theses (
  ticker        TEXT PRIMARY KEY,
  thesis        TEXT NOT NULL,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
`ON CONFLICT (ticker) DO UPDATE` — matches `company_profiles`' upsert-on-rerun pattern (a
thesis is a single mutable row per ticker, refreshed on re-run, not append-only like
disclosures).

## Script: `scripts/generate-thesis.ts`
Standalone, own `pg.Pool`, own PSE Edge / Google News fetch logic (duplicated, no
cross-import from `app/`). CLI: `pnpm generate-thesis` (defaults to the `PSEI30` list
imported from `scripts/scrape-psei30.ts`) or `pnpm generate-thesis BDO` (single ticker —
this is how the first real run will be invoked, per the Rollout Scope above). Sequential
execution (not parallel — cost/rate control, and avoids overlapping `claude` sessions).
Per-ticker console output: ticker, pass/fail, cost from both passes, contradiction list if
failed. Final summary: tickers processed, succeeded, failed (with reason breakdown:
generation error / fact-check contradiction / sanity-check failure), total cost.

## Out of Scope
- No UI to display the thesis (no API route, no stock-page card) — follow-up plan.
- No scheduled/cron regeneration — matches this project's manual-run convention for every
  other scrape/generation script.
- No retry logic beyond what `claude -p` itself does — a failed ticker (any reason) is
  logged and skipped in a batch run, not automatically retried.
