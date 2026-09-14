import { scrapeTicker, updateTokens } from './scrape-morningstar.ts';
import { refreshCookies } from './refresh-cookies.ts';
import { fetchIndexComposition } from './scrape-index-composition.ts';
import { getPool } from '../src/db.ts';
import { listTickersWithData } from '../src/repositories/financials.ts';

const argTickers = process.argv.slice(2);

updateTokens(await refreshCookies());

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

let ok = 0, fail = 0;
for (const ticker of tickers) {
  try {
    await scrapeTicker(ticker);
    ok++;
  } catch (e) {
    console.error(`[${ticker}] Error: ${(e as Error).message}`);
    fail++;
  }
  // delay to avoid WAF rate-limiting on lookup endpoint
  await new Promise(r => setTimeout(r, 3000));
}

await getPool().end();
console.error(`\nDone: ${ok} saved, ${fail} failed`);
