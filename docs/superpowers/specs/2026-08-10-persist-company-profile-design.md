# Persist Company Profile to Postgres

## Purpose
Move company profile data (description, sector, subsector, incorporation date, website —
added in the "Company About" feature) from a live PSE Edge fetch on every page load to a
Postgres-backed read, since this data rarely changes. Mirrors the existing `disclosures`
table/route/storage/scraper-script pattern already used in this codebase.

## Current State
- `app/src/lib/pse-edge.ts` has `getCompanyProfile(ticker)`: live-fetches and parses PSE
  Edge's `companyInformation/form.do` page on every call, cached only via Next's 24h
  `fetch` data cache (`next: { revalidate: 86400 }`) — not persisted anywhere.
- `app/src/app/stock/[ticker]/page.tsx` imports and calls this directly.
- 5 unit tests cover the parsing logic in `app/src/lib/pse-edge.test.ts`.

## Target State
Same shape as `disclosures`:
- Postgres table `company_profiles`, one row per ticker, upserted by a standalone scrape
  script.
- Express API route `GET /company-profiles/:ticker` reading that table.
- `app/src/storage/company-profiles.ts` fetching from the API (like
  `app/src/storage/disclosures.ts`).
- `page.tsx` reads from `@/storage/company-profiles` instead of `@/lib/pse-edge`.
- The live-scrape `getCompanyProfile` and its tests are removed from `pse-edge.ts` — the
  parsing logic moves into the new scraper script, duplicated rather than imported, matching
  how `scripts/scrape-disclosures.ts` already duplicates its own PSE Edge scraping logic
  independent of `app/src/lib/`.
- No live fallback when a ticker has no row: `CompanyAbout` already handles `profile ===
  null` by rendering nothing (existing behavior, unchanged).

## Components

### `scripts/schema.sql` (append)
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

### `scripts/scrape-company-profiles.ts` (new)
Standalone script, same shape as `scripts/scrape-disclosures.ts`:
- Own `pg.Pool`, own `BASE`/`HEADERS` constants, own `getCmpyId` (ticker → PSE Edge
  internal company ID) — no import from `app/src/lib/pse-edge.ts`.
- Own copy of the table-parsing logic currently in `pse-edge.ts`'s `getCompanyProfile`:
  fetch `companyInformation/form.do?cmpy_id=X`, parse the three captioned `<table>`s
  (Company Description / Security Information / Contact Information) with `cheerio`,
  extract `description`, `sector`, `subsector`, `incorporationDate`, `website` — same
  algorithm, same field-per-field null handling.
- Ticker list: `SELECT ticker FROM financials ORDER BY ticker` (all tickers already
  scraped for financials), or a single ticker from `process.argv[2]` — matches
  `scrape-disclosures.ts`'s `getTickers()`.
- Rate-limited via `SCRAPER_REQUEST_DELAY_MS` (existing env var, default matches
  `scrape-disclosures.ts`'s pattern).
- Upsert: `INSERT INTO company_profiles (...) VALUES (...) ON CONFLICT (ticker) DO UPDATE
  SET description = EXCLUDED.description, sector = EXCLUDED.sector, subsector =
  EXCLUDED.subsector, incorporation_date = EXCLUDED.incorporation_date, website =
  EXCLUDED.website, scraped_at = now()` — unlike disclosures (append-only, `DO NOTHING`),
  a profile is a single mutable row per ticker that should refresh on re-run.
- Progress logging matching `scrape-disclosures.ts`'s per-ticker output style.

### `api/src/routes/company-profiles.ts` (new)
Same shape as `api/src/routes/disclosures.ts`:
```ts
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
```

### `api/src/index.ts` (modify)
Register the new router: `app.use('/company-profiles', companyProfilesRouter);`

### `app/src/storage/company-profiles.ts` (new)
Same shape as `app/src/storage/disclosures.ts`:
```ts
export interface CompanyProfile {
  description: string | null;
  sector: string | null;
  subsector: string | null;
  incorporationDate: string | null;
  website: string | null;
}

export async function getCompanyProfile(ticker: string): Promise<CompanyProfile | null> {
  const res = await fetch(`${API_URL}/company-profiles/${ticker.toUpperCase()}`, {
    next: { revalidate: 1800 },
  });
  if (!res.ok) return null;
  const row = await res.json();
  return {
    description: row.description,
    sector: row.sector,
    subsector: row.subsector,
    incorporationDate: row.incorporation_date,
    website: row.website,
  };
}
```
`CompanyProfile` is redefined here (not imported from `pse-edge.ts`, which loses the type
once its `getCompanyProfile` is removed) — `CompanyAbout.tsx` updates its import
accordingly.

### `app/src/lib/pse-edge.ts` (modify — removal)
Delete the `CompanyProfile` interface and `getCompanyProfile` function (added in the prior
feature). Delete the corresponding tests from `app/src/lib/pse-edge.test.ts`. Nothing else
in the file changes — `getLastPrice`, `getCompanyName`, `getCompanyInfo`, `getDisclosures`
are untouched.

### `app/src/app/stock/[ticker]/page.tsx` (modify)
Change the `getCompanyProfile` import from `@/lib/pse-edge` to
`@/storage/company-profiles`. No other change — same call site
(`getCompanyProfile(upper)`), same position in the `Promise.all`, same prop passed to
`<CompanyAbout>`.

### `app/src/components/dashboard/CompanyAbout.tsx` (modify)
Change its `CompanyProfile` type import from `@/lib/pse-edge` to
`@/storage/company-profiles`. No other change — same props, same rendering logic
(including the existing "all fields null → render nothing" guard from the prior fix).

## Backfill
After merging, run `scripts/scrape-company-profiles.ts` once (no ticker arg) against the
full existing ticker set to populate `company_profiles` for every ticker already in
`financials`. Future re-runs (manual, matching how other scrape scripts in this project are
operated — no cron/scheduler exists in this codebase) refresh the data if PSE Edge content
changes.

## Testing
- `scripts/scrape-company-profiles.ts`: no automated tests — matches the project's
  existing convention that scrape scripts (`scrape-disclosures.ts`,
  `scrape-morningstar.ts`, etc.) have none; they're operational tools, not application
  code.
- `api/src/routes/company-profiles.ts`: no automated tests — matches the existing
  convention that Express routes in this project (`routes/financials.ts`,
  `routes/disclosures.ts`) have none.
- `app/src/storage/company-profiles.ts`: no automated tests — matches the existing
  convention that storage functions (`storage/disclosures.ts`, `storage/financials.ts`)
  have none; they're thin fetch wrappers.
- The removal of `pse-edge.ts`'s `getCompanyProfile` and its 5 tests is itself verified by
  running the full suite after deletion (test count drops from 89 to 84, all remaining
  tests green).

## Out of scope
- No scheduled/cron re-scraping — matches the existing manual-run convention for every
  other scrape script in this project.
- No admin UI or API endpoint to trigger a re-scrape.
- No migration tooling — `CREATE TABLE IF NOT EXISTS` appended to the existing single
  `schema.sql` file, matching how `disclosures` was added there.
