# Next.js Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Next.js 14 App Router project in `./app/` with Tailwind, Shadcn/ui, three-layer directory structure, and a verified Postgres connection.

**Architecture:** Next.js lives in `./app/` (matches docker-compose `context: ./app`). Three-layer structure inside `src/`: `app/` (routes), `service/` (business logic), `storage/` (DB), `lib/` (types/config), `components/`. Root `package.json` stays untouched — it owns the scraping scripts.

**Tech Stack:** Next.js 14, TypeScript, Tailwind CSS, Shadcn/ui, pg (Postgres), Vitest, React Testing Library

---

## File Map

| File | Responsibility |
|---|---|
| `app/src/app/layout.tsx` | Root layout — fonts, globals |
| `app/src/app/page.tsx` | Home route — blank, SearchBar placeholder |
| `app/src/app/stock/[ticker]/page.tsx` | Dashboard route — blank placeholder |
| `app/src/app/globals.css` | Tailwind directives |
| `app/src/storage/db.ts` | Postgres Pool singleton — `getPool()` |
| `app/src/lib/types/financials.ts` | Shared TypeScript types (stubs for now) |
| `app/src/storage/db.test.ts` | Integration test — DB connection health check |
| `app/next.config.ts` | Next.js config |
| `app/tailwind.config.ts` | Tailwind config |
| `app/.env.local` | Local env vars (DATABASE_URL, etc.) |
| `app/vitest.config.ts` | Vitest config |

---

## Task 1: Initialize Next.js app

**Files:**
- Create: `app/` directory (via `create-next-app`)

- [ ] **Step 1: Run create-next-app**

From the repo root (`/home/kim/Develop/portfolio/main/stock-investing`):

```bash
pnpm create next-app@14 app \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --src-dir \
  --no-turbopack \
  --import-alias "@/*"
```

When prompted for any options not covered by flags, choose: Yes to App Router, Yes to `src/` dir.

- [ ] **Step 2: Verify it runs**

```bash
cd app && pnpm dev
```

Expected: server starts at http://localhost:3000 with no errors. Hit Ctrl+C.

- [ ] **Step 3: Commit**

```bash
cd ..
git add app/
git commit -m "scaffold next.js 14 app in ./app"
```

---

## Task 2: Install Shadcn/ui

**Files:**
- Modify: `app/src/app/globals.css` (Shadcn adds CSS vars)
- Modify: `app/tailwind.config.ts` (Shadcn extends)
- Create: `app/components.json` (Shadcn config)
- Create: `app/src/lib/utils.ts` (Shadcn's `cn()` helper)

- [ ] **Step 1: Init Shadcn**

```bash
cd app && pnpm dlx shadcn@latest init
```

When prompted:
- Style: **Default**
- Base color: **Slate**
- CSS variables: **Yes**

- [ ] **Step 2: Add the components we'll need**

```bash
pnpm dlx shadcn@latest add button card tabs badge tooltip input
```

- [ ] **Step 3: Verify app still builds**

```bash
pnpm build
```

Expected: compiled successfully, no type errors.

- [ ] **Step 4: Commit**

```bash
cd ..
git add app/
git commit -m "add shadcn/ui with button, card, tabs, badge, tooltip, input"
```

---

## Task 3: Create three-layer directory structure

**Files:**
- Create: `app/src/service/.gitkeep`
- Create: `app/src/storage/.gitkeep`
- Create: `app/src/lib/types/financials.ts`
- Create: `app/src/components/search/.gitkeep`
- Create: `app/src/components/dashboard/.gitkeep`

- [ ] **Step 1: Create directories and type stubs**

```bash
mkdir -p app/src/service
mkdir -p app/src/storage
mkdir -p app/src/lib/types
mkdir -p app/src/components/search
mkdir -p app/src/components/dashboard
```

- [ ] **Step 2: Create type stubs**

Create `app/src/lib/types/financials.ts`:

```typescript
export interface RawFinancials {
  ticker: string;
  performance_id: string | null;
  data: Record<string, unknown>;
  scraped_at: string;
}

export interface GrowthMetric {
  tenYearAvg: number | null;
  fiveYearAvg: number | null;
  threeYearAvg: number | null;
  yearOverYear: number | null;
}

export interface SummaryMetrics {
  roic: number | null;
  epsGrowth: GrowthMetric;
  revenueGrowth: GrowthMetric;
  netIncomeGrowth: GrowthMetric;
  fcfGrowth: GrowthMetric;
  bookValueGrowth: number | null;
  debtEquity: number | null;
}

export type ThresholdResult = 'green' | 'yellow' | 'red' | 'neutral';

export interface YearDataPoint {
  year: string;
  value: number | null;
}

export interface FinancialTabs {
  growth: {
    eps: YearDataPoint[];
    revenue: YearDataPoint[];
    netIncome: YearDataPoint[];
  };
  profitability: {
    roe: YearDataPoint[];
    roa: YearDataPoint[];
    roic: YearDataPoint[];
  };
  financialHealth: {
    debtEquity: YearDataPoint[];
    currentRatio: YearDataPoint[];
    bookValuePerShare: YearDataPoint[];
  };
  cashFlow: {
    fcfGrowth: YearDataPoint[];
    operatingCFGrowth: YearDataPoint[];
    fcfToNetIncome: YearDataPoint[];
  };
}

export interface TransformedFinancials {
  ticker: string;
  scrapedAt: string;
  summary: SummaryMetrics;
  tabs: FinancialTabs;
}
```

- [ ] **Step 3: Commit**

```bash
git add app/src/
git commit -m "add three-layer directory structure and type stubs"
```

---

## Task 4: Set up Postgres storage layer

**Files:**
- Create: `app/src/storage/db.ts`
- Create: `app/.env.local`
- Create: `app/vitest.config.ts`
- Create: `app/src/storage/db.test.ts`

- [ ] **Step 1: Add pg dependency to app**

```bash
cd app && pnpm add pg && pnpm add -D @types/pg vitest @vitejs/plugin-react vite-tsconfig-paths
cd ..
```

- [ ] **Step 2: Add Vitest config**

Create `app/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    globals: true,
  },
});
```

- [ ] **Step 3: Add test script to app/package.json**

Open `app/package.json` and add to `"scripts"`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Create .env.local**

Create `app/.env.local`:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/stocks
```

- [ ] **Step 5: Write the failing test**

Create `app/src/storage/db.test.ts`:

```typescript
import { describe, it, expect, afterAll } from 'vitest';
import { getPool } from './db';

describe('db', () => {
  afterAll(async () => {
    await (await getPool()).end();
  });

  it('connects to Postgres and returns a result', async () => {
    const pool = await getPool();
    const result = await pool.query<{ one: string }>('SELECT 1 AS one');
    expect(result.rows[0].one).toBe('1');
  });

  it('returns null for unknown ticker via raw query', async () => {
    const pool = await getPool();
    const result = await pool.query(
      'SELECT * FROM financials WHERE ticker = $1',
      ['DOESNOTEXIST']
    );
    expect(result.rows).toHaveLength(0);
  });
});
```

- [ ] **Step 6: Run test — verify it fails**

```bash
cd app && pnpm test
```

Expected: FAIL — `Cannot find module './db'`

- [ ] **Step 7: Implement db.ts**

Create `app/src/storage/db.ts`:

```typescript
import pg from 'pg';

let pool: pg.Pool | null = null;

export async function getPool(): Promise<pg.Pool> {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }
  return pool;
}
```

- [ ] **Step 8: Run test — verify it passes**

Make sure `stocks-db` Docker container is running first:

```bash
cd .. && docker compose up -d postgres && sleep 3
cd app && pnpm test
```

Expected:
```
✓ src/storage/db.test.ts (2)
  ✓ connects to Postgres and returns a result
  ✓ returns null for unknown ticker via raw query
```

- [ ] **Step 9: Commit**

```bash
cd ..
git add app/
git commit -m "add postgres pool singleton and connection tests"
```

---

## Task 5: Create blank route pages

**Files:**
- Modify: `app/src/app/page.tsx`
- Create: `app/src/app/stock/[ticker]/page.tsx`
- Modify: `app/src/app/layout.tsx`

- [ ] **Step 1: Update home page**

Replace `app/src/app/page.tsx` with:

```typescript
export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        <h1 className="text-3xl font-bold text-center mb-8">
          PSEi Stock Research
        </h1>
        <p className="text-center text-muted-foreground">
          Search coming soon
        </p>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Create stock dashboard page**

Create `app/src/app/stock/[ticker]/page.tsx`:

```typescript
interface Props {
  params: Promise<{ ticker: string }>;
}

export default async function StockPage({ params }: Props) {
  const { ticker } = await params;

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">{ticker.toUpperCase()}</h1>
        <p className="text-muted-foreground">Dashboard coming soon</p>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Verify both routes render**

```bash
cd app && pnpm dev
```

- Visit http://localhost:3000 — should show "PSEi Stock Research" heading
- Visit http://localhost:3000/stock/BDO — should show "BDO" heading
- Hit Ctrl+C

- [ ] **Step 4: Verify build passes**

```bash
pnpm build
```

Expected: `✓ Compiled successfully` with no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
cd ..
git add app/
git commit -m "add home and stock dashboard placeholder routes"
```

---

## Self-Review

**Spec coverage:**
- [x] `pnpm dev` runs at localhost:3000 — Task 1 Step 2
- [x] `/` renders blank homepage — Task 5 Step 1
- [x] `/stock/[ticker]` renders blank dashboard — Task 5 Step 2
- [x] Postgres client in `storage/` verified — Task 4
- [x] Directory structure: `app/`, `service/`, `storage/`, `lib/types/`, `components/` — Task 3
- [x] Tailwind installed — Task 1 (create-next-app flag)
- [x] Shadcn/ui installed — Task 2
- [x] `pnpm build` passes — Task 5 Step 4

**Placeholder scan:** No TBD, no TODO, no "implement later". All code steps have actual code.

**Type consistency:** `RawFinancials`, `TransformedFinancials`, `SummaryMetrics`, `FinancialTabs`, `ThresholdResult`, `YearDataPoint`, `GrowthMetric` defined in Task 3 — referenced consistently in db.test.ts (indirectly via `financials` table query). No naming drift.
