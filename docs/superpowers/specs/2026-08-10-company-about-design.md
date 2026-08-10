# Company About Section

## Purpose
Add a factual "About" card to the bottom of `/stock/[ticker]`, below the FinancialTabs
section, showing Sector, Subsector, Incorporation Date, and Website — sourced from PSE
Edge's company information page. No AI-generated or narrative text: every field is
scraped data or `null`, matching the project's "always render N/A, never hallucinate"
convention (CLAUDE.md).

## Data Source
`GET https://edge.pse.com.ph/companyInformation/form.do?cmpy_id={cmpyId}` — an HTML table
of company registry fields. Confirmed (manual fetch for BDO, cmpy_id=260) to contain:
Sector, Subsector, Corporate Life, Incorporation Date, Number of Directors, Stockholders'
Meeting info, Fiscal Year, External Auditor, Transfer Agent, Business Address, E-mail
Address, Telephone Number, Fax Number, Website. Only Sector, Subsector, Incorporation
Date, and Website are surfaced in the UI (per user decision — the rest reads as
registry/administrative noise on a research dashboard).

No narrative business-description text exists on this page or anywhere else currently
scraped (Morningstar JSONB in the `financials` table has no such field either).

## Components

### `app/src/lib/pse-edge.ts` (extend)
```typescript
export interface CompanyProfile {
  sector: string | null;
  subsector: string | null;
  incorporationDate: string | null;
  website: string | null;
}

export async function getCompanyProfile(ticker: string): Promise<CompanyProfile | null>
```
- Resolves `cmpyId` via the existing internal `getCompanyInfo()` helper (already used by
  `getLastPrice` and `getCompanyName` — no new company-lookup logic).
- Fetches `companyInformation/form.do?cmpy_id={cmpyId}` with the same `HEADERS` constant
  already used for every other PSE Edge request in this file.
- Parses the response with `cheerio` (already a dependency, already used in
  `getDisclosures` for a similarly-shaped `<table>`/`<tr>` structure) by matching `<th>`
  label text to the four wanted fields and reading the sibling `<td>`.
- Returns `null` if the `cmpyId` lookup fails or the fetch/parse throws (`try/catch`,
  matching every other function in this file). Returns a `CompanyProfile` object with
  individual `null` fields if the page loads but a specific `<th>` row is absent.
- Cached via `next: { revalidate: 86400 }` (24h) — this data changes rarely, same cache
  window as `getCompanyInfo`'s internal 24h cache.

### `app/src/components/dashboard/CompanyAbout.tsx` (new)
Pure presentational component, no data fetching (matches the project's "components in
`dashboard/` are pure presentational" convention).

```typescript
interface Props {
  profile: CompanyProfile | null;
}

export function CompanyAbout({ profile }: Props)
```
- If `profile` is `null` (the whole fetch failed), renders nothing — no empty card on the
  page.
- If `profile` is non-null, renders a `Card` (shadcn, matching `MetricCard`'s `Card`/
  `CardContent` usage) titled "About", with a 2-column grid of label/value pairs: Sector,
  Subsector, Incorporation Date, Website. Individual `null` fields render as `N/A` (same
  convention as `MetricCard`'s `displayValue`). Website renders as a clickable external
  link (`target="_blank" rel="noopener noreferrer"`, mirroring the disclosure link pattern
  already in `FinancialTabs.tsx`) when present.

### `app/src/app/stock/[ticker]/page.tsx` (modify)
- Add `getCompanyProfile` to the existing `Promise.all` alongside `getLastPrice`,
  `getDisclosures`, `getNewsArticles`, `getUsdToPhpRate` (one more parallel fetch, no
  sequencing changes).
- Render `<CompanyAbout profile={companyProfile} />` immediately after `<FinancialTabs>`,
  as the last element in the page's content `div`.

## Testing
`getCompanyProfile`'s HTML-parsing logic gets a unit test
(`app/src/lib/pse-edge.test.ts`, new file — no existing tests for this file) using a
static HTML fixture (trimmed real markup from the manual BDO fetch) to verify: all four
fields parse correctly from a complete table; missing individual `<th>` rows yield `null`
for just that field; a non-ok fetch response yields `null` for the whole profile.

`CompanyAbout` is presentational only; given the project has no component-level tests
anywhere yet (confirmed: only `service/*.test.ts` files exist), no test is added for it,
consistent with existing project conventions — manual verification via the dev server
covers it, same as prior UI work in this project.

## Out of scope
- No narrative/AI-generated company description.
- No editing/caching-bypass UI — the 24h cache is fixed, matching every other PSE Edge
  fetch in this codebase.
- No new fields beyond Sector, Subsector, Incorporation Date, Website.
