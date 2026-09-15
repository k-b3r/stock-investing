import * as cheerio from 'cheerio';
import { getCompanyInfo, BASE, HEADERS } from '../../shared/pse-edge.ts';
import { getPool } from '../src/db.ts';
import { upsertCompanyProfile, type CompanyProfileUpsert } from '../src/repositories/company-profiles.ts';
import { listTickers } from '../src/repositories/financials.ts';

const DELAY_MS = parseInt(process.env.SCRAPER_REQUEST_DELAY_MS ?? '600');
const TICKER_ARG = process.argv[2];

type CompanyProfile = CompanyProfileUpsert;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getCmpyId(ticker: string): Promise<string | null> {
  const info = await getCompanyInfo(ticker);
  return info?.cmpyId ?? null;
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

async function getTickers(): Promise<string[]> {
  if (TICKER_ARG) return [TICKER_ARG.toUpperCase()];
  return listTickers();
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
    const isEmpty = !profile.description && !profile.sector && !profile.subsector && !profile.incorporationDate && !profile.website;
    if (isEmpty) {
      console.log('— empty profile, skipped (not upserted)');
      failed++;
      await sleep(DELAY_MS);
      continue;
    }
    await upsertCompanyProfile(ticker, profile);
    console.log(`→ sector=${profile.sector ?? 'N/A'}, description=${profile.description ? 'yes' : 'no'}`);
    succeeded++;
  } catch (e) {
    console.log(`— error: ${(e as Error).message}`);
    failed++;
  }
  await sleep(DELAY_MS);
}

await getPool().end();
console.log(`\nDone. ${succeeded} profiles upserted. ${failed} tickers failed.`);
