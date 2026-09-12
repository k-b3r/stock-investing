import fs from 'fs';
import { scrapeTicker, updateTokens } from './scrape-morningstar.ts';
import { refreshCookies } from './refresh-cookies.ts';
import { getPool } from '../src/db.ts';
import { listTickersWithData } from '../src/repositories/financials.ts';

const BASE = 'https://edge.pse.com.ph';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://edge.pse.com.ph/',
};
const TICKER_CACHE = new URL('../data/pse-tickers.json', import.meta.url).pathname;

interface PSECompany { cmpyId: string; cmpyNm: string; symbol: string; etfYn: string; }

async function fetchTickers(term: string): Promise<PSECompany[]> {
  try {
    const res = await fetch(`${BASE}/autoComplete/searchCompanyNameSymbol.ax?term=${term}`, { headers: HEADERS });
    if (!res.ok) return [];
    return await res.json() as PSECompany[];
  } catch {
    return [];
  }
}

// --from TICKER: resume from this ticker in the sorted list
// --resweep: force re-sweep even if cache exists
const fromArg = process.argv.includes('--from') ? process.argv[process.argv.indexOf('--from') + 1] : null;
const forceResweep = process.argv.includes('--resweep');

let allTickers: string[];

if (!forceResweep && fs.existsSync(TICKER_CACHE)) {
  allTickers = JSON.parse(fs.readFileSync(TICKER_CACHE, 'utf8')) as string[];
  console.error(`Loaded ${allTickers.length} tickers from cache (${TICKER_CACHE}). Use --resweep to refresh.`);
} else {
  console.error('Sweeping PSE Edge a–z to collect all tickers...');
  const seen = new Map<string, PSECompany>();
  for (const char of 'abcdefghijklmnopqrstuvwxyz') {
    const results = await fetchTickers(char);
    for (const c of results) {
      if (!seen.has(c.symbol)) seen.set(c.symbol, c);
    }
    process.stderr.write(`  [${char}] ${results.length} results, total unique: ${seen.size}\r`);
    await new Promise(r => setTimeout(r, 300));
  }
  console.error(`\nFound ${seen.size} unique PSE-listed companies.`);
  allTickers = [...seen.keys()].sort();
  fs.writeFileSync(TICKER_CACHE, JSON.stringify(allTickers, null, 2));
  console.error(`Saved to ${TICKER_CACHE}`);
}

let tickers = allTickers;
if (fromArg) {
  const idx = tickers.findIndex(t => t.toUpperCase() === fromArg.toUpperCase());
  if (idx === -1) {
    console.error(`--from ${fromArg} not found in list. Starting from beginning.`);
  } else {
    tickers = tickers.slice(idx);
    console.error(`Resuming from ${fromArg} (${tickers.length} remaining).`);
  }
}

updateTokens(await refreshCookies());

const doneTickers = await listTickersWithData();
const done = new Set(doneTickers.map(t => t.toUpperCase()));
const toScrape = tickers.filter(t => !done.has(t.toUpperCase()));
console.error(`Skipping ${done.size} already scraped. Scraping ${toScrape.length} remaining.`);

let ok = 0, skipped = 0, fail = 0;
for (const ticker of toScrape) {
  try {
    const result = await scrapeTicker(ticker);
    if (result === null) skipped++;
    else ok++;
  } catch (e) {
    console.error(`[${ticker}] Error: ${(e as Error).message}`);
    fail++;
  }
  await new Promise(r => setTimeout(r, 3000));
}

await getPool().end();
console.error(`\nDone: ${ok} saved, ${skipped} skipped (not on Morningstar), ${fail} errors`);
