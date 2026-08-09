# Example: ~/.claude/CLAUDE.md (Global)

This file applies to ALL projects. Keep it short — project-specific rules go in the project CLAUDE.md.

---

```markdown
# Global Instructions

## Style
- Extremely concise in all responses and commit messages. Sacrifice grammar for concision.
- Only explain reasoning when it adds real value — skip narration for obvious/mechanical steps.
- At the end of each plan, list unresolved questions as terse bullet points.

## Behavior
- When stuck after 3 attempts: stop, document what failed, ask.
- Never use --no-verify, --dangerously-skip-permissions, or force-push to main.
- Never commit broken builds.

## Commits
- Imperative, lowercase, concise. No period.
- Examples: `fix auth token expiry`, `add disclosure cache`, `refactor scraper split`
```

---

## What NOT to put here

- Project-specific commands (build, test, lint) → project CLAUDE.md
- Stack/architecture details → project CLAUDE.md
- File structure → project CLAUDE.md

Global = habits. Project = context.
