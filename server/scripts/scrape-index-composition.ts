// Fetches the current PSEi / PSE MidCap constituent list from PSE's own
// live widget (frames.pse.com.ph/indices) via headless Playwright — the
// data isn't reachable via plain fetch, it's client-rendered.
//
// Usage: pnpm scrape-index-composition [psei|midcap]
import { chromium } from 'playwright';

export type PseIndex = 'psei' | 'midcap';

export interface IndexConstituent {
  symbol: string;
  name: string;
}

async function extractRows(page: import('playwright').Page): Promise<IndexConstituent[]> {
  return page.$$eval('#index-body tr', (rows) =>
    rows
      .map((row) => ({
        name: row.querySelector('.index-name')?.textContent?.trim() ?? '',
        symbol: row.querySelector('.index-symbol')?.textContent?.trim() ?? '',
      }))
      .filter((r) => r.symbol)
  );
}

export async function fetchIndexComposition(index: PseIndex): Promise<IndexConstituent[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto('https://frames.pse.com.ph/indices', { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1500);

    if (index === 'midcap') {
      await page.click('[data-toggle="dropdown"]');
      await page.waitForTimeout(300);
      await page.click('#pse-midcap');
      await page.waitForTimeout(2000);
    }

    return await extractRows(page);
  } finally {
    await browser.close();
  }
}

const isMain = process.argv[1]?.endsWith('scrape-index-composition.ts');
if (isMain) {
  const which = (process.argv[2] as PseIndex | undefined) ?? 'psei';
  if (which !== 'psei' && which !== 'midcap') {
    console.error(`Unknown index "${which}" — expected "psei" or "midcap"`);
    process.exit(1);
  }
  const rows = await fetchIndexComposition(which);
  console.log(JSON.stringify(rows, null, 2));
  console.error(`\n${rows.length} constituents for ${which}`);
}
