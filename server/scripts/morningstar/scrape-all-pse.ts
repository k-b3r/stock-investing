import fs from 'fs';
import { runScrapeLoop } from './scrape-runner.ts';
import { listTickersWithData } from '../../src/repositories/financials.ts';
import { searchCompanies } from '../../../shared/pse-edge.ts';

const TICKER_CACHE = new URL('../../data/pse-tickers.json', import.meta.url).pathname;

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
  const seen = new Map<string, { symbol: string }>();
  for (const char of 'abcdefghijklmnopqrstuvwxyz') {
    const results = await searchCompanies(char);
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

const doneTickers = await listTickersWithData();
const done = new Set(doneTickers.map(t => t.toUpperCase()));
const toScrape = tickers.filter(t => !done.has(t.toUpperCase()));
console.error(`Skipping ${done.size} already scraped. Scraping ${toScrape.length} remaining.`);

const { ok, skipped, fail } = await runScrapeLoop(toScrape);
console.error(`\nDone: ${ok} saved, ${skipped} skipped (not on Morningstar), ${fail} errors`);
