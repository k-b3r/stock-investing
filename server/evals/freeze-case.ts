import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { getPool } from '../src/db.ts';
import { buildDataBlock, buildTickerContext } from '../scripts/thesis-context.ts';
import { casesDir } from './paths.ts';
import type { ThesisCase } from './types.ts';

// Snapshots a ticker's thesis input (DB + live price/news) so every model sees identical data.
const tickers = process.argv.slice(2).map((t) => t.toUpperCase());
if (tickers.length === 0) {
  console.error('usage: pnpm eval:freeze TICKER [TICKER...]');
  process.exit(1);
}

await mkdir(casesDir('thesis'), { recursive: true });

for (const ticker of tickers) {
  const context = await buildTickerContext(ticker);
  if (!context) {
    console.log(`${ticker.padEnd(8)} → skipped: no financials row`);
    continue;
  }
  const testCase: ThesisCase = {
    id: ticker.toLowerCase(),
    suite: 'thesis',
    frozenAt: new Date().toISOString(),
    context,
    dataBlock: buildDataBlock(context),
  };
  const file = path.join(casesDir('thesis'), `${testCase.id}.json`);
  await writeFile(file, JSON.stringify(testCase, null, 2) + '\n');
  console.log(`${ticker.padEnd(8)} → ${path.relative(process.cwd(), file)} (price ${context.lastPrice ?? 'N/A'}, sticker ${context.stickerPrice?.toFixed(2) ?? 'N/A'})`);
}

await getPool().end();
