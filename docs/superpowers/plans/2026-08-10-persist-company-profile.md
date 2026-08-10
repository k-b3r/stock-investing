# Persist Company Profile to Postgres Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move company profile data (description, sector, subsector, incorporation date,
website) from a live PSE Edge fetch on every page load to a Postgres-backed read,
mirroring the existing `disclosures` table/route/storage/scraper-script pattern.

**Architecture:** A new `company_profiles` table is populated by a standalone scraper
script (own PSE Edge scraping/parsing logic, no cross-import from `app/`). A new Express
route serves it. A new `app/src/storage/company-profiles.ts` fetches from that route. The
stock page and `CompanyAbout` component switch their import from the old live-fetch
function (`@/lib/pse-edge`) to the new DB-backed one (`@/storage/company-profiles`), and
the old live-fetch function + its tests are deleted.

**Tech Stack:** Node/tsx (scripts), Express + `pg` (API), Next.js 14 App Router +
TypeScript (app), Postgres, cheerio.

## Global Constraints

- `company_profiles` has one row per ticker (`ticker TEXT PRIMARY KEY`), upserted with
  `ON CONFLICT (ticker) DO UPDATE` (not `DO NOTHING` — unlike `disclosures`, a profile is
  a single mutable row that should refresh on re-run).
- The scraper script duplicates its own PSE Edge fetch/parse logic (own `BASE`, `HEADERS`,
  `getCmpyId`) rather than importing from `app/src/lib/pse-edge.ts` — matches
  `scripts/scrape-disclosures.ts`'s existing convention.
- Ticker list for the scraper: `SELECT ticker FROM financials ORDER BY ticker`, or a
  single ticker from `process.argv[2]` — matches `scrape-disclosures.ts`'s `getTickers()`.
- Rate-limited via `SCRAPER_REQUEST_DELAY_MS` env var (default `600`), same as
  `scrape-disclosures.ts`.
- `app/src/storage/company-profiles.ts`'s `CompanyProfile` type must exactly match the
  shape currently exported from `@/lib/pse-edge` (`description`, `sector`, `subsector`,
  `incorporationDate`, `website`, all `string | null`) so `CompanyAbout.tsx`'s existing
  rendering logic needs no changes beyond its import line.
- No live fallback when a ticker has no row — matches `CompanyAbout`'s existing
  `profile === null` → render nothing behavior (unchanged).
- No automated tests for the scraper script, API route, or storage function — matches
  this project's existing convention (`scrape-disclosures.ts`, `routes/disclosures.ts`,
  `storage/disclosures.ts` all have none).
- Follow existing code style per file: scripts use 2-space indent, single quotes,
  semicolons (see `scrape-disclosures.ts`); app/api code matches its existing neighbors.

---

### Task 1: `company_profiles` table and scraper script

**Files:**
- Modify: `scripts/schema.sql`
- Create: `scripts/scrape-company-profiles.ts`
- Modify: `package.json:6-14` (add an npm script entry)

**Interfaces:**
- Produces: the `company_profiles` Postgres table (columns: `ticker` PK, `description`,
  `sector`, `subsector`, `incorporation_date`, `website`, `scraped_at`) — consumed by
  Task 2's API route.

- [ ] **Step 1: Add the table to the schema file**

Append to `scripts/schema.sql` (after the existing `disclosures` table and its index):

```sql
CREATE TABLE IF NOT EXISTS company_profiles (
  ticker              TEXT PRIMARY KEY,
  description         TEXT,
  sector              TEXT,
  subsector           TEXT,
  incorporation_date  TEXT,
  website             TEXT,
  scraped_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Apply the schema change to the local database**

Run: `PGPASSWORD=postgres psql -h localhost -U postgres -d stocks -f scripts/schema.sql`
Expected: no errors (existing tables use `IF NOT EXISTS`, so this is safe to re-run); then
verify with `PGPASSWORD=postgres psql -h localhost -U postgres -d stocks -c "\d company_profiles"`
— expect the table with the 6 columns listed above.

- [ ] **Step 3: Write the scraper script**

Create `scripts/scrape-company-profiles.ts`:

```typescript
import pg from 'pg';
import * as cheerio from 'cheerio';

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/stocks';
const BASE = 'https://edge.pse.com.ph';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://edge.pse.com.ph/',
};
const DELAY_MS = parseInt(process.env.SCRAPER_REQUEST_DELAY_MS ?? '600');
const TICKER_ARG = process.argv[2];

interface CompanyProfile {
  description: string | null;
  sector: string | null;
  subsector: string | null;
  incorporationDate: string | null;
  website: string | null;
}

const pool = new pg.Pool({ connectionString: DB_URL });

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getCmpyId(ticker: string): Promise<string | null> {
  const res = await fetch(
    `${BASE}/autoComplete/searchCompanyNameSymbol.ax?term=${encodeURIComponent(ticker)}`,
    { headers: HEADERS }
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { cmpyId: string }[];
  return data[0]?.cmpyId ?? null;
}

async function scrapeCompanyProfile(cmpyId: string): Promise<CompanyProfile | null> {
  const res = await fetch(`${BASE}/companyInformation/form.do?cmpy_id=${cmpyId}`, { headers: HEADERS });
  if (!res.ok) return null;

  const html = await res.text();
  const $ = cheerio.load(html);

  let description: string | null = null;
  let sector: string | null = null;
  let subsector: string | null = null;
  let incorporationDate: string | null = null;
  let website: string | null = null;

  $('table').each((_, table) => {
    const caption = $(table).find('caption').text().trim();

    if (caption === 'Company Description') {
      const cellHtml = $(table).find('td').first().html() ?? '';
      const withBreaks = cellHtml.replace(/<br\s*\/?>/gi, '\n');
      const text = cheerio.load(`<div>${withBreaks}</div>`)('div').text();
      const cleaned = text.replace(/\n{3,}/g, '\n\n').trim();
      description = cleaned || null;
    } else if (caption === 'Security Information') {
      $(table).find('tr').each((_, row) => {
        const label = $(row).find('th').text().trim();
        const value = $(row).find('td').text().trim();
        if (label === 'Sector') sector = value || null;
        if (label === 'Subsector') subsector = value || null;
        if (label === 'Incorporation Date') incorporationDate = value || null;
      });
    } else if (caption === 'Contact Information') {
      $(table).find('tr').each((_, row) => {
        const label = $(row).find('th').text().trim();
        const value = $(row).find('td').text().trim();
        if (label === 'Website') {
          website = /^https?:\/\//i.test(value) ? value : value ? `https://${value}` : null;
        }
      });
    }
  });

  return { description, sector, subsector, incorporationDate, website };
}

async function upsertProfile(ticker: string, profile: CompanyProfile): Promise<void> {
  await pool.query(
    `INSERT INTO company_profiles (ticker, description, sector, subsector, incorporation_date, website, scraped_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (ticker) DO UPDATE SET
       description = EXCLUDED.description,
       sector = EXCLUDED.sector,
       subsector = EXCLUDED.subsector,
       incorporation_date = EXCLUDED.incorporation_date,
       website = EXCLUDED.website,
       scraped_at = now()`,
    [ticker, profile.description, profile.sector, profile.subsector, profile.incorporationDate, profile.website]
  );
}

async function getTickers(): Promise<string[]> {
  if (TICKER_ARG) return [TICKER_ARG.toUpperCase()];
  const res = await pool.query<{ ticker: string }>('SELECT ticker FROM financials ORDER BY ticker');
  return res.rows.map((r) => r.ticker);
}

const tickers = await getTickers();
console.log(`Scraping company profiles for ${tickers.length} ticker(s)...\n`);

let succeeded = 0;
let failed = 0;

for (const [i, ticker] of tickers.entries()) {
  process.stdout.write(`[${String(i + 1).padStart(3)}/${tickers.length}] ${ticker.padEnd(8)}`);
  try {
    const cmpyId = await getCmpyId(ticker);
    if (!cmpyId) {
      console.log('— not found on PSE Edge');
      failed++;
      await sleep(DELAY_MS);
      continue;
    }
    await sleep(DELAY_MS);
    const profile = await scrapeCompanyProfile(cmpyId);
    if (!profile) {
      console.log('— fetch failed');
      failed++;
      await sleep(DELAY_MS);
      continue;
    }
    await upsertProfile(ticker, profile);
    console.log(`→ sector=${profile.sector ?? 'N/A'}, description=${profile.description ? 'yes' : 'no'}`);
    succeeded++;
  } catch (e) {
    console.log(`— error: ${(e as Error).message}`);
    failed++;
  }
  await sleep(DELAY_MS);
}

await pool.end();
console.log(`\nDone. ${succeeded} profiles upserted. ${failed} tickers failed.`);
```

- [ ] **Step 4: Add an npm script entry**

In `package.json`, add this line inside the `"scripts"` object (alongside the existing
`scrape-ms`, `scrape-psei30`, etc. entries):

```json
    "scrape-company-profiles": "tsx --env-file=.env scripts/scrape-company-profiles.ts",
```

- [ ] **Step 5: Verify the script runs against a single ticker**

Run: `pnpm scrape-company-profiles BDO`
Expected: output ending in `Done. 1 profiles upserted. 0 tickers failed.` Then verify:
`PGPASSWORD=postgres psql -h localhost -U postgres -d stocks -c "SELECT ticker, sector, subsector, incorporation_date, website FROM company_profiles WHERE ticker = 'BDO'"`
— expect a row with `sector = Financials`, `subsector = Banks`, a non-null
`incorporation_date`, and a `website` starting with `http`.

- [ ] **Step 6: Commit**

```bash
git add scripts/schema.sql scripts/scrape-company-profiles.ts package.json
git commit -m "add company_profiles table and scraper script"
```

---

### Task 2: API route for company profiles

**Files:**
- Create: `api/src/routes/company-profiles.ts`
- Modify: `api/src/index.ts`

**Interfaces:**
- Consumes: the `company_profiles` table (Task 1) via the existing `getPool()` helper
  from `api/src/db.ts`.
- Produces: `GET /company-profiles/:ticker` — used by Task 3
  (`app/src/storage/company-profiles.ts`). Response body on success:
  `{ description: string | null, sector: string | null, subsector: string | null, incorporation_date: string | null, website: string | null }`
  (snake_case, matching the DB column names — Task 3 maps these to camelCase). 404 with
  `{ error: 'Not found' }` when no row exists for the ticker.

- [ ] **Step 1: Write the route**

Create `api/src/routes/company-profiles.ts`:

```typescript
import { Router } from 'express';
import { getPool } from '../db.js';

const router = Router();

router.get('/:ticker', async (req, res) => {
  try {
    const { rows } = await getPool().query(
      `SELECT description, sector, subsector, incorporation_date, website
       FROM company_profiles WHERE ticker = $1`,
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

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(express.json());
app.use('/financials', financialsRouter);
app.use('/disclosures', disclosuresRouter);
```

to:

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

- [ ] **Step 3: Restart the API and verify the route**

Run: `docker restart psei_api` (or however the local API process is managed — if running
via `docker compose`, `docker compose restart api`; check `docker ps` for the container
name first with `docker ps --format "{{.Names}}"`).

Then: `curl -s http://localhost:3001/company-profiles/BDO`
Expected: JSON with `sector: "Financials"`, `subsector: "Banks"`, a non-null
`incorporation_date`, and a `website` field (populated by Task 1's script run against
BDO). Also verify the 404 path: `curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3001/company-profiles/NOTATICKER`
— expect `404`.

- [ ] **Step 4: Commit**

```bash
git add api/src/routes/company-profiles.ts api/src/index.ts
git commit -m "add company-profiles API route"
```

---

### Task 3: App storage client, page wiring, and removal of live-fetch code

**Files:**
- Create: `app/src/storage/company-profiles.ts`
- Modify: `app/src/components/dashboard/CompanyAbout.tsx:1-2`
- Modify: `app/src/app/stock/[ticker]/page.tsx:1-13`
- Modify: `app/src/lib/pse-edge.ts:44-105` (delete)
- Delete: `app/src/lib/pse-edge.test.ts`

**Interfaces:**
- Consumes: `GET /company-profiles/:ticker` (Task 2).
- Produces: `interface CompanyProfile { description: string | null; sector: string | null; subsector: string | null; incorporationDate: string | null; website: string | null }`
  and `getCompanyProfile(ticker: string): Promise<CompanyProfile | null>`, exported from
  `app/src/storage/company-profiles.ts` — this is the new single source of the
  `CompanyProfile` type for the rest of the app (previously exported from
  `@/lib/pse-edge`, which loses it in this task).

- [ ] **Step 1: Create the storage client**

Create `app/src/storage/company-profiles.ts`:

```typescript
const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export interface CompanyProfile {
  description: string | null;
  sector: string | null;
  subsector: string | null;
  incorporationDate: string | null;
  website: string | null;
}

interface DbCompanyProfile {
  description: string | null;
  sector: string | null;
  subsector: string | null;
  incorporation_date: string | null;
  website: string | null;
}

export async function getCompanyProfile(ticker: string): Promise<CompanyProfile | null> {
  const res = await fetch(`${API_URL}/company-profiles/${ticker.toUpperCase()}`, {
    next: { revalidate: 1800 },
  });
  if (!res.ok) return null;
  const row = (await res.json()) as DbCompanyProfile;
  return {
    description: row.description,
    sector: row.sector,
    subsector: row.subsector,
    incorporationDate: row.incorporation_date,
    website: row.website,
  };
}
```

- [ ] **Step 2: Update `CompanyAbout.tsx`'s import**

In `app/src/components/dashboard/CompanyAbout.tsx`, change:

```typescript
import { Card, CardContent } from '@/components/ui/card';
import type { CompanyProfile } from '@/lib/pse-edge';
```

to:

```typescript
import { Card, CardContent } from '@/components/ui/card';
import type { CompanyProfile } from '@/storage/company-profiles';
```

No other change to this file — the rest of the component (the two null-guards, the
`Fact` sub-component, the JSX) is unchanged.

- [ ] **Step 3: Update `page.tsx`'s imports**

In `app/src/app/stock/[ticker]/page.tsx`, change:

```typescript
import { getLastPrice, getCompanyName, getCompanyProfile } from '@/lib/pse-edge';
import { getUsdToPhpRate } from '@/lib/fx';
import { getDisclosures } from '@/storage/disclosures';
```

to:

```typescript
import { getLastPrice, getCompanyName } from '@/lib/pse-edge';
import { getUsdToPhpRate } from '@/lib/fx';
import { getDisclosures } from '@/storage/disclosures';
import { getCompanyProfile } from '@/storage/company-profiles';
```

No other change to this file — the `Promise.all` call site
(`getCompanyProfile(upper)`), its position in the array, and the
`<CompanyAbout profile={companyProfile} />` render are all unchanged; only the import
source moves.

- [ ] **Step 4: Delete the live-fetch function from `pse-edge.ts`**

In `app/src/lib/pse-edge.ts`, delete lines 44-105 (the `CompanyProfile` interface and the
`getCompanyProfile` function — everything between the end of `getCompanyName` and the
start of `getLastPrice`). After deletion, the file should read `getCompanyName` (ending
`}`), a single blank line, then directly `export async function getLastPrice(...)`.

Do not change anything else in this file — `getCompanyInfo`, `getCompanyName`,
`getLastPrice`, `getDisclosures`, `BASE`, `HEADERS`, and the `cheerio` import all stay
(cheerio is still used by `getDisclosures`).

- [ ] **Step 5: Delete the now-obsolete test file**

```bash
rm app/src/lib/pse-edge.test.ts
```

This entire file only tested the function deleted in Step 4 — there is nothing left in it
to keep.

- [ ] **Step 6: Typecheck**

Run: `cd app && pnpm tsc --noEmit`
Expected: zero errors. This confirms no other file still imports `CompanyProfile` or
`getCompanyProfile` from `@/lib/pse-edge`.

- [ ] **Step 7: Run the full test suite**

Run: `cd app && pnpm vitest run`
Expected: 4 test files, 84 tests passing (89 minus the 5 deleted `pse-edge.test.ts`
tests).

- [ ] **Step 8: Manual verification**

Run: `cd app && pnpm dev`
Visit `http://localhost:3000/stock/BDO`. Confirm the "About" section still renders
exactly as before (description paragraph, Sector: Financials, Subsector: Banks,
Incorporation Date, clickable website link) — this time sourced from Postgres instead of
a live PSE Edge fetch. To confirm it's actually reading from the DB and not coincidentally
still working via some leftover live path, check the API directly:
`curl -s http://localhost:3001/company-profiles/BDO` should return the same data the page
displays.

- [ ] **Step 9: Commit**

```bash
git add app/src/storage/company-profiles.ts app/src/components/dashboard/CompanyAbout.tsx "app/src/app/stock/[ticker]/page.tsx" app/src/lib/pse-edge.ts
git rm app/src/lib/pse-edge.test.ts
git commit -m "read company profile from Postgres instead of live PSE Edge fetch"
```

## Self-Review Notes

- **Spec coverage:** table + scraper script (Task 1), API route (Task 2), storage client +
  page/component wiring + removal of the old live-fetch function and its tests (Task 3) —
  all spec sections covered. Backfill is covered by Task 1's Step 5 (single-ticker
  verification) plus the plan's assumption that a full backfill run
  (`pnpm scrape-company-profiles` with no arg) happens post-merge, per the spec's
  "Backfill" section — this is an operational step, not a code task, so it's called out
  here rather than as a Task.
- **Type consistency:** `CompanyProfile` fields (`description`, `sector`, `subsector`,
  `incorporationDate`, `website`) are identical across Task 1's scraper script, Task 2's
  route (snake_case DB columns, explicitly mapped), and Task 3's storage client and its
  consumers (`CompanyAbout.tsx`, `page.tsx`). `getCompanyProfile(ticker: string): Promise<CompanyProfile | null>`
  signature is identical to the function it replaces, so no call-site logic changes.

## Post-merge operational step (not a plan task)

After this plan's commits land, run a full backfill:

```bash
pnpm scrape-company-profiles
```

This populates `company_profiles` for every ticker currently in the `financials` table
(no ticker arg = all tickers). Expect this to take roughly `(number of tickers) × 2 ×
DELAY_MS` given two PSE Edge requests per ticker (company ID lookup + company info page)
each followed by a `sleep(DELAY_MS)`.
