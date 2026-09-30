import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { parseArgs } from 'util';
import { getPool } from '../src/db.ts';
import { buildTickerContext } from '../scripts/thesis-context.ts';
import { casesDir } from './paths.ts';
import { REAL_TICKERS, VARIANTS } from './thesis-dataset.ts';
import { fetchTierOf } from './tiers.ts';
import { readJsonFiles } from './utils.ts';
import { deriveVariant, realCase } from './variants.ts';
import type { ThesisCase } from './types.ts';

// Snapshots real tickers' thesis input (DB + live price/news) so every model sees identical data,
// then rebuilds the variants (price shifts, blanked fields, traps) from the frozen bases.
//   pnpm eval:freeze                  # every ticker in thesis-dataset.ts
//   pnpm eval:freeze AREIT BDO        # just these (plus variants built on them)
//   pnpm eval:freeze --variants-only  # rebuild variants from already-frozen bases, no network
const { values, positionals } = parseArgs({ options: { 'variants-only': { type: 'boolean', default: false } }, allowPositionals: true });
const tickers = values['variants-only'] ? [] : positionals.length ? positionals.map((t) => t.toUpperCase()) : REAL_TICKERS;

await mkdir(casesDir('thesis'), { recursive: true });
const save = async (c: ThesisCase) => {
  const file = path.join(casesDir('thesis'), `${c.id}.json`);
  await writeFile(file, JSON.stringify(c, null, 2) + '\n');
  const { band, allowedVerdicts, missingFields } = c.expect;
  console.log(`${c.id.padEnd(20)} ${band.padEnd(15)} allowed ${allowedVerdicts.join('|').padEnd(10)} missing ${missingFields.length}`);
};

if (tickers.length > 0) {
  const tierOf = await fetchTierOf();
  for (const ticker of tickers) {
    const context = await buildTickerContext(ticker);
    if (!context) console.log(`${ticker.padEnd(20)} skipped: no financials row`);
    else await save(realCase(context, tierOf(ticker)));
  }
}

const bases = new Map((await readJsonFiles<ThesisCase>(casesDir('thesis'))).map((c) => [c.id, c]));
for (const spec of VARIANTS) {
  const base = bases.get(spec.base);
  if (!base) console.log(`${spec.id.padEnd(20)} skipped: base ${spec.base} not frozen`);
  else if (values['variants-only'] || tickers.includes(base.context.ticker)) await save(deriveVariant(base, spec));
}

await getPool().end();
