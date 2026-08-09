# AI-Assisted Programming — General Guide

---

## Mindset

- **You are the architect. AI is the implementer.** Never let Claude make structural decisions you haven't approved. Plan first, execute second.
- **Trust but verify.** Always run tests/typecheck after AI changes. Claude is confident even when wrong.
- **Garbage in, garbage out.** Vague prompts produce vague code. The quality of output is bounded by the quality of input.
- **AI is best at the boring 80%.** Boilerplate, CRUD, type definitions, test scaffolding, refactors. The interesting 20% still needs you.

---

## Before You Prompt

- **Read the code first.** Don't ask Claude to modify code you haven't understood. You won't catch mistakes.
- **Know the goal.** If you can't state in one sentence what done looks like, you're not ready to prompt.
- **Identify constraints.** What must not change? What patterns must be followed? State them explicitly.

---

## Prompting Power Moves

**Give context, not descriptions.**
```
# Weak — Claude has to guess
Fix the scraper

# Strong — Claude has everything it needs
@src/lib/scraper/disclosures.ts POST body isn't encoding correctly.
PSE Edge returns 400. Expected: application/x-www-form-urlencoded with companyId=ID&dateSortOrder=DESC
```

**Show the error, not your interpretation of it.**
```
# Weak
The function isn't working

# Strong
Getting: TypeError: Cannot read properties of null (reading 'companyId')
at getDisclosures (disclosures.ts:42)
```

**Specify the output format.**
```
Return only the modified function, no explanation.
Return a unified diff only.
Output as a JSON schema, no prose.
```

**Constrain scope explicitly.**
```
Only change disclosures.ts. Don't touch pse-client.ts or the cache layer.
```

---

## Effective Workflows

### Explore → Plan → Execute
1. Ask Claude to explore and summarize (`/plan` mode) — no code yet
2. Review and approve the plan
3. Save plan, `/clear`, execute phase by phase

### Red-Green-Refactor with AI
1. Write the test yourself (forces you to think about the contract)
2. Ask Claude to make it pass
3. Ask Claude to refactor — you review

### Rubber Duck Debugging
Describe the bug to Claude before asking for a fix. Often the act of articulating it surfaces the answer. If not, Claude's first response (diagnosis, not fix) is usually more valuable than jumping to a solution.

### AI for Code Review
After finishing a feature yourself, ask:
```
Review @src/... for: correctness, edge cases, type safety, security, adherence to project conventions.
Don't suggest refactors — focus on bugs and risks only.
```

---

## Context Management

- One task per session. `/clear` when done.
- Start complex tasks in Plan Mode — read-only, no code changes yet.
- After compaction, re-anchor: `@CLAUDE.md @src/lib/types/stock.ts` — remind Claude of the project structure.
- When context is long, summarize explicitly: "We've established X and Y. Now do Z." Don't assume Claude remembers early conversation well.

---

## What AI Is Bad At (Don't Rely On It)

- **Knowing what you actually want** — you have to tell it precisely
- **Long-range consistency** — in long sessions, Claude drifts from earlier decisions
- **Security auditing** — it'll miss subtle vulns; use dedicated tools
- **Performance optimization** — it guesses; profile first
- **Knowing your business logic** — only you know why a rule exists
- **Staying in scope** — will refactor things you didn't ask about; always diff before accepting

---

## Model Selection Heuristic

| Task | Model |
|---|---|
| Architecture, debugging, complex logic | Sonnet / Opus |
| Boilerplate, renaming, formatting, commits | Haiku |
| Code review, explanation | Sonnet |
| Simple Q&A, quick lookups | Haiku |

Use `CLAUDE_MODEL=claude-haiku-4-5-20251001` for cheap tasks. Don't use Opus for `git commit -m`.

---

## Habits That Compound

- **Commit after every working Claude change.** Small commits = easy rollback when AI breaks something.
- **Write CLAUDE.md as you learn.** Every gotcha Claude hits = add it to the project CLAUDE.md so it never hits it again.
- **Name sessions descriptively.** `/rename auth-jwt-migration` — makes resuming and auditing easier.
- **Keep a "what failed" note.** When Claude gets stuck, document the dead end. Prevents re-running the same failing approach.
- **Treat AI suggestions as PRs.** Review the diff. Don't just accept because it compiles.

---

## Green Flags / Red Flags

| Green Flag | Red Flag |
|---|---|
| Claude asks a clarifying question | Claude immediately writes 200 lines |
| Output matches the scope you set | Claude refactors unrelated code |
| Claude says "I'm not sure, here are options" | Claude is confident on something it can't know |
| Small, focused changes | Large diffs touching many files |
| Follows existing patterns in the codebase | Introduces new patterns without asking |
