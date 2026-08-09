# Claude Code Power User Setup Checklist

## Phase 1 — Foundation (Do once)

- [ ] Install VS Code Claude Code extension
- [ ] Run `claude /init` in each project → generates starter CLAUDE.md
- [ ] Create `~/.claude/CLAUDE.md` for global memory
  - Add: concision rule
  - Add: unresolved questions rule
- [ ] Set up Fish aliases in `~/.config/fish/config.fish`
  - `cc` → `claude`
  - `ccr` → `claude --continue`
  - `ccarch` → claude with architecture diagram pre-loaded
  - `ccdiff` → git diff piped to PR summary

## Phase 2 — Per-Project Config

- [ ] Write `.claude/CLAUDE.md` with:
  - [ ] Stack overview (Node, TS, PG, Redis, etc.)
  - [ ] Key commands (build, test, lint, typecheck, migrate)
  - [ ] Architecture rules (storage → service → routes, no barrels)
  - [ ] What NOT to do list
- [ ] Create `.claude/diagrams/architecture.md` with Mermaid flow diagrams
- [ ] Create `.claude/settings.json` with hooks:
  - [ ] `PostToolUse` → TypeScript check on `.ts` file edits
  - [ ] `Stop` → lint + typecheck + checkpoint commit
  - [ ] `SessionStart` → inject git status + branch name
- [ ] Create `.claude/commands/` with custom slash commands:
  - [ ] `review.md`
  - [ ] `pr.md`
  - [ ] `migrate.md`
  - [ ] `explain.md`

## Phase 3 — MCP Setup

- [ ] GitHub MCP → `claude mcp add github npx @modelcontextprotocol/server-github`
- [ ] PostgreSQL MCP → connect to dev DB
- [ ] Context7 MCP → live library docs
- [ ] (Optional) Sequential Thinking MCP → complex architecture sessions
- [ ] Verify: keep active MCPs ≤ 3 at a time

## Phase 4 — Daily Workflow Habits

- [ ] Always start complex tasks in Plan Mode (Shift+Tab)
- [ ] Save plan to `IMPLEMENTATION_PLAN.md` before executing
- [ ] `/clear` after saving plan, between phases, on new topics
- [ ] Use `!command` for bash (not asking Claude to run it)
- [ ] `/rename` sessions with descriptive names
- [ ] Commit after every meaningful Claude change (safety net)
- [ ] Check `llms.txt` for key dependencies before starting

## Phase 5 — Voice (Optional)

- [ ] Evaluate: macOS dictation (Fn Fn) for terminal input
- [ ] Evaluate: Superwhisper or MacWhisper for richer voice control
