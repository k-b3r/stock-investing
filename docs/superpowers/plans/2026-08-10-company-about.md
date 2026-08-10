# Company About Section Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "About" card to the bottom of `/stock/[ticker]`, showing a real narrative
business description (scraped, sourced from the company's SEC Form 17-A filing) plus
Sector, Subsector, Incorporation Date, and Website.

**Architecture:** `getCompanyProfile(ticker)` in `pse-edge.ts` scrapes and parses PSE
Edge's `companyInformation/form.do` page (three captioned `<table>`s: Company Description,
Security Information, Contact Information) using cheerio. `page.tsx` fetches it alongside
the page's other parallel data, and a new pure presentational component `CompanyAbout`
renders it after `FinancialTabs`.

**Tech Stack:** Next.js 14 App Router, TypeScript, cheerio (already a dependency), Vitest.

## Global Constraints

- `CompanyProfile.description` is parsed by replacing `<br/>`/`<br>` tags in the "Company
  Description" table's `<td>` innerHTML with `\n`, then extracting text and collapsing 3+
  consecutive newlines to exactly 2 (`\n\n`).
- `sector`, `subsector`, `incorporationDate` come from the "Security Information" table's
  `<th>`/`<td>` rows; `website` comes from the "Contact Information" table's `<th>`/`<td>`
  rows. Match by exact `<th>` label text.
- Individual missing fields (table/row not found) → `null` for that field only, not the
  whole profile. Whole-profile `null` only when the `cmpyId` lookup fails or the fetch/
  parse throws.
- Cache the outer fetch with `next: { revalidate: 86400 }` (24h), matching the existing
  cache window used elsewhere in `pse-edge.ts`.
- `CompanyAbout` is presentational only — no data fetching inside it (matches existing
  `dashboard/` component convention). Renders nothing if `profile` is `null`.
- Follow existing code style: no comments unless explaining non-obvious "why", 2-space
  indent, single quotes, semicolons.

---

### Task 1: `getCompanyProfile` scraper function

**Files:**
- Modify: `app/src/lib/pse-edge.ts`
- Test: `app/src/lib/pse-edge.test.ts` (new file)

**Interfaces:**
- Produces: `interface CompanyProfile { description: string | null; sector: string | null; subsector: string | null; incorporationDate: string | null; website: string | null }`
  and `getCompanyProfile(ticker: string): Promise<CompanyProfile | null>` — used by Task 2
  (`page.tsx`).
- Consumes: the existing internal `getCompanyInfo(ticker)` function already in
  `pse-edge.ts` (returns `{ cmpyId: string; cmpyNm: string } | null` — resolves the PSE
  Edge internal company ID from a ticker symbol). Also consumes the existing `BASE` and
  `HEADERS` constants already defined at the top of the file, and the already-imported
  `cheerio` module (used by `getDisclosures` in the same file).

- [ ] **Step 1: Write the failing test**

Create `app/src/lib/pse-edge.test.ts`. This uses a real, trimmed HTML fixture captured
from PSE Edge's `companyInformation/form.do?cmpy_id=260` (BDO) response — the exact
markup for all three tables the parser needs to handle.

```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { getCompanyProfile } from './pse-edge';

const FULL_FIXTURE_HTML = `
<html><body>
<table class="view">
  <caption>Company Description</caption>
  <tr>
    <td>BDO Unibank Inc. (BDO), originally known as Acme Savings Bank, was acquired by the SM Group in 1976. BDO listed its shares on the Philippine Stock Exchange on May 21, 2002. The Company merged with Equitable PCI Bank in May 2007.<br/><br/>BDO offers an array of products and services including lending (corporate and consumer), deposit-taking, foreign exchange brokering, trust and investments, credit cards, retail cash cards, corporate cash management and remittances. Through its subsidiaries, the Company offers leasing and financing, investment banking, private banking, rural banking, life insurance, property and casualty insurance brokerage, and online and traditional stock brokerage services.<br/><br/>The Company's subsidiaries include BDO Capital & Investment Corporation; BDO Private Bank, Inc.; BDO Leasing and Finance, Inc.; BDO Finance Corporation; and BDO Securities Corporation.<br/><br/>As of December 31, 2024, BDO's network consists of 1,791 operating domestic branches (inclusive of one branch each in Hong Kong and Singapore), 4,923 automated teller machines, 481 universal teller machines, 411 cash accept machines, and 14 overseas remittance and representative offices across Asia, North America, Europe, and the Middle East.<br/> <br/>Source: SEC Form 17-A (2024)</td>
  </tr>
</table>
<table class="view">
  <caption>Security Information</caption>
  <tr><th>Sector</th><td>Financials</td></tr>
  <tr><th>Subsector</th><td>Banks</td></tr>
  <tr><th>Corporate Life</th><td>0</td></tr>
  <tr><th>Incorporation Date</th><td>Dec 20, 1967</td></tr>
  <tr><th>Number of Directors</th><td>11</td></tr>
  <tr><th>Fiscal Year</th><td>12/31\n      (Month/Day)\n      </td></tr>
  <tr><th>External Auditor</th><td>Punongbayan &amp; Araullo\t</td></tr>
  <tr><th>Transfer Agent</th><td>Stock Transfer Service, Inc.</td></tr>
</table>
<table class="view">
  <caption>Contact Information</caption>
  <tr><th>Business Address</th><td>BDO Corporate Center, Makati City</td></tr>
  <tr><th>Telephone Number</th><td>(632) 8840-7000</td></tr>
  <tr><th>Website</th><td>http://www.bdo.com.ph </td></tr>
</table>
</body></html>
`;

const EXPECTED_DESCRIPTION =
  "BDO Unibank Inc. (BDO), originally known as Acme Savings Bank, was acquired by the SM Group in 1976. BDO listed its shares on the Philippine Stock Exchange on May 21, 2002. The Company merged with Equitable PCI Bank in May 2007.\n\n" +
  "BDO offers an array of products and services including lending (corporate and consumer), deposit-taking, foreign exchange brokering, trust and investments, credit cards, retail cash cards, corporate cash management and remittances. Through its subsidiaries, the Company offers leasing and financing, investment banking, private banking, rural banking, life insurance, property and casualty insurance brokerage, and online and traditional stock brokerage services.\n\n" +
  "The Company's subsidiaries include BDO Capital & Investment Corporation; BDO Private Bank, Inc.; BDO Leasing and Finance, Inc.; BDO Finance Corporation; and BDO Securities Corporation.\n\n" +
  "As of December 31, 2024, BDO's network consists of 1,791 operating domestic branches (inclusive of one branch each in Hong Kong and Singapore), 4,923 automated teller machines, 481 universal teller machines, 411 cash accept machines, and 14 overseas remittance and representative offices across Asia, North America, Europe, and the Middle East.\n \n" +
  "Source: SEC Form 17-A (2024)";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetchSequence(responses: { ok: boolean; json?: unknown; text?: string }[]) {
  let call = 0;
  vi.stubGlobal('fetch', vi.fn(() => {
    const r = responses[call];
    call += 1;
    return Promise.resolve({
      ok: r.ok,
      json: () => Promise.resolve(r.json),
      text: () => Promise.resolve(r.text ?? ''),
    });
  }));
}

describe('getCompanyProfile', () => {
  it('parses description, sector, subsector, incorporationDate, and website from a full page', async () => {
    stubFetchSequence([
      { ok: true, json: [{ cmpyId: '260', cmpyNm: 'BDO Unibank, Inc.' }] },
      { ok: true, text: FULL_FIXTURE_HTML },
    ]);

    const profile = await getCompanyProfile('BDO');

    expect(profile).not.toBeNull();
    expect(profile!.description).toBe(EXPECTED_DESCRIPTION);
    expect(profile!.sector).toBe('Financials');
    expect(profile!.subsector).toBe('Banks');
    expect(profile!.incorporationDate).toBe('Dec 20, 1967');
    expect(profile!.website).toBe('http://www.bdo.com.ph');
  });

  it('returns null for individual fields whose table/row is missing, not the whole profile', async () => {
    const partialHtml = `
      <html><body>
      <table class="view">
        <caption>Security Information</caption>
        <tr><th>Sector</th><td>Financials</td></tr>
      </table>
      </body></html>
    `;
    stubFetchSequence([
      { ok: true, json: [{ cmpyId: '260', cmpyNm: 'BDO Unibank, Inc.' }] },
      { ok: true, text: partialHtml },
    ]);

    const profile = await getCompanyProfile('BDO');

    expect(profile).not.toBeNull();
    expect(profile!.sector).toBe('Financials');
    expect(profile!.description).toBeNull();
    expect(profile!.subsector).toBeNull();
    expect(profile!.incorporationDate).toBeNull();
    expect(profile!.website).toBeNull();
  });

  it('returns null when the ticker cannot be resolved to a cmpyId', async () => {
    stubFetchSequence([{ ok: true, json: [] }]);

    const profile = await getCompanyProfile('NOTATICKER');

    expect(profile).toBeNull();
  });

  it('returns null when the company information page fetch fails', async () => {
    stubFetchSequence([
      { ok: true, json: [{ cmpyId: '260', cmpyNm: 'BDO Unibank, Inc.' }] },
      { ok: false },
    ]);

    const profile = await getCompanyProfile('BDO');

    expect(profile).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && pnpm vitest run src/lib/pse-edge.test.ts`
Expected: FAIL — `getCompanyProfile is not exported` / `is not a function` (the function
doesn't exist in `pse-edge.ts` yet).

- [ ] **Step 3: Write the implementation**

In `app/src/lib/pse-edge.ts`, add this after the existing `getCompanyName` function (which
itself comes right after the internal `getCompanyInfo` function):

```typescript
export interface CompanyProfile {
  description: string | null;
  sector: string | null;
  subsector: string | null;
  incorporationDate: string | null;
  website: string | null;
}

export async function getCompanyProfile(ticker: string): Promise<CompanyProfile | null> {
  try {
    const info = await getCompanyInfo(ticker);
    if (!info) return null;

    const res = await fetch(`${BASE}/companyInformation/form.do?cmpy_id=${info.cmpyId}`, {
      headers: HEADERS,
      next: { revalidate: 86400 },
    });
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
          if (label === 'Website') website = value || null;
        });
      }
    });

    return { description, sector, subsector, incorporationDate, website };
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app && pnpm vitest run src/lib/pse-edge.test.ts`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Run the full suite and typecheck**

Run: `cd app && pnpm vitest run && pnpm tsc --noEmit`
Expected: all existing tests still pass (this task only adds code, doesn't modify any
existing function), zero type errors.

- [ ] **Step 6: Commit**

```bash
git add app/src/lib/pse-edge.ts app/src/lib/pse-edge.test.ts
git commit -m "add getCompanyProfile scraper for company description and facts"
```

---

### Task 2: `CompanyAbout` component and page wiring

**Files:**
- Create: `app/src/components/dashboard/CompanyAbout.tsx`
- Modify: `app/src/app/stock/[ticker]/page.tsx`

**Interfaces:**
- Consumes: `CompanyProfile` type and `getCompanyProfile` function from `@/lib/pse-edge`
  (Task 1).
- Produces: `CompanyAbout({ profile }: { profile: CompanyProfile | null })` — a React
  component, rendered directly by `page.tsx`. No other file depends on this component.

- [ ] **Step 1: Create the component**

Create `app/src/components/dashboard/CompanyAbout.tsx`:

```typescript
import { Card, CardContent } from '@/components/ui/card';
import type { CompanyProfile } from '@/lib/pse-edge';

interface Props {
  profile: CompanyProfile | null;
}

function Fact({ label, value, href }: { label: string; value: string | null; href?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
      {value && href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm hover:underline break-all">
          {value}
        </a>
      ) : (
        <p className="text-sm">{value ?? 'N/A'}</p>
      )}
    </div>
  );
}

export function CompanyAbout({ profile }: Props) {
  if (!profile) return null;

  return (
    <Card>
      <CardContent className="pt-4 pb-4 px-4 space-y-4">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">About</p>
        {profile.description && (
          <p className="text-sm whitespace-pre-wrap leading-relaxed">{profile.description}</p>
        )}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Fact label="Sector" value={profile.sector} />
          <Fact label="Subsector" value={profile.subsector} />
          <Fact label="Incorporation Date" value={profile.incorporationDate} />
          <Fact label="Website" value={profile.website} href={profile.website ?? undefined} />
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Wire it into the stock page**

In `app/src/app/stock/[ticker]/page.tsx`, add the import (alongside the other
`@/lib/pse-edge` import on line 7):

```typescript
import { getLastPrice, getCompanyName, getCompanyProfile } from '@/lib/pse-edge';
```

Add the `CompanyAbout` component import (alongside the other component imports):

```typescript
import { CompanyAbout } from '@/components/dashboard/CompanyAbout';
```

Change the second `Promise.all` (currently lines 30-35):

```typescript
  const [lastPrice, disclosures, newsArticles, usdToPhpRate] = await Promise.all([
    getLastPrice(upper),
    getDisclosures(upper),
    companyName ? getNewsArticles(companyName) : Promise.resolve([]),
    getUsdToPhpRate(),
  ]);
```

to:

```typescript
  const [lastPrice, disclosures, newsArticles, usdToPhpRate, companyProfile] = await Promise.all([
    getLastPrice(upper),
    getDisclosures(upper),
    companyName ? getNewsArticles(companyName) : Promise.resolve([]),
    getUsdToPhpRate(),
    getCompanyProfile(upper),
  ]);
```

Change the closing of the page's JSX (currently lines 80-85):

```typescript
        <FinancialTabs
          financials={financials}
          disclosures={disclosures}
          newsArticles={newsArticles}
        />
      </div>
    </main>
  );
}
```

to:

```typescript
        <FinancialTabs
          financials={financials}
          disclosures={disclosures}
          newsArticles={newsArticles}
        />
        <CompanyAbout profile={companyProfile} />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd app && pnpm tsc --noEmit`
Expected: zero errors.

- [ ] **Step 4: Run the full test suite**

Run: `cd app && pnpm vitest run`
Expected: all tests still pass (this task adds no new tests — `CompanyAbout` is
presentational-only, matching the project's existing convention of no component-level
tests, per the design spec).

- [ ] **Step 5: Manual verification**

Run: `cd app && pnpm dev`
Visit `http://localhost:3000/stock/BDO`. Confirm an "About" card appears at the very
bottom of the page, below the Growth/Profitability/.../Disclosures/News tabs, showing:
a multi-paragraph description of BDO's business, then a 4-column facts row (Sector:
Financials, Subsector: Banks, Incorporation Date: Dec 20 1967-ish, Website: a clickable
link to bdo.com.ph). Then visit a ticker where you'd expect scraping to plausibly fail
(or temporarily break the network) and confirm the page still renders fine with no About
card at all — no error, no empty card shell.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/dashboard/CompanyAbout.tsx "app/src/app/stock/[ticker]/page.tsx"
git commit -m "render company about section on stock page"
```

## Self-Review Notes

- **Spec coverage:** data source parsing (Task 1, all 3 tables + null-per-field
  behavior), caching (Task 1, revalidate 86400), presentational component + placement
  after FinancialTabs (Task 2), testing approach for both the scraper (Task 1 unit tests)
  and the intentional absence of component tests (Task 2, matches spec's stated
  convention) — all covered.
- **Type consistency:** `CompanyProfile` fields (`description`, `sector`, `subsector`,
  `incorporationDate`, `website`) match exactly between Task 1's definition, Task 1's
  tests, and Task 2's `CompanyAbout` props/JSX usage. `getCompanyProfile(ticker: string)`
  signature matches its Task 1 definition and its Task 2 call site
  (`getCompanyProfile(upper)`) exactly.
