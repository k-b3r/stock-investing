# Example Plan Prompts

Good plan prompts have three parts: **goal**, **constraints**, **what NOT to do**.

---

## Bad vs Good

### Bad
```
Add authentication to the app.
```

### Good
```
Plan auth for this app. @src/app/api @src/lib/types

Goal: JWT-based auth — login, logout, protected routes.
Constraints: use existing Axios setup, no new UI libraries, tokens in httpOnly cookies only.
Don't touch: scraper/, cache/ — unrelated.
Don't introduce: sessions, OAuth, refresh tokens (out of scope for v1).
```

---

## Template

```
Plan [feature/fix]. @[relevant files or dirs]

Goal: [one sentence — what it does when done]
Constraints: [tech limits, must-use patterns, existing code to build on]
Don't touch: [files/modules that are off-limits]
Don't introduce: [patterns, libs, or scope creep to avoid]
```

---

## Real Examples

### Add a new API endpoint
```
Plan disclosure detail endpoint. @src/app/api/stock @src/lib/scraper @src/lib/types

Goal: GET /api/disclosures/[id] returns full disclosure body scraped from PSE Edge.
Constraints: follow existing envelope format { data, cached, scrapeTimestamp }, reuse pse-client.ts, cache 30min.
Don't touch: search/route.ts, analyze/route.ts.
Don't introduce: new HTTP client, no DB — cache only.
```

### Fix a bug
```
Plan fix for broken search on mobile. @src/components/search @src/hooks/useStockSearch.ts

Goal: search input works on iOS Safari — currently freezes after 2 characters.
Constraints: don't change debounce logic, don't add new deps.
Don't touch: SearchResults.tsx — layout is fine.
Don't introduce: any state management lib.
```

### Refactor
```
Plan scraper refactor. @src/lib/scraper

Goal: split monolithic pse-client.ts into focused modules (search, company, disclosures).
Constraints: keep public API identical — no changes to callers in api routes.
Don't touch: cache layer, types.
Don't introduce: new abstractions beyond the split described.
```

---

## After Claude gives the plan

1. Review it, ask clarifying questions
2. Save to `IMPLEMENTATION_PLAN.md`
3. `/clear` — then start phase 1 with fresh context
