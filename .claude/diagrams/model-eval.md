# Model Eval: Data Flow

How `server/evals/` picks an OpenCode Go model for each AI job in the app: thesis writing, fact-check, and reading research. Claude models are not candidates (production won't run behind the `claude` CLI); Opus 5.5 is used only to draft datasets and to judge.

Status colors: **green** merged on `main`, **yellow** open PR, **grey dashed** planned ticket, **blue hexagon** step that needs the user.

## 1. Datasets: built once, frozen, reviewed

```mermaid
flowchart LR
  classDef merged fill:#d4edda,stroke:#2e7d32,color:#1b3a1f
  classDef pr fill:#fff3cd,stroke:#b8860b,color:#4d3800
  classDef planned fill:#eceff1,stroke:#78909c,color:#37474f,stroke-dasharray:4 3
  classDef human fill:#e3f2fd,stroke:#1565c0,color:#0d2a4d

  subgraph srcs[Sources]
    DB[(PostgreSQL: financials, company_profiles, disclosures, investment_theses)]
    PSEF([PSE frames: index tiers])
    PSEE([PSE Edge filings])
    WEB([Google News + company sites])
    OPUS([Opus 5.5 via claude CLI])
  end

  subgraph A[Thesis dataset: INV-13]
    SEL(eval:select: sector x price band x tier) --> APR{{user approves tickers}}
    APR --> FRZ(eval:freeze) --> VAR(variants: price-shift pairs, blanked fields, traps)
    VAR --> TC[(cases/thesis: 30 cases + expect metadata)]
  end

  subgraph B[Fact-check dataset: INV-15]
    FB(freeze-bases: stored thesis + source data) --> DR(draft: clean copy + planted errors)
    DR --> VAL(validate: gradeable?) --> BLD(build: type-balanced set)
    BLD --> FC[(cases/factcheck: 40 planted + 15 clean)]
    FC --> REV1{{web check 2+ sources, user approves}}
  end

  subgraph C[Research dataset: INV-16]
    Q[(questions.json: 60 Qs, as-of dates)] --> FR(fetch-research: bundles w/ answer, stale, fake aggregator, noise)
    FR --> RC[(cases/research: frozen bundles)]
    Q --> REV2{{web check 2+ sources, user verifies keys}}
  end

  DB --> SEL & FRZ & FB
  PSEF --> SEL
  PSEE --> FR
  WEB --> FR
  OPUS -->|drafts errors| DR
  OPUS -->|drafts non-DB keys| Q
  DB -->|disclosure keys| Q

  class SEL,FRZ,VAR,TC merged
  class FB,DR,VAL,BLD,FC,Q,FR,RC pr
  class APR,REV1,REV2 human
```

## 2. Runs and grading: every candidate model, same frozen input

```mermaid
flowchart LR
  classDef merged fill:#d4edda,stroke:#2e7d32,color:#1b3a1f
  classDef pr fill:#fff3cd,stroke:#b8860b,color:#4d3800
  classDef planned fill:#eceff1,stroke:#78909c,color:#37474f,stroke-dasharray:4 3

  TC[(thesis cases)] --> RUN
  FC[(fact-check cases)] --> RUNF
  RC[(research bundles)] --> RUNR

  GO([OpenCode Go API: 10 shortlist models])

  RUN(eval: thesis prompt, data-only) <--> GO
  RUNF(eval:factcheck: production fact-check prompt) <--> GO
  RUNR(eval --suite research: answer + cite doc id) <--> GO

  RUN --> RES[(results/thesis/model/case.rN.json)]
  RUNF --> RESF[(results/factcheck)]
  RUNR --> RESR[(results/research)]

  RES --> GT(thesis graders: usable, format-perfect, numbers, verdict band, n/a, trap, pair-shift, consistency, prod-sanity)
  RESF --> GF(fact-check grader: recall, precision, clean-pass, per error type)
  RESR --> GR(research grader: correct, cited doc has answer, cited primary, not-found handled)

  GT & GF & GR --> CARD(eval:score: scorecard per suite)

  class RUN,RES merged
  class RUNF,RESF,GF,RUNR,RESR,GR,CARD pr
  class GT pr
```

Format grading (`usable`, `format-perfect`) is merged; the content graders in the thesis box are PR #20. Every run records tokens, cost and latency next to the output.

## 3. Picking a model per job

```mermaid
flowchart LR
  classDef merged fill:#d4edda,stroke:#2e7d32,color:#1b3a1f
  classDef pr fill:#fff3cd,stroke:#b8860b,color:#4d3800
  classDef planned fill:#eceff1,stroke:#78909c,color:#37474f,stroke-dasharray:4 3
  classDef human fill:#e3f2fd,stroke:#1565c0,color:#0d2a4d

  CARD(scorecards, 3 runs per case) --> FULL(INV-19: full run, all 10 Go models, inside Go spend caps)
  FULL --> FIN{{finalists: 3-4 per job}}
  FIN --> JUDGE(INV-18: Opus 5.5 judge, finalists round-robin, blind, both orders)
  JUDGE -->|reasoning quality: meaning, moat, management| RANK(win/tie/loss + rank)
  KIMI([kimi-k3 bias spot-check]) -.-> JUDGE
  RANK --> PICK{{INV-20: user picks model per job}}
  PICK --> FCJOB(fact-check moves to Go)
  PICK --> THJOB(INV-21: thesis writer moves to Go with pre-fetched search)
  FCJOB & THJOB --> PROD([production generate-thesis.ts])

  class CARD pr
  class FULL,JUDGE,RANK,FCJOB,THJOB planned
  class FIN,PICK human
```

The judge only scores what scripts can't: the quality of the investment reasoning. Everything else is graded by code, so answer keys come from the database, primary sources, or user sign-off, never from a model alone.
