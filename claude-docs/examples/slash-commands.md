# Example Custom Slash Commands

Place these as `.md` files in `.claude/commands/`. Use `$ARGUMENTS` to capture input.

Usage: `/review src/lib/scraper/pse-client.ts`

---

## review.md

```markdown
Review $ARGUMENTS for:
- Correctness and edge cases
- TypeScript type safety (no implicit `any`)
- Security: no secrets logged, no XSS/injection risk
- Performance: no N+1, no unnecessary awaits
- Adherence to project conventions (envelope format, null not undefined, server-side only scraping)

Output as a prioritized list: Critical → Moderate → Minor.
```

---

## pr.md

```markdown
Write a PR description for the current git diff.

Format:
## What
[1-3 bullets: what changed]

## Why
[1-2 sentences: motivation]

## Risk
[any breakage risk or areas to watch]

Be concise. No filler.
```

---

## explain.md

```markdown
Explain $ARGUMENTS as if I'm unfamiliar with this part of the codebase.

Cover:
- What it does and why it exists
- How it fits into the overall architecture
- Any non-obvious gotchas or constraints
- Where it's called from / what calls it

Be concise. Assume I know TypeScript and Next.js but not this specific code.
```

---

## debug.md

```markdown
Debug $ARGUMENTS.

Steps:
1. Identify the most likely root cause
2. List other possible causes (ranked by likelihood)
3. Suggest the minimal change to fix it
4. Note any related areas that might also be affected

Don't fix speculatively — diagnose first.
```

---

## migrate.md

```markdown
Generate a DB migration for: $ARGUMENTS

Follow project conventions:
- Migrations are append-only (never edit existing)
- Snake_case column names
- All tables need id (uuid), created_at, updated_at
- Output two files: generate.ts (produces SQL) and migrate.ts (executes it)

Show the migration SQL first, then the scripts.
```
