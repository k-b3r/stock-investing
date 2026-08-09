# Example: .claude/CLAUDE.md (Project-level)

This is a filled-in example for this stock-investing app.
Copy, adapt, and commit it as `.claude/CLAUDE.md` in each project.

---

```markdown
# PSEi Stock Research App

## Stack
- Next.js 14 App Router + TypeScript (`src/` layout)
- Tailwind CSS + Shadcn/ui
- Axios + Cheerio (scraping — server-side only)
- @anthropic-ai/sdk (AI analysis)
- In-memory TTL cache (no DB in v1)

## Key Commands
npm run dev          # dev server → localhost:3000
npm run build        # production build
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit

## Architecture
src/
  app/api/           # API routes (server only)
  components/        # Presentational only — no data fetching
  lib/scraper/       # PSE Edge scraping — never import client-side
  lib/cache/         # In-memory TTL cache
  lib/ai/            # Claude client + prompts
  lib/types/         # Shared types
  hooks/             # useStockSearch, useAIAnalysis

Rules:
- All scraping: server-side only (API routes or Server Components)
- Components in dashboard/ are pure presentational
- Data fetching lives in hooks/ or server components
- API responses: { data, cached, scrapeTimestamp }
- Missing financial fields: null (not undefined), render as N/A — never hallucinate

## PSE Edge Gotchas
- Disclosures: POST with application/x-www-form-urlencoded (not GET)
- May need GET homepage first to set session cookie
- Always set User-Agent + Referer headers or requests get rejected
- Truncate disclosure bodies to 500 chars for AI prompts

## Cache TTLs
- Search/autocomplete: 30 min
- Company info: 24 hrs
- Financial metrics: 15 min
- Disclosures: 30 min
- AI analysis: 60 min

## What NOT To Do
- Never import scraper code in client components
- Never return undefined for missing fields — use null
- Never hallucinate financial data — render N/A
- Never add technical analysis to AI prompts (fundamentals + sentiment only)
- Never commit with lint or type errors
```

---

## What makes a good project CLAUDE.md

| Section | Purpose |
|---|---|
| Stack | Claude picks the right libs/patterns without asking |
| Key Commands | Claude runs the right commands without guessing |
| Architecture | Claude places new code in the right layer |
| Gotchas | Prevents repeating known mistakes |
| What NOT To Do | Hard stops on things that have burned you before |

Keep it under ~80 lines. Long = ignored.
