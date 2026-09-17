import * as cheerio from 'cheerio';
import { getCompanyInfo, BASE, HEADERS, type PseDisclosureRow } from '../../shared/pse-edge.ts';
import { getPool } from '../src/db.ts';
import { insertDisclosure } from '../src/repositories/disclosures.ts';
import { listTickers } from '../src/repositories/financials.ts';

const DELAY_MS = parseInt(process.env.SCRAPER_REQUEST_DELAY_MS ?? '600');
const TICKER_ARG = process.argv[2];

const RELEVANT_TEMPLATES = [
  'Press Release',
  'Material Information/Transactions',
  'Update on Corporate Actions/Material Transactions/Agreements',
  'Clarification of News Reports',
  'Reply to Inquiry of Unusual Price Movement',
  'Acquisition or Disposition of Shares of Another Corporation',
  'Acquisition or Disposition of Assets',
  'Declaration of Cash Dividends',
];

function isRelevant(template: string): boolean {
  const clean = template.replace(/^\[Amend-\d+\]/, '');
  return RELEVANT_TEMPLATES.some((t) => clean === t);
}

type Disclosure = PseDisclosureRow;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getCmpyId(ticker: string): Promise<string | null> {
  const info = await getCompanyInfo(ticker);
  return info?.cmpyId ?? null;
}

async function scrapeDisclosures(cmpyId: string): Promise<Disclosure[]> {
  const res = await fetch(`${BASE}/companyDisclosures/search.ax`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ keyword: cmpyId, tmplNm: '', pageNo: '1' }),
  });
  if (!res.ok) return [];

  const html = await res.text();
  const $ = cheerio.load(html);
  const results: Disclosure[] = [];

  $('tbody tr').each((_, row) => {
    const tds = $(row).find('td');
    const templateNm = tds.eq(0).text().trim();
    const date = tds.eq(1).text().trim();
    const formNum = tds.eq(2).text().trim();
    const refNum = tds.eq(3).text().trim();
    const onclick = tds.eq(0).find('a').attr('onclick') ?? '';
    const disclosureId = onclick.match(/openPopup\('([^']+)'\)/)?.[1] ?? null;
    if (templateNm && disclosureId && isRelevant(templateNm)) {
      results.push({ disclosureId, templateNm, date, formNum, refNum });
    }
  });

  return results;
}

// PSE Edge format: "Jun 17, 2026 11:02 AM"
function parseDate(raw: string): string | null {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().split('T')[0];
}

async function upsertDisclosures(ticker: string, disclosures: Disclosure[]): Promise<number> {
  let inserted = 0;
  for (const d of disclosures) {
    const filedAt = parseDate(d.date);
    if (!filedAt) continue;
    inserted += await insertDisclosure({
      disclosureId: d.disclosureId,
      ticker,
      template: d.templateNm,
      filedAt,
      formNum: d.formNum || null,
      refNum: d.refNum || null,
    });
  }
  return inserted;
}

async function getTickers(): Promise<string[]> {
  if (TICKER_ARG) return [TICKER_ARG.toUpperCase()];
  return listTickers();
}

const tickers = await getTickers();
console.log(`Scraping disclosures for ${tickers.length} ticker(s)...\n`);

let totalInserted = 0;
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
    const disclosures = await scrapeDisclosures(cmpyId);
    const inserted = await upsertDisclosures(ticker, disclosures);
    console.log(`→ ${disclosures.length} scraped, ${inserted} new`);
    totalInserted += inserted;
  } catch (e) {
    console.log(`— error: ${(e as Error).message}`);
    failed++;
  }
  await sleep(DELAY_MS);
}

await getPool().end();
console.log(`\nDone. ${totalInserted} rows inserted. ${failed} tickers failed.`);
