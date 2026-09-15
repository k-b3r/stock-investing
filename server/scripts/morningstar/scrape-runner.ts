import { scrapeTicker, updateTokens } from './scrape-morningstar.ts';
import { refreshCookies } from './refresh-cookies.ts';
import { getPool } from '../../src/db.ts';

export interface ScrapeRunResult {
  ok: number;
  skipped: number;
  fail: number;
}

export async function runScrapeLoop(tickers: string[]): Promise<ScrapeRunResult> {
  updateTokens(await refreshCookies());

  let ok = 0, skipped = 0, fail = 0;
  for (const ticker of tickers) {
    try {
      const result = await scrapeTicker(ticker);
      if (result === null) {
        skipped++;
        console.error(`[${ticker}] skipped (not on Morningstar)`);
      } else {
        ok++;
      }
    } catch (e) {
      console.error(`[${ticker}] error: ${(e as Error).message}`);
      fail++;
    }
    // delay to avoid WAF rate-limiting on lookup endpoint
    await new Promise((r) => setTimeout(r, 3000));
  }

  await getPool().end();
  return { ok, skipped, fail };
}
