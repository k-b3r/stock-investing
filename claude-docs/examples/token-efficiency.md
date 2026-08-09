# Token Efficiency — Maximize Context, Reduce Cost

---

## Prompt Writing

**Be directive, not conversational.**
```
# Bad
Can you help me add a null check to the getCompany function when the company ID is missing?

# Good
Add null check to `getCompany` if `cmpy_id` missing. @src/lib/scraper/pse-client.ts
```

**@-mention files instead of describing them.**
```
# Bad
In the scraper file that handles company info, the function that fetches data...

# Good
@src/lib/scraper/company.ts — fix the missing header on line 34
```

**Scope tightly.**
```
# Bad
Fix the scraper

# Good
Fix POST body encoding in disclosures.ts — params need application/x-www-form-urlencoded
```

**Skip pleasantries.** No "please", "thanks", "can you". Every word costs tokens on every turn.

---

## Session Management

- `/clear` between unrelated tasks — don't carry scraper debug history into a UI task
- Plan → save to `IMPLEMENTATION_PLAN.md` → `/clear` → implement — planning loads many files; clear before executing
- Commit between phases — gives a safe checkpoint to `/clear` from
- One task per session — quality degrades as context fills; you pay for all history on each turn

---

## Model Selection

Use **Haiku** for mechanical tasks (20x cheaper than Sonnet):
```bash
# Commit messages, formatting, renaming, boilerplate
CLAUDE_MODEL=claude-haiku-4-5-20251001 claude -p "write a commit message for this diff"
```

Use **Sonnet** for logic, architecture, debugging, AI analysis.

---

## MCP Servers

Each loaded MCP server costs **8–30% of context** just by being active.
- Only load what the current task needs
- Remove unused servers between sessions
- Max 2–3 active at a time

---

## What NOT To Do

- Don't paste large files manually — use `@filename`
- Don't ask Claude to re-explain code it just wrote — it's already in context
- Don't keep one session open all day — pay for full history on every turn
- Don't load 5+ MCP servers — context bloat kills quality before you run out
