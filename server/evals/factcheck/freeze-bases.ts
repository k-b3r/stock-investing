import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { getPool } from '../../src/db.ts';
import { getThesisByTicker } from '../../src/repositories/investment-theses.ts';
import { buildDataBlock, buildTickerContext, type TickerContext } from '../../scripts/thesis-context.ts';
import { basesDir } from './paths.ts';
import type { FactCheckBase } from './types.ts';

// Theses generated from the wrong company's data (fuzzy PSE Edge lookup, fixed in #17) or with no price
const EXCLUDED: Record<string, string> = {
  AC: 'generated from wrong-company price data',
  LFM: 'generated from wrong-company price data',
  CA: 'generated from wrong-company price data (stored price is CAT\'s)',
  LAND: 'no stored price',
};

const num = (v: string | null) => (v === null ? null : Number(v));

// Theses quote the price, sticker, MOS and P/E from generation time. Today's context is overlaid
// with those stored values, and the price-derived ratios rescaled, so the clean thesis matches its source.
export function overlayGenerationPrices(ctx: TickerContext, stored: { lastPrice: number; stickerPrice: number | null; mosPrice: number | null; pe: number | null }): TickerContext {
  const ratio = ctx.lastPrice ? stored.lastPrice / ctx.lastPrice : null;
  return {
    ...ctx,
    lastPrice: stored.lastPrice,
    stickerPrice: stored.stickerPrice,
    mosPrice: stored.mosPrice,
    pe: stored.pe,
    pb: ratio !== null && ctx.pb !== null ? ctx.pb * ratio : null,
    dividendYield: ratio !== null && ctx.dividendYield !== null ? ctx.dividendYield / ratio : null,
    peg: stored.pe !== null && ctx.epsGrowth !== null && ctx.epsGrowth > 0 ? stored.pe / ctx.epsGrowth : null,
  };
}

async function main() {
  const { rows } = await getPool().query<{ ticker: string }>('SELECT ticker FROM investment_theses ORDER BY ticker');
  const wanted = process.argv.slice(2).map((t) => t.toUpperCase());
  const tickers = rows.map((r) => r.ticker).filter((t) => (wanted.length ? wanted.includes(t) : true));

  await mkdir(basesDir, { recursive: true });
  for (const ticker of tickers) {
    process.stdout.write(`${ticker.padEnd(8)} → `);
    if (EXCLUDED[ticker]) {
      console.log(`skipped: ${EXCLUDED[ticker]}`);
      continue;
    }
    const row = await getThesisByTicker(ticker);
    const ctx = await buildTickerContext(ticker);
    const lastPrice = num(row?.last_price ?? null);
    if (!row || !ctx || lastPrice === null) {
      console.log('skipped: no thesis, financials or stored price');
      continue;
    }
    const context = overlayGenerationPrices(ctx, { lastPrice, stickerPrice: num(row.sticker_price), mosPrice: num(row.mos_price), pe: num(row.pe) });
    const base: FactCheckBase = {
      ticker,
      frozenAt: new Date().toISOString(),
      generatedAt: new Date(row.generated_at).toISOString(),
      context,
      dataBlock: buildDataBlock(context),
      storedThesis: row.thesis,
      thesis: null,
      reconcileEdits: [],
    };
    await writeFile(path.join(basesDir, `${ticker.toLowerCase()}.json`), JSON.stringify(base, null, 2) + '\n');
    console.log(`frozen (price ${lastPrice}, live ${ctx.lastPrice ?? 'N/A'})`);
  }
  await getPool().end();
}

if (process.argv[1] === new URL(import.meta.url).pathname) await main();
