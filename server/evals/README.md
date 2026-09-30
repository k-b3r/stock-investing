# Model evals

Compares OpenCode Go models on the app's AI jobs using frozen inputs. Claude models are not candidates (production won't use them); the claude CLI adapter only runs Opus for drafting and judging.

```bash
cd server
pnpm eval:select                    # scan DB tickers by sector/price band/tier, suggest ~20 (--refresh re-scans)
pnpm eval:freeze                    # freeze every ticker in thesis-dataset.ts + rebuild variants
pnpm eval:freeze AREIT BDO          # refreeze just these (DB + live price/news) and their variants
pnpm eval:freeze --variants-only    # rebuild variants from frozen bases, no network
pnpm eval                           # run default models on all cases, grade, print scorecard
pnpm eval --models glm-5.3,kimi-k3 --cases areit --runs 3
pnpm eval:score                     # reprint scorecard from saved results
pnpm eval:score factcheck           # reprint fact-check scorecard
pnpm eval:score research            # reprint research scorecard
pnpm test                           # grader unit tests
```

- `cases/<suite>/*.json` — frozen inputs, committed. Each thesis case has an `expect` block: `kind` (real / price-shift / blanked / trap), `base` case, index `tier`, price `band` (below-mos / mos-to-sticker / above-sticker / no-sticker / no-price), `allowedVerdicts`, `missingFields` (null in the data, so the thesis must not state them), plus `pair` (price-shift: the real case it differs from only in price) or `trap` (patched fields and what the model should notice).
- `thesis-dataset.ts` — the approved real tickers and the variant specs. Allowed verdicts default by band (`bands.ts`): buy/watch at or below MOS, watch/pass otherwise and for every trap; per-case overrides in `ALLOWED_OVERRIDES`.
- `variants.ts` — derives variants from a frozen real case. Price shifts rescale P/E, P/B, PEG and dividend yield; the data block, band and missing fields are rebuilt from the edited context.
- `results/<suite>/<model>/<case>.r<n>.json` — raw output, tokens, cost, latency, grades. Gitignored.
- `models.ts` — model list and Go per-token prices (cost = tokens × price).
- `adapters/` — `go.ts` calls the Go chat-completions API (`OPENCODE_API_KEY`, `x-opencode-session` header); `claude-cli.ts` (Opus drafting and judging only) runs `claude -p` isolated from Claude Code's own context (no tools, settings, MCP, skills or CLAUDE.md), billed to the CLI subscription.
- `prompts.ts` — production thesis prompt with the web-research sentence swapped for "use only the provided data", since eval models get no tools.
- `graders/` — one scorecard column each. `pnpm eval:score` regrades saved outputs with the current graders.
  - `format.ts`: thesis shape, using the same parser `generate-thesis.ts` stores with. `usable` = verdict + 3 highlights parse (without them the app stores the thesis but shows no verdict or highlights); `format-perfect` = all checks incl. style.
  - `numbers.ts`: every figure (₱, %, x, or decimal) matches the frozen data within the fact-check prompt's tolerance (~2pp / 2% relative, plus rounding to the stated precision). A figure right after a field label ("P/E of 13.4x") must match that field; others must match any number in the data block or a derived value (price vs Sticker/MOS gaps and ratios, EPS/BVPS implied by price and multiples). Figures the model proposes rather than quotes are skipped: entry prices and scenarios ("toward the low ₱90s", "re-rating toward 0.6x") and range endpoints ("₱2.30–2.50"). `bad figs` = wrong + invented.
  - `verdict.ts`: `verdict` = verdict in `expect.allowedVerdicts`. `consistent` = same verdict on every run of a case (needs `--runs 2+`). `pair-shift` = for a case with `expect.pair`, the modal verdict moves toward buy when the price is lower than the paired case, toward pass when higher (unchanged fails).
  - `na-handling.ts` (`n/a`): no value stated for any `expect.missingFields` field. Only cases with missing fields.
  - `trap.ts`: for a case with `expect.trap`, some sentence names any of `trap.fields` (or its value) and doubts it. Only trap cases.
  - `sanity.ts` (`prod-sanity`): `sanityCheck` from `thesis-context.ts`, the last gate before `generate-thesis.ts` stores a thesis.

## Fact-check suite

Grades models on the production fact-check prompt (`buildFactCheckPrompt`, run by Haiku in `generate-thesis.ts`): given source data and a thesis, list contradictions.

```bash
cd server
pnpm eval:factcheck:freeze          # stored theses + today's source data → cases/factcheck/bases/ (price fields overlaid with generation-time values)
pnpm eval:factcheck:draft --model opus   # per base: edits making the thesis agree with its source (clean copy) + candidate planted errors
pnpm eval:factcheck:build           # pick ~40 planted + ~15 clean cases, write cases/factcheck/*.json and REVIEW.md
pnpm eval:factcheck --models mimo-v2.6-flash,glm-5.3 --runs 3   # approved cases only; --all includes unapproved
```

- Error types: size, direction, year, units (₱M vs ₱B), stake, currency (USD/PHP). Real past failures: KEEPR 30% Pernod stake, PPC ₱3.72B net income. Script mutations (`mutations.ts`) fill types the drafts leave short.
- Clean cases: plain, rounding-only (within the prompt's tolerance), and BPI "founded 1851" (true, not in source; a past false alarm). Any flag on a clean case is a false alarm.
- Each planted error lists `match` strings; a contradiction containing any of them catches it. Contradictions matching no planted error are false alarms.
- Scorecard: recall (planted errors caught), precision (flags that name a planted error), clean-pass, recall per type. Scores regrade saved outputs against current cases.
- Every case needs user approval (`approved: true`) after reviewing `cases/factcheck/REVIEW.md`. Web checks of each case's facts live in `cases/factcheck/review/verification.json` (verified / source-only / conflict); conflicts are listed at the top of REVIEW.md.

## Research suite

Models answer a factual question about a PSE company from a frozen bundle of 5-10 documents and cite one document id. No live search: the fetcher searched once and saved the results, so every model reads the same pages.

```bash
cd server
pnpm eval:research:fetch            # build missing bundles from research/questions.json (--all rebuilds, --review only rewrites REVIEW.md)
pnpm eval:research:draft --id … --ticker … --company … --category … --as-of … --url … --question … --write   # Opus drafts a non-DB key
pnpm eval:research                  # run default models on verified cases (--all includes unverified), grade, print scorecard
pnpm eval:research --models glm-5.3,kimi-k3 --cases div-areit-q1-2026-record
```

- `research/questions.json` — hand-edited questions: as-of date, answer key (amount / percent / date / text / not_found), retrieval plan (answer and stale PSE Edge filings, answer web pages, Google News queries, `exclude` patterns, noise count, synthetic `conflict` value). `verified` = 2+ independent sources agree (primary filing/IR, reputable news; aggregators don't count), the user accepted it after review, or for not-found keys the bundle was checked to lack the answer. `verification` lists the sources checked; an open `issue` puts the key under "Conflicts for user" at the top of `research/REVIEW.md`.
- `research/fetch.ts` — builds `cases/research/<id>.json`: the answer filing or page, stale/superseded filings (pre-amendment dates, prior periods), Google News hits dated on or before the as-of date, a synthetic aggregator page repeating a wrong value, and unrelated filings as noise, shuffled with a seed. Warns when an answer doc does not match its key. Rewrites `research/REVIEW.md` (generated).
- `research/draft-key.ts` — drafts a key for a non-DB fact: fetches the page, asks Opus (claude CLI, subscription, same isolation as the eval adapter) for the answer plus a verbatim quote, and rejects the draft unless the quote is in the page and the key matches it.
- `../scripts/research-fetcher.ts` — the reusable part (Google News search and link decoding, page text extraction, primary/aggregator/news classification, filing docs), for thesis generation to read pre-fetched docs too (INV-21).
- `research/grader.ts` — `correct` (answer matches the key: amounts with units like "P3.2 billion", percents, dates in common formats, text aliases), `citedHasAnswer`, `citedPrimary` (the company's filing or site, not an aggregator or news), `notFoundHandled` (says not found exactly when the bundle has no answer). Scorecard (regrades saved runs against current cases): pass, correct, cite has ans, cite primary, false NF (said not found when the answer was there), NF handled.

## Judge (thesis reasoning)

Opus 5.5 compares finalists' theses pairwise on what the script graders can't score: Meaning, Moat (evidence vs assertion), Management (grounded in the disclosures and news, nothing invented) and whether the bottom line follows from the argument. Reads saved thesis results; never re-runs the candidates.

```bash
cd server
pnpm eval:judge --models a,b,c                     # round-robin every pair on every case, print scorecard
pnpm eval:judge --models a,b,c --cases areit,bdo   # subset of cases
pnpm eval:judge --models a,b,c --judge kimi-k3 --sample 10   # bias check: re-judge 10 Opus-judged pair-cases, report agreement
JUDGE_LIVE=1 pnpm test prompts/judge               # live Opus check: known-better AREIT thesis beats a known-worse one in both orders
```

- `judge.ts` — per case and pair, the first usable run (`format.usable`) of each model is judged; a pair-case is skipped when either model has none. Already-judged pair-cases are kept unless the judged runs changed (`--redo` forces). `--concurrency` (default 3) parallel pair-cases.
- Blind: the judge sees the case's `dataBlock` and theses labeled A and B, never model names. Each pair-case is judged twice with A/B swapped; a model wins only if both orders pick it, otherwise tie (cancels position bias). A failed or unparseable call leaves the pair-case unscored.
- `prompts/judge.ts` — rubric and reply parser (per-criterion A/B/tie + overall winner + reason, JSON).
- Scorecard: win/tie/loss per model vs the other finalists, score = (wins + ties/2) / judged, rank; plus head-to-head counts.
- Bias check: a Go judge re-judges an evenly spread sample of Opus-judged pair-cases, skipping pairs that include itself. Agreement below 70% is flagged for user review.
- `results/thesis/judge/<modelA>-vs-<modelB>/<case>.json` — both orderings, verdicts, reasons, judged run numbers (bias-check judge: `results/thesis/judge-<model>/`).
