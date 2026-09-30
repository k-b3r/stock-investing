# Model evals

Compares OpenCode Go models (and Claude baselines) on the app's AI jobs using frozen inputs.

```bash
cd server
pnpm eval:select                    # scan DB tickers by sector/price band/tier, suggest ~20 (--refresh re-scans)
pnpm eval:freeze                    # freeze every ticker in thesis-dataset.ts + rebuild variants
pnpm eval:freeze AREIT BDO          # refreeze just these (DB + live price/news) and their variants
pnpm eval:freeze --variants-only    # rebuild variants from frozen bases, no network
pnpm eval                           # run default models on all cases, grade, print scorecard
pnpm eval --models glm-5.3,sonnet --cases areit --runs 3
pnpm eval:score                     # reprint scorecard from saved results
pnpm eval:score factcheck           # reprint fact-check scorecard
pnpm test                           # grader unit tests
```

- `cases/<suite>/*.json` — frozen inputs, committed. Each thesis case has an `expect` block: `kind` (real / price-shift / blanked / trap), `base` case, index `tier`, price `band` (below-mos / mos-to-sticker / above-sticker / no-sticker / no-price), `allowedVerdicts`, `missingFields` (null in the data, so the thesis must not state them), plus `pair` (price-shift: the real case it differs from only in price) or `trap` (patched fields and what the model should notice).
- `thesis-dataset.ts` — the approved real tickers and the variant specs. Allowed verdicts default by band (`bands.ts`): buy/watch at or below MOS, watch/pass otherwise and for every trap; per-case overrides in `ALLOWED_OVERRIDES`.
- `variants.ts` — derives variants from a frozen real case. Price shifts rescale P/E, P/B, PEG and dividend yield; the data block, band and missing fields are rebuilt from the edited context.
- `results/<suite>/<model>/<case>.r<n>.json` — raw output, tokens, cost, latency, grades. Gitignored.
- `models.ts` — model list and Go per-token prices (cost = tokens × price).
- `adapters/` — `go.ts` calls the Go chat-completions API (`OPENCODE_API_KEY`, `x-opencode-session` header); `claude-cli.ts` runs `claude -p` isolated from Claude Code's own context (no tools, settings, MCP, skills or CLAUDE.md), billed to the CLI subscription.
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
pnpm eval:factcheck --models haiku,glm-5.3 --runs 3   # approved cases only; --all includes unapproved
```

- Error types: size, direction, year, units (₱M vs ₱B), stake, currency (USD/PHP). Real past failures: KEEPR 30% Pernod stake, PPC ₱3.72B net income. Script mutations (`mutations.ts`) fill types the drafts leave short.
- Clean cases: plain, rounding-only (within the prompt's tolerance), and BPI "founded 1851" (true, not in source; a past false alarm). Any flag on a clean case is a false alarm.
- Each planted error lists `match` strings; a contradiction containing any of them catches it. Contradictions matching no planted error are false alarms.
- Scorecard: recall (planted errors caught), precision (flags that name a planted error), clean-pass, recall per type. Scores regrade saved outputs against current cases.
- Every case needs user approval (`approved: true`) after reviewing `cases/factcheck/REVIEW.md`.
