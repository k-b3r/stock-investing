# INV-14: Add thesis eval graders

PR #20. Built on INV-12 (harness) and INV-13 (dataset, `ThesisExpectations` schema).

## Goal

Script graders for thesis output, one scorecard column each, so models can be compared on content, not just format.

## Graders (`server/evals/graders/`)

| Column | File | Rule | Applies to |
|---|---|---|---|
| usable / format-perfect | `format.ts` | Existing INV-12/17 shape checks | all |
| numbers, bad figs | `numbers.ts` + `figures.ts` | Every ₱/%/x/decimal figure matches frozen data (fact-check tolerance: ~2pp / 2% rel, plus rounding). Labeled figure must match its field; others must match the data block or a derived value | all |
| verdict | `verdict.ts` | Verdict in `expect.allowedVerdicts` | all |
| consistent | `verdict.ts` | Same verdict on every run of a case | cases with 2+ runs |
| pair-shift | `verdict.ts` | Modal verdict moves toward buy when cheaper, toward pass when pricier. **Strict: unchanged fails** (user decision) | cases with `expect.pair` |
| n/a | `na-handling.ts` | No value stated for `expect.missingFields` | cases with missing fields |
| trap | `trap.ts` | A sentence names any `trap.fields` field (or its value) with doubt wording | trap cases |
| prod-sanity | `sanity.ts` | Production `sanityCheck` | all |

Scorecard regrades saved outputs with current graders; errored runs count as failures.

## Decisions

- `sanityCheck` loosened to match the format grader (`companyNames` shared in `thesis-context.ts`): prod accepts short names like "Jollibee".
- Pair-shift is strict (verdict must move), not "never worse".
- `sti` allows buy (16% ROIC at 5.8x P/E, no Sticker Price), via `ALLOWED_OVERRIDES`.

## Numbers grader: what it skips or accepts (each from a real false flag)

- Proposed prices / scenarios: "pullback toward the low ₱90s", "wait for ~₱2.50", "get interested in the low-to-mid ₱300s"
- What-if sentences (unlabeled figures only): would, I'd, if I, even if/relaxing, assume, want to see
- Range endpoints: "₱2.30–2.50", "10x to 12x"
- Derived values: price vs Sticker/MOS gaps and ratios, EPS/BVPS/DPS implied by price and multiples, earnings yield
- Lower bounds "20%+", "over 30%" (true if data is within 1x–1.5x)
- Swapped price labels ("₱3.74 sticker (₱1.87 MOS buy)"): any of the three prices counts
- Trap fields: the model replacing a bogus value with its own estimate
- Dates stripped from the pool; loose labels ("fair value", bare "earnings growth") not used

## Results (30 cases × 3 runs)

| | mimo-v2.6-flash | Sonnet |
|---|---|---|
| format-perfect | 60% | 100% |
| numbers | 98% | 99% |
| verdict | 96% | 100% |
| n/a | 98% | 100% |
| trap | 67% | 100% |
| prod-sanity | 99% | 100% |
| consistent | 83% | 80% |
| pair-shift | 75% | 100% |
| cost | $0.04 | $1.23 |

All remaining failures checked by hand and are real model errors. ~40 earlier flags were grader misses, fixed with regression tests.

## Known limitation / follow-ups

- `numbers` is pattern-based; new phrasings can false-flag. Treat failures as "look at this". Consider a model-based number check in INV-18 (LLM judge).
- Both models drift watch/pass on borderline cases (~80% consistent); relevant for INV-19 model selection.

## Rerun

```bash
cd server
pnpm eval --models mimo-v2.6-flash,sonnet --runs 3   # serial; shard with --cases for speed
pnpm eval:score
pnpm test
```
