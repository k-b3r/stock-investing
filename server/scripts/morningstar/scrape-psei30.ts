import { runScrapeLoop } from './scrape-runner.ts';
import { fetchIndexComposition } from '../scrape-index-composition.ts';
import { listTickersWithData } from '../../src/repositories/financials.ts';

const argTickers = process.argv.slice(2);

let tickers: string[];
if (argTickers.length) {
  tickers = argTickers;
} else {
  const [psei, midcap] = await Promise.all([
    fetchIndexComposition('psei'),
    fetchIndexComposition('midcap'),
  ]);
  const all = [...new Set([...psei, ...midcap].map((c) => c.symbol))];

  const doneTickers = await listTickersWithData();
  const done = new Set(doneTickers.map(t => t.toUpperCase()));
  tickers = all.filter(t => !done.has(t.toUpperCase()));
  console.error(`Fetched ${all.length} live PSEi+MidCap tickers. Skipping ${done.size} already scraped. Remaining: ${tickers.length}`);
}

const { ok, skipped, fail } = await runScrapeLoop(tickers);
console.error(`\nDone: ${ok} saved, ${fail} failed${skipped ? `, ${skipped} skipped (not on Morningstar)` : ''}`);
