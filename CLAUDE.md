# PSEi Stock Research App — CLAUDE.md

## Project Purpose

A stock research web app for PSEi-listed companies. Given a ticker (e.g., BDO, ALI, JFC), the app shows:
- Recent PSE Edge disclosures and filings
- Key financial health metrics (P/E, ROE, EPS, dividend yield, debt/equity)
- Claude AI analysis: sentiment, news impact, buy/hold/avoid recommendation

## Stack

- **Next.js 14+ App Router** with TypeScript (`src/` directory layout)
- **Tailwind CSS** + **Shadcn/ui** for components
- **Axios + Cheerio** for PSE Edge scraping (server-side only, never client-side)
- **@anthropic-ai/sdk** for Claude AI analysis
- In-memory TTL cache (no database for v1)

## Key Commands

```bash
npm run dev          # Start dev server (http://localhost:3000)
npm run build        # Production build
npm run lint         # ESLint
```

## Environment Variables

See `.env.example`. Required:
- `ANTHROPIC_API_KEY` — Anthropic API key
- `CLAUDE_MODEL` — default: `claude-sonnet-4-6` (can swap to `claude-haiku-4-5-20251001`)

Optional:
- `SCRAPER_REQUEST_DELAY_MS` — default 500ms delay between PSE Edge requests
- `SCRAPER_PROXY_URL` — HTTP proxy for PSE Edge (needed on Vercel, cloud IPs may be blocked)
- `PSE_EDGE_BASE_URL` — default `https://edge.pse.com.ph`

## Project Structure

```
src/
├── app/
│   ├── page.tsx                    # Home: search bar
│   ├── stock/[ticker]/page.tsx     # Stock dashboard
│   └── api/
│       ├── search/route.ts         # GET /api/search?q=BDO
│       ├── stock/[ticker]/route.ts # GET /api/stock/[ticker]
│       └── analyze/route.ts        # POST /api/analyze
├── components/
│   ├── search/                     # SearchBar, SearchResults
│   └── dashboard/                  # StockHeader, FinancialMetrics, DisclosuresFeed, AIAnalysisPanel
├── lib/
│   ├── scraper/                    # pse-client, search/company/stock-data/disclosures scrapers
│   ├── cache/                      # in-memory-cache.ts
│   ├── ai/                         # claude-client, analysis-agent, prompt-templates
│   └── types/                      # stock.ts, disclosure.ts, analysis.ts
└── hooks/                          # useStockSearch, useAIAnalysis
```

## PSE Edge Scraping — Critical Notes

### Endpoints
- **Autocomplete (JSON)**: `GET /autoComplete/searchCompanyNameSymbol.ax?term=QUERY` — most reliable
- **Company info**: `GET /companyInformation/form.do?cmpy_id=ID`
- **Disclosures**: `POST /companyDisclosures/search.do` with form body `companyId=ID&dateSortOrder=DESC&currentPage=1`

### Headers Required
PSE Edge may reject bare Axios requests. Always set:
```
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ...
Referer: https://edge.pse.com.ph/
```

### Gotchas
1. Disclosures endpoint requires **POST** with `application/x-www-form-urlencoded` body
2. May need to GET homepage first to establish a session cookie before hitting other endpoints
3. Financial data may be missing for smaller-cap stocks — always render `N/A`, never hallucinate
4. Truncate disclosure body previews to 500 chars for AI prompts

### Cache TTLs
| Data | TTL |
|------|-----|
| Search/autocomplete | 30 min |
| Company info | 24 hrs |
| Financial metrics | 15 min |
| Disclosures | 30 min |
| AI analysis | 60 min |

## AI Analysis

Uses Claude via `@anthropic-ai/sdk`. The agent:
- Receives: company profile + financial metrics + recent disclosure titles (last 30 days)
- Outputs strict JSON (`AIAnalysis` type in `src/lib/types/analysis.ts`)
- Considers: fundamentals, sentiment, price vs fair value — **NO technical analysis**
- Model is configurable via `CLAUDE_MODEL` env var

## Session Behavior

- After completing an implementation plan, ask the user if they want to save it to `.claude/plans/`.

## Code Conventions

- All scraping happens **server-side only** (API routes or Server Components)
- Use `null` (not `undefined`) for missing financial fields
- API responses use envelope: `{ data, cached, scrapeTimestamp }`
- Components in `dashboard/` are pure presentational — no data fetching
- Data fetching lives in hooks (`useStockSearch`, `useAIAnalysis`) or server components
