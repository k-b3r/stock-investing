# Model evals

Compares OpenCode Go models (and Claude baselines) on the app's AI jobs using frozen inputs.

```bash
cd server
pnpm eval:freeze AREIT BDO          # snapshot thesis input (DB + live price/news) to cases/thesis/
pnpm eval                           # run default models on all cases, grade, print scorecard
pnpm eval --models glm-5.3,sonnet --cases areit --runs 3
pnpm eval:score                     # reprint scorecard from saved results
pnpm test                           # grader unit tests
```

- `cases/<suite>/*.json` — frozen inputs, committed.
- `results/<suite>/<model>/<case>.r<n>.json` — raw output, tokens, cost, latency, grades. Gitignored.
- `models.ts` — model list and Go per-token prices (cost = tokens × price).
- `adapters/` — `go.ts` calls the Go chat-completions API (`OPENCODE_API_KEY`, `x-opencode-session` header); `claude-cli.ts` runs `claude -p` isolated from Claude Code's own context (no tools, settings, MCP, skills or CLAUDE.md), billed to the CLI subscription.
- `prompts.ts` — production thesis prompt with the web-research sentence swapped for "use only the provided data", since eval models get no tools.
- `graders/` — `format.ts` checks the thesis shape using the same parser `generate-thesis.ts` stores with. `usable` = verdict + 3 highlights parse (what the app needs to store it); `pass` = all checks incl. style (format-perfect).
