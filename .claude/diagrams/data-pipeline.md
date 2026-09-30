# Data Pipeline: Data Flow

How data enters the system, where it is stored, and what reads it. Shapes: `([source])` external service, `(process)` script or route, `[(store)]` PostgreSQL table or file.

## 1. Batch ingestion and thesis generation

Scripts in `server/scripts/`, run by hand (`pnpm <script>` in `server/`). They fill PostgreSQL; the web app never scrapes history at request time.

```mermaid
flowchart LR
  subgraph ext[External sources]
    MS([Morningstar API])
    PSEF([PSE frames: index lists])
    PSEE([PSE Edge])
    GN([Google News RSS])
    FXA([open.er-api.com: USD/PHP])
    CLI([claude CLI: Sonnet + WebSearch, Haiku])
  end

  subgraph jobs[Batch jobs]
    IDX(scrape-index-composition)
    MSJ(scrape-ms / scrape-psei30 / scrape-all-pse)
    PROF(scrape-company-profiles)
    DISC(scrape-disclosures)
    DCON(scrape-disclosure-content)
    CTX(buildTickerContext)
    GEN(generate-thesis)
  end

  subgraph db[PostgreSQL]
    FIN[(financials)]
    CP[(company_profiles)]
    DS[(disclosures)]
    IT[(investment_theses)]
  end

  PSEF --> IDX -->|PSEi / MidCap tickers| MSJ
  PSEE -->|company list| MSJ
  MS --> MSJ -->|raw financial JSON| FIN

  FIN -->|ticker list| PROF
  PSEE -->|company page| PROF --> CP

  FIN -->|ticker list| DISC
  PSEE -->|disclosure search| DISC -->|metadata| DS
  DS -->|rows without body| DCON
  PSEE -->|disclosure page| DCON -->|content| DS

  FIN --> CTX
  CP --> CTX
  DS -->|recent templates| CTX
  PSEE -->|live price, 52w high| CTX
  GN -->|headlines| CTX
  FXA -->|USD financials only| CTX

  CTX -->|data block| GEN
  GEN <-->|thesis, then fact-check| CLI
  GEN -->|approved thesis + verdict| IT
```

**Watch the PSE Edge company lookup.** `PROF`, `DISC`, `CTX` and the web app all resolve a ticker to a PSE Edge company ID first. When that lookup matched the wrong company (fixed in INV-11 with an exact symbol match), the error spread to every table downstream. Rows scraped before the fix were re-scraped in INV-13.

## 2. Web app requests

Next.js server components read stored data through Express and fetch live price and news directly. Client components never fetch or scrape.

```mermaid
flowchart LR
  B([Browser])

  subgraph next[Next.js :3000]
    SR(api/search)
    SP(stock/ticker page)
    SC(screener page)
  end

  subgraph api[Express :3001]
    RF(GET /financials)
    RP(GET /company-profiles/:t)
    RD(GET /disclosures/:t)
    RT(GET /investment-theses/:t)
  end

  subgraph db[PostgreSQL]
    FIN[(financials)]
    CP[(company_profiles)]
    DS[(disclosures)]
    IT[(investment_theses)]
  end

  PSEE([PSE Edge])
  GN([Google News RSS])
  FXA([open.er-api.com])

  B -->|search box| SR -->|autocomplete| PSEE
  B --> SP
  B --> SC

  SP --> RF & RP & RD & RT
  SC -->|all rows| RF
  RF --> FIN
  RP --> CP
  RD --> DS
  RT --> IT

  SP -->|live price, company name| PSEE
  SC -->|live prices| PSEE
  SP -->|recent news| GN
  SP & SC -->|USD/PHP| FXA
```

## 3. Model evals

`server/evals/` freezes the same thesis input production builds, so every model sees identical data.

```mermaid
flowchart LR
  FIN[(financials)] & CP[(company_profiles)] & DS[(disclosures)] --> CTX(buildTickerContext)
  PSEF([PSE frames]) -->|index tier| SEL(eval:select)
  CTX --> SEL
  SEL -->|approved tickers| FRZ(eval:freeze)
  CTX --> FRZ -->|frozen data block + expectations| CASES[(evals/cases/*.json)]
  CASES --> RUN(eval) <-->|prompt / answer| GO([OpenCode Go API])
  RUN -->|output, tokens, cost| RES[(evals/results/, gitignored)]
  RES --> SCORE(eval:score) -->|graders| CARD([scorecard])
```

## Lineage table

| Table / file | Written by | Read by |
|---|---|---|
| `financials` | Morningstar scrape jobs | profiles and disclosures jobs (ticker list), `buildTickerContext`, `GET /financials` (dashboard, screener) |
| `company_profiles` | `scrape-company-profiles` | `buildTickerContext`, `GET /company-profiles/:t` |
| `disclosures` | `scrape-disclosures` (metadata), `scrape-disclosure-content` (body) | `buildTickerContext` (recent templates), `GET /disclosures/:t` |
| `investment_theses` | `generate-thesis` (after fact-check + sanity check) | `GET /investment-theses/:t` (dashboard) |
| `evals/cases/` | `eval:freeze` | `eval` |
| `evals/results/` | `eval` | `eval:score` |

Not stored (fetched live each time): prices and 52-week highs (PSE Edge), news headlines (Google News), USD/PHP rate. The `company` and `news` tables are legacy and unused by current code.
