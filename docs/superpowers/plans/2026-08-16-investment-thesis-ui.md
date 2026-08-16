# Investment Thesis UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the stored investment thesis on `/stock/[ticker]` — a summary (verdict
badge, key figures, highlight bullets, generation date) shown first, full prose thesis
behind a collapsible "Full Analysis" section below it.

**Architecture:** Task 1 extends `investment_theses`'s schema and `scripts/generate-thesis.ts`
to capture a verdict + highlights (parsed from a delimited block the AI appends after the
prose thesis) plus a snapshot of the key figures already computed in `TickerContext` — all
additive, no change to the already-working generation/fact-check/sanity-check logic for
the prose thesis itself. Task 2 adds the read path: an API route + storage client, same
shape as the existing `company_profiles` pair. Task 3 adds the presentational component
and wires it into the stock page.

**Tech Stack:** Next.js 14 App Router, TypeScript, Express, Postgres, `pg`.

## Global Constraints

- Verdict/highlights come from the AI via a delimited text block appended after the prose
  thesis (not `--json-schema`, not a second call) — exact format:
  ```
  ---VERDICT---
  buy
  ---HIGHLIGHTS---
  - <highlight 1>
  - <highlight 2>
  - <highlight 3>
  ```
  `verdict` is exactly one of `buy`/`watch`/`pass`, lowercase.
- The prose thesis (everything before `---VERDICT---`) is what gets fact-checked and
  sanity-checked — unchanged logic, just operating on the split-off prose portion instead
  of the raw full response.
- If the markers are missing or unparseable, `verdict`/`highlights` are stored as
  `null`/`[]` and a warning is logged — this must NOT fail the ticker; the prose thesis is
  still valid on its own.
- Key figures (`last_price`, `sticker_price`, `mos_price`, `pe`) are a **snapshot** taken
  from `TickerContext` at generation time, not re-fetched live when the page renders —
  they must match what the thesis was reasoning about.
- `investment_theses` schema changes are additive (`ALTER TABLE ADD COLUMN IF NOT EXISTS`)
  — the existing BDO row is not dropped or recreated.
- No automated tests anywhere in this plan — matches this project's established
  convention (scripts/, API routes, storage clients, dashboard components all have none).
- Follow existing code style: 2-space indent, single quotes, semicolons, no comments
  unless explaining non-obvious "why".

---

### Task 1: Schema + generation script — verdict, highlights, key-figure snapshot

**Files:**
- Modify: `scripts/schema.sql`
- Modify: `scripts/generate-thesis.ts`

**Interfaces:**
- Produces: `investment_theses` table gains columns `verdict TEXT`, `highlights TEXT[]`,
  `last_price NUMERIC`, `sticker_price NUMERIC`, `mos_price NUMERIC`, `pe NUMERIC` —
  consumed by Task 2's API route.

- [ ] **Step 1: Add the new columns to the schema file**

Append to `scripts/schema.sql` (after the existing `investment_theses` table):

```sql
ALTER TABLE investment_theses ADD COLUMN IF NOT EXISTS verdict TEXT;
ALTER TABLE investment_theses ADD COLUMN IF NOT EXISTS highlights TEXT[];
ALTER TABLE investment_theses ADD COLUMN IF NOT EXISTS last_price NUMERIC;
ALTER TABLE investment_theses ADD COLUMN IF NOT EXISTS sticker_price NUMERIC;
ALTER TABLE investment_theses ADD COLUMN IF NOT EXISTS mos_price NUMERIC;
ALTER TABLE investment_theses ADD COLUMN IF NOT EXISTS pe NUMERIC;
```

- [ ] **Step 2: Apply the schema change**

Run: `PGPASSWORD=postgres psql -h localhost -U postgres -d stocks -f scripts/schema.sql`
Expected: no errors (the `ALTER ... ADD COLUMN IF NOT EXISTS` statements are safe to
re-run). Verify: `PGPASSWORD=postgres psql -h localhost -U postgres -d stocks -c "\d investment_theses"`
— expect all 8 columns (`ticker`, `thesis`, `generated_at`, plus the 6 new ones).

- [ ] **Step 3: Extend the `INSTRUCTIONS` prompt to request the delimited block**

In `scripts/generate-thesis.ts`, find the `INSTRUCTIONS` constant (currently ends with):

```typescript
Do not hedge excessively. Take a clear position while acknowledging real
risks. Write in plain prose — no headers or bullet lists in the thesis itself.`;
```

Change it to:

```typescript
Do not hedge excessively. Take a clear position while acknowledging real
risks. Write in plain prose — no headers or bullet lists in the thesis itself.

After the thesis, append exactly this delimited block (do not add anything
after it):

---VERDICT---
<one of: buy, watch, pass — lowercase, nothing else on this line>
---HIGHLIGHTS---
- <first highlight, one line>
- <second highlight, one line>
- <third highlight, one line>`;
```

- [ ] **Step 4: Split the response and parse the delimited block**

In `scripts/generate-thesis.ts`'s `generateForTicker` function, find:

```typescript
  const thesis = genResult.result.trim();
  const genCost = genResult.total_cost_usd ?? 0;
```

Change it to:

```typescript
  const rawResult = genResult.result.trim();
  const genCost = genResult.total_cost_usd ?? 0;

  const [thesisPart, blockPart] = rawResult.split('---VERDICT---');
  const thesis = thesisPart.trim();

  let verdict: 'buy' | 'watch' | 'pass' | null = null;
  let highlights: string[] = [];
  if (blockPart) {
    const verdictMatch = blockPart.match(/^\s*(buy|watch|pass)\s*$/m);
    verdict = (verdictMatch?.[1] as 'buy' | 'watch' | 'pass' | undefined) ?? null;
    const highlightsSection = blockPart.split('---HIGHLIGHTS---')[1] ?? '';
    highlights = highlightsSection
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).trim());
  }
  if (!verdict || highlights.length === 0) {
    console.log(`\n    [warn] could not parse verdict/highlights block for ${ctx.ticker} — storing thesis without them`);
  }
```

Every subsequent use of `thesis` in this function (the fact-check prompt interpolation and
`sanityCheck(thesis, ctx)` call) already refers to this same `thesis` variable — no other
line in this function needs to change for those references to now use the split prose-only
version.

- [ ] **Step 5: Pass the new fields into `upsertThesis`**

Find the final call in `generateForTicker`:

```typescript
  await upsertThesis(ctx.ticker, thesis);
  return { ok: true, cost: totalCost };
```

Change it to:

```typescript
  await upsertThesis(ctx.ticker, thesis, verdict, highlights, ctx.lastPrice, ctx.stickerPrice, ctx.mosPrice, ctx.pe);
  return { ok: true, cost: totalCost };
```

- [ ] **Step 6: Update `upsertThesis`'s signature and SQL**

Find:

```typescript
async function upsertThesis(ticker: string, thesis: string): Promise<void> {
  await pool.query(
    `INSERT INTO investment_theses (ticker, thesis, generated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (ticker) DO UPDATE SET thesis = EXCLUDED.thesis, generated_at = now()`,
    [ticker, thesis]
  );
}
```

Replace it with:

```typescript
async function upsertThesis(
  ticker: string,
  thesis: string,
  verdict: 'buy' | 'watch' | 'pass' | null,
  highlights: string[],
  lastPrice: number | null,
  stickerPrice: number | null,
  mosPrice: number | null,
  pe: number | null
): Promise<void> {
  await pool.query(
    `INSERT INTO investment_theses (ticker, thesis, verdict, highlights, last_price, sticker_price, mos_price, pe, generated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (ticker) DO UPDATE SET
       thesis = EXCLUDED.thesis,
       verdict = EXCLUDED.verdict,
       highlights = EXCLUDED.highlights,
       last_price = EXCLUDED.last_price,
       sticker_price = EXCLUDED.sticker_price,
       mos_price = EXCLUDED.mos_price,
       pe = EXCLUDED.pe,
       generated_at = now()`,
    [ticker, thesis, verdict, highlights, lastPrice, stickerPrice, mosPrice, pe]
  );
}
```

- [ ] **Step 7: Re-run for BDO and verify**

Run: `pnpm generate-thesis BDO`

This makes a real `claude -p` call (same as before, real cost). Expected: succeeds same as
the prior run, now also printing a `[warn]` line only if the delimited block genuinely
failed to parse (should not happen in the normal case).

Verify: `PGPASSWORD=postgres psql -h localhost -U postgres -d stocks -c "SELECT ticker, verdict, highlights, last_price, sticker_price, mos_price, pe, generated_at FROM investment_theses WHERE ticker = 'BDO'"`

Expected: `verdict` is one of `buy`/`watch`/`pass`, `highlights` is a Postgres array with
2-3 entries, and the 4 numeric columns are populated with real numbers (not null) unless
BDO's underlying computed values were genuinely null (unlikely, per the earlier
`buildTickerContext` verification this session).

- [ ] **Step 8: Commit**

```bash
git add scripts/schema.sql scripts/generate-thesis.ts
git commit -m "capture verdict, highlights, and key-figure snapshot in thesis generation"
```

---

### Task 2: API route + storage client

**Files:**
- Create: `api/src/routes/investment-theses.ts`
- Modify: `api/src/index.ts`
- Create: `app/src/storage/investment-thesis.ts`

**Interfaces:**
- Consumes: `investment_theses` table (Task 1) via `getPool()` from `api/src/db.ts`.
- Produces: `GET /investment-theses/:ticker` (used by Task 2's own storage client) and
  `interface InvestmentThesis { thesis: string; verdict: 'buy' | 'watch' | 'pass' | null; highlights: string[]; lastPrice: number | null; stickerPrice: number | null; mosPrice: number | null; pe: number | null; generatedAt: string }`
  plus `getInvestmentThesis(ticker: string): Promise<InvestmentThesis | null>` — used by
  Task 3 (`page.tsx`).

- [ ] **Step 1: Write the API route**

Create `api/src/routes/investment-theses.ts`:

```typescript
import { Router } from 'express';
import { getPool } from '../db.js';

const router = Router();

router.get('/:ticker', async (req, res) => {
  try {
    const { rows } = await getPool().query(
      `SELECT thesis, verdict, highlights, last_price, sticker_price, mos_price, pe, generated_at
       FROM investment_theses WHERE ticker = $1`,
      [req.params.ticker.toUpperCase()]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

export default router;
```

- [ ] **Step 2: Register the route**

In `api/src/index.ts`, change:

```typescript
import express from 'express';
import financialsRouter from './routes/financials.js';
import disclosuresRouter from './routes/disclosures.js';
import companyProfilesRouter from './routes/company-profiles.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(express.json());
app.use('/financials', financialsRouter);
app.use('/disclosures', disclosuresRouter);
app.use('/company-profiles', companyProfilesRouter);
```

to:

```typescript
import express from 'express';
import financialsRouter from './routes/financials.js';
import disclosuresRouter from './routes/disclosures.js';
import companyProfilesRouter from './routes/company-profiles.js';
import investmentThesesRouter from './routes/investment-theses.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(express.json());
app.use('/financials', financialsRouter);
app.use('/disclosures', disclosuresRouter);
app.use('/company-profiles', companyProfilesRouter);
app.use('/investment-theses', investmentThesesRouter);
```

- [ ] **Step 3: Restart the API and verify the route**

Run: `docker restart psei_api` (check `docker ps --format "{{.Names}}"` first if the
container name has changed).

Then: `curl -s http://localhost:3001/investment-theses/BDO`
Expected: JSON with `thesis` (the prose), `verdict` (`"buy"`/`"watch"`/`"pass"`),
`highlights` (an array), `last_price`/`sticker_price`/`mos_price`/`pe` (numbers), and
`generated_at`. Also verify the 404 path:
`curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/investment-theses/NOTATICKER`
— expect `404`.

- [ ] **Step 4: Write the storage client**

Create `app/src/storage/investment-thesis.ts`:

```typescript
const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export interface InvestmentThesis {
  thesis: string;
  verdict: 'buy' | 'watch' | 'pass' | null;
  highlights: string[];
  lastPrice: number | null;
  stickerPrice: number | null;
  mosPrice: number | null;
  pe: number | null;
  generatedAt: string;
}

interface DbInvestmentThesis {
  thesis: string;
  verdict: 'buy' | 'watch' | 'pass' | null;
  highlights: string[] | null;
  last_price: string | null;
  sticker_price: string | null;
  mos_price: string | null;
  pe: string | null;
  generated_at: string;
}

export async function getInvestmentThesis(ticker: string): Promise<InvestmentThesis | null> {
  const res = await fetch(`${API_URL}/investment-theses/${ticker.toUpperCase()}`, {
    next: { revalidate: 1800 },
  });
  if (!res.ok) return null;
  const row = (await res.json()) as DbInvestmentThesis;
  return {
    thesis: row.thesis,
    verdict: row.verdict,
    highlights: row.highlights ?? [],
    lastPrice: row.last_price === null ? null : parseFloat(row.last_price),
    stickerPrice: row.sticker_price === null ? null : parseFloat(row.sticker_price),
    mosPrice: row.mos_price === null ? null : parseFloat(row.mos_price),
    pe: row.pe === null ? null : parseFloat(row.pe),
    generatedAt: row.generated_at,
  };
}
```

Note: Postgres `NUMERIC` columns are returned by the `pg` driver as strings (to avoid
floating-point precision loss), hence the `parseFloat` calls — this matches how numeric
DB values are handled anywhere else `pg` results cross a JSON boundary in this codebase.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/investment-theses.ts api/src/index.ts app/src/storage/investment-thesis.ts
git commit -m "add investment-theses API route and storage client"
```

---

### Task 3: `InvestmentThesisCard` component + page wiring

**Files:**
- Create: `app/src/components/dashboard/InvestmentThesisCard.tsx`
- Modify: `app/src/app/stock/[ticker]/page.tsx`

**Interfaces:**
- Consumes: `InvestmentThesis` type and `getInvestmentThesis` from
  `@/storage/investment-thesis` (Task 2).
- Produces: `InvestmentThesisCard({ thesis }: { thesis: InvestmentThesis | null })` —
  rendered directly by `page.tsx`. No other file depends on this component.

- [ ] **Step 1: Create the component**

Create `app/src/components/dashboard/InvestmentThesisCard.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { InvestmentThesis } from '@/storage/investment-thesis';

interface Props {
  thesis: InvestmentThesis | null;
}

const verdictColor: Record<'buy' | 'watch' | 'pass', string> = {
  buy: 'text-green-600 bg-green-50',
  watch: 'text-yellow-600 bg-yellow-50',
  pass: 'text-red-600 bg-red-50',
};

function formatDate(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmt(value: number | null): string {
  return value === null ? 'N/A' : `₱${value.toFixed(2)}`;
}

function KeyFigure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  );
}

export function InvestmentThesisCard({ thesis }: Props) {
  const [expanded, setExpanded] = useState(false);

  if (!thesis) return null;

  return (
    <Card>
      <CardContent className="pt-4 pb-4 px-4 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Investment Thesis · {formatDate(thesis.generatedAt)}
          </p>
          {thesis.verdict && (
            <span className={cn('text-xs font-bold px-2 py-0.5 rounded uppercase', verdictColor[thesis.verdict])}>
              {thesis.verdict}
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <KeyFigure label="Current Price" value={fmt(thesis.lastPrice)} />
          <KeyFigure label="Sticker Price" value={fmt(thesis.stickerPrice)} />
          <KeyFigure label="MOS Buy Price" value={fmt(thesis.mosPrice)} />
          <KeyFigure label="P/E" value={thesis.pe === null ? 'N/A' : `${thesis.pe.toFixed(1)}x`} />
        </div>

        {thesis.highlights.length > 0 && (
          <ul className="list-disc list-inside space-y-1 text-sm">
            {thesis.highlights.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between py-1.5 text-left text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <span>Full Analysis</span>
          <span>{expanded ? '▲' : '▼'}</span>
        </button>
        {expanded && (
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{thesis.thesis}</p>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire it into the stock page**

In `app/src/app/stock/[ticker]/page.tsx`, add the import (alongside the other component
imports):

```typescript
import { getInvestmentThesis } from '@/storage/investment-thesis';
```

and:

```typescript
import { InvestmentThesisCard } from '@/components/dashboard/InvestmentThesisCard';
```

Change the second `Promise.all` (currently):

```typescript
  const [stockData, disclosures, newsArticles, usdToPhpRate, companyProfile] = await Promise.all([
    getStockData(upper),
    getDisclosures(upper),
    companyName ? getNewsArticles(companyName) : Promise.resolve([]),
    getUsdToPhpRate(),
    getCompanyProfile(upper),
  ]);
```

to:

```typescript
  const [stockData, disclosures, newsArticles, usdToPhpRate, companyProfile, investmentThesis] = await Promise.all([
    getStockData(upper),
    getDisclosures(upper),
    companyName ? getNewsArticles(companyName) : Promise.resolve([]),
    getUsdToPhpRate(),
    getCompanyProfile(upper),
    getInvestmentThesis(upper),
  ]);
```

Change the JSX (currently ending with):

```typescript
        <CompanyAbout profile={companyProfile} />
      </div>
    </main>
  );
}
```

to:

```typescript
        <CompanyAbout profile={companyProfile} />
        <InvestmentThesisCard thesis={investmentThesis} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd app && pnpm tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Run the test suite**

Run: `cd app && pnpm vitest run`
Expected: all existing tests still pass (this task adds no new tests, matches convention
— no test file exists for any `dashboard/` component).

- [ ] **Step 5: Manual verification**

Start the dev server (check `docker ps` / `lsof -i:3000` first to avoid port conflicts
with anything already running): `cd app && pnpm dev`.

Visit `http://localhost:3000/stock/BDO`. Confirm, at the bottom of the page after the
About section: an "Investment Thesis" card showing the generation date, a colored verdict
badge, the 4 key figures (Current Price/Sticker Price/MOS Buy Price/P/E), the highlight
bullets, and a collapsed "Full Analysis ▼" toggle. Click it — confirm the full prose
thesis text appears and the arrow flips to ▲. Click again — confirm it collapses.

Then visit a ticker with no thesis row (e.g. `http://localhost:3000/stock/JFC`) and
confirm no Investment Thesis card renders at all (not an empty shell).

- [ ] **Step 6: Commit**

```bash
git add app/src/components/dashboard/InvestmentThesisCard.tsx "app/src/app/stock/[ticker]/page.tsx"
git commit -m "add investment thesis card to stock page"
```

## Self-Review Notes

- **Spec coverage:** schema + generation script changes for verdict/highlights/key-figure
  snapshot (Task 1), API route + storage client (Task 2), presentational component with
  summary-before-details layout + page wiring (Task 3) — all spec sections covered. The
  spec's "Out of Scope" items (no batch regen, no editing, no history) have no
  corresponding task, correctly.
- **Type consistency:** `InvestmentThesis`'s fields (`thesis`, `verdict`, `highlights`,
  `lastPrice`, `stickerPrice`, `mosPrice`, `pe`, `generatedAt`) are defined once in Task
  2's storage client and consumed identically by Task 3's component props and JSX. The
  `verdict` union type (`'buy' | 'watch' | 'pass' | null`) is consistent between Task 1's
  generation script, Task 2's storage client, and Task 3's `verdictColor` lookup (which
  only needs the 3 non-null keys, matching the `thesis.verdict &&` guard before it's
  used as an index).
