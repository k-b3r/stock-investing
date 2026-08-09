## PSEi Stock Research App — Architecture

```mermaid
graph TD
  User -->|search query| SearchBar
  SearchBar -->|GET /api/search?q=| SearchRoute[api/search/route.ts]
  SearchRoute -->|autocomplete| PSEEdge[(PSE Edge)]

  User -->|visits /stock/BDO| StockPage[stock/ticker/page.tsx]
  StockPage -->|GET /api/stock/ticker| StockRoute[api/stock/route.ts]
  StockRoute --> CompanyScraper[scraper/company.ts]
  StockRoute --> DisclosuresScraper[scraper/disclosures.ts]
  StockRoute --> StockDataScraper[scraper/stock-data.ts]
  CompanyScraper --> PSEEdge
  DisclosuresScraper --> PSEEdge
  StockDataScraper --> PSEEdge

  StockPage -->|useAIAnalysis hook| AnalyzeRoute[api/analyze/route.ts]
  AnalyzeRoute -->|company + metrics + disclosures| ClaudeAI[Claude API]
  ClaudeAI -->|AIAnalysis JSON| AnalyzeRoute

  StockRoute --> Cache[in-memory TTL cache]
  AnalyzeRoute --> Cache

  StockPage --> StockHeader
  StockPage --> FinancialMetrics
  StockPage --> DisclosuresFeed
  StockPage --> AIAnalysisPanel
```

## Data Flow Rules
- Scraping: server-side only (API routes) — never in components or hooks
- Components: pure presentational, no fetch calls
- Hooks (useStockSearch, useAIAnalysis): client-side fetch to API routes only
- Cache sits between API routes and PSE Edge — check before scraping
- AI receives: company profile + financial metrics + disclosure titles (last 30 days, truncated to 500 chars)
