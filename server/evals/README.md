# Model evals

Compares OpenCode Go models (and Claude baselines) on the app's AI jobs using frozen inputs.

```bash
cd server
pnpm eval:freeze AREIT BDO          # snapshot thesis input (DB + live price/news) to cases/thesis/
pnpm eval                           # run default models on all cases, grade, print scorecard
pnpm eval --models glm-5.3,sonnet --cases areit --runs 3
pnpm eval:score                     # reprint scorecard from saved results
pnpm test                           # grader unit tests

pnpm eval:fetch-research            # build missing research bundles from research/questions.json
pnpm eval:draft-key --id … --url … --question … --write   # Opus drafts a non-DB key (see below)
pnpm eval --suite research --models glm-5.3,sonnet
pnpm eval:score research
```

- `cases/<suite>/*.json` — frozen inputs, committed. Suites: `thesis`, `research`.
- `results/<suite>/<model>/<case>.r<n>.json` — raw output, tokens, cost, latency, grades. Gitignored.
- `models.ts` — model list and Go per-token prices (cost = tokens × price).
- `adapters/` — `go.ts` calls the Go chat-completions API (`OPENCODE_API_KEY`, `x-opencode-session` header); `claude-cli.ts` runs `claude -p` isolated from Claude Code's own context (no tools, settings, MCP, skills or CLAUDE.md), billed to the CLI subscription.
- `prompts.ts` — production thesis prompt with the web-research sentence swapped for "use only the provided data", since eval models get no tools.
- `graders/` — `format.ts` checks the thesis shape using the same parser `generate-thesis.ts` stores with. `usable` = verdict + 3 highlights parse (without them the app stores the thesis but shows no verdict or highlights); `pass` = all checks incl. style (format-perfect).

## Research suite

Models answer a factual question from a frozen bundle of 5-10 documents and cite one document id. No live search.

- `research/questions.json` — hand-written questions (as-of date, answer key, retrieval plan). Keys come from PSE Edge disclosures in the DB (plus a few company pages). `verified` = 2+ independent sources agree (primary filing/IR, reputable news; aggregators don't count), or for not-found keys the bundle was checked to lack the answer. `verification` lists the sources checked; `issue` says why a key stays unverified, and those are listed under "Conflicts for user" at the top of `REVIEW.md`.
- `fetch-research.ts` — builds `cases/research/<id>.json`: the answer filing plus stale/superseded filings (DB), Google News hits dated on or before the as-of date, a synthetic aggregator page repeating a wrong value (`conflict`), and unrelated filings as noise. Not-found questions point at a filing that omits the value and use `exclude` to drop web docs that might contain it. Warns when an answer filing does not match its key. Rewrites `research/REVIEW.md` (the verification sheet).
- `draft-research-key.ts` (`pnpm eval:draft-key`) — drafts a key for a non-DB fact: fetches the page, asks Opus (claude CLI, subscription, same isolation as the eval adapter) for the answer plus a verbatim quote, rejects the draft unless the quote is in the page and the key matches it, then appends it unverified (`answerUrls` = the page).
- `../scripts/research-fetcher.ts` — the reusable part (Google News search + link decoding, page text extraction, source classification, filing docs), for thesis generation to read pre-fetched docs too.
- `graders/research.ts` — per run: `correct` (answer matches the key: amounts with units like "P3.2 billion", percents, dates in common formats, text aliases), `citedHasAnswer` (the cited doc states the key), `citedPrimary` (the cited doc is the company's filing, not an aggregator or news), `notFoundHandled` (says not found exactly when the bundle has no answer). Scorecard: pass, correct, cite has ans, cite primary, false NF (said not found when the answer was there), NF handled.
