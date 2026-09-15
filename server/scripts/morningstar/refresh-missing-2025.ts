/**
 * Re-scrape tickers that don't yet have 2025-12 annual income data.
 *
 * Usage:
 *   npx tsx scripts/refresh-missing-2025.ts
 *   npx tsx scripts/refresh-missing-2025.ts --dry-run   # list tickers only, no scrape
 *   npx tsx scripts/refresh-missing-2025.ts --from MBT  # resume from ticker
 */

import { runScrapeLoop } from './scrape-runner.ts';
import { getPool } from '../../src/db.ts';

const dryRun = process.argv.includes('--dry-run');
const fromArg = process.argv.includes('--from')
  ? process.argv[process.argv.indexOf('--from') + 1]
  : null;

// Find tickers where no income row has fiscalPeriodYearMonth = '2025-12'
const { rows } = await getPool().query<{ ticker: string }>(`
  SELECT ticker
  FROM financials
  WHERE NOT (
    data->'keyMetrics.annual'->'incomeStatementList'->'dataList'
    @> '[{"fiscalPeriodYearMonth": "2025-12"}]'
  )
  ORDER BY ticker
`);

let tickers = rows.map(r => r.ticker);
console.error(`${tickers.length} tickers missing 2025-12 data.`);

if (fromArg) {
  const idx = tickers.findIndex(t => t.toUpperCase() === fromArg.toUpperCase());
  if (idx === -1) {
    console.error(`--from ${fromArg} not found. Starting from beginning.`);
  } else {
    tickers = tickers.slice(idx);
    console.error(`Resuming from ${fromArg} (${tickers.length} remaining).`);
  }
}

if (dryRun) {
  console.log(tickers.join('\n'));
  await getPool().end();
  process.exit(0);
}

const { ok, skipped, fail } = await runScrapeLoop(tickers);
console.error(`\nDone: ${ok} updated, ${skipped} skipped, ${fail} errors`);
