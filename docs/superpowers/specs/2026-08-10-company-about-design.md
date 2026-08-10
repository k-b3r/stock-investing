# Company About Section

## Purpose
Add an "About" card to the bottom of `/stock/[ticker]`, below the FinancialTabs section,
showing a real narrative business description plus Sector, Subsector, Incorporation Date,
and Website — sourced entirely from PSE Edge's company information page. No AI-generated
text: the description is scraped SEC filing content, matching the project's "always
render N/A, never hallucinate" convention (CLAUDE.md).

## Data Source
`GET https://edge.pse.com.ph/companyInformation/form.do?cmpy_id={cmpyId}` — HTML page with
three `<table>` elements, each identified by a `<caption>` (confirmed via manual fetch for
BDO, cmpy_id=260):

1. **"Company Description"** — a single `<td>` containing a narrative paragraph (with
   `<br/>` line breaks) describing the company's history and business, sourced from the
   company's SEC Form 17-A filing. Example (BDO): "BDO Unibank Inc. (BDO), originally
   known as Acme Savings Bank, was acquired by the SM Group in 1976. ... Source: SEC Form
   17-A (2024)".
2. **"Security Information"** — `<th>`/`<td>` row pairs: Sector, Subsector, Corporate
   Life, Incorporation Date, Number of Directors, Stockholders' Meeting info, Fiscal Year,
   External Auditor, Transfer Agent.
3. **"Contact Information"** — `<th>`/`<td>` row pairs: Business Address, E-mail Address,
   Telephone Number, Fax Number, Website.

Only the description paragraph (table 1) plus Sector, Subsector, Incorporation Date
(table 2), and Website (table 3) are surfaced in the UI — the rest reads as registry/
administrative noise on a research dashboard.

## Components

### `app/src/lib/pse-edge.ts` (extend)
```typescript
export interface CompanyProfile {
  description: string | null;
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
  `getDisclosures` for a similarly-shaped `<table>`/`<tr>` structure):
  - `description`: find the `<table>` whose `<caption>` text is "Company Description",
    read its single `<td>`'s text content (cheerio's `.text()` collapses `<br/>` tags to
    nothing — replace `<br\s*\/?>` with `\n` on the raw inner HTML before extracting text,
    so paragraph breaks survive as `\n\n`).
  - `sector`, `subsector`, `incorporationDate`: find the `<table>` whose `<caption>` is
    "Security Information", match `<th>` label text to the field, read the sibling
    `<td>`'s trimmed text.
  - `website`: find the `<table>` whose `<caption>` is "Contact Information", same
    `<th>`/`<td>` matching for the "Website" row.
- Returns `null` if the `cmpyId` lookup fails or the fetch/parse throws (`try/catch`,
  matching every other function in this file). Returns a `CompanyProfile` object with
  individual `null` fields if the page loads but a specific table/row is absent.
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
  `CardContent` usage) titled "About":
  - Description paragraph first, if present (`profile.description`), rendered with
    `whitespace-pre-wrap` so the `\n\n` paragraph breaks from parsing render correctly.
    If `null`, this block is skipped entirely (not "N/A" — a missing paragraph isn't a
    data point the way a missing Sector is).
  - Below it, a compact facts row: Sector, Subsector, Incorporation Date, Website.
    Individual `null` fields render as `N/A` (same convention as `MetricCard`'s
    `displayValue`). Website renders as a clickable external link (`target="_blank"
    rel="noopener noreferrer"`, mirroring the disclosure link pattern already in
    `FinancialTabs.tsx`) when present.

### `app/src/app/stock/[ticker]/page.tsx` (modify)
- Add `getCompanyProfile` to the existing `Promise.all` alongside `getLastPrice`,
  `getDisclosures`, `getNewsArticles`, `getUsdToPhpRate` (one more parallel fetch, no
  sequencing changes).
- Render `<CompanyAbout profile={companyProfile} />` immediately after `<FinancialTabs>`,
  as the last element in the page's content `div`.

## Testing
`getCompanyProfile`'s HTML-parsing logic gets a unit test
(`app/src/lib/pse-edge.test.ts`, new file — no existing tests for this file) using a
static HTML fixture (trimmed real markup from the manual BDO fetch, all three tables) to
verify: description paragraph parses with `\n\n` breaks between the original `<br/>`
pairs; all four facts (sector, subsector, incorporationDate, website) parse correctly;
a missing table (e.g. no "Company Description" caption) yields `null` for just that field,
not the whole profile; a non-ok fetch response yields `null` for the whole profile.

`CompanyAbout` is presentational only; given the project has no component-level tests
anywhere yet (confirmed: only `service/*.test.ts` files exist), no test is added for it,
consistent with existing project conventions — manual verification via the dev server
covers it, same as prior UI work in this project.

## Out of scope
- No AI-generated content — the description is scraped SEC-filing text, not synthesized.
- No editing/caching-bypass UI — the 24h cache is fixed, matching every other PSE Edge
  fetch in this codebase.
- No new fields beyond description, Sector, Subsector, Incorporation Date, Website.
