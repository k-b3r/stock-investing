import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { parseArgs } from 'util';
import { getPool } from '../src/db.ts';
import { getCompanyProfile } from '../src/repositories/company-profiles.ts';
import { listTickersWithData } from '../src/repositories/financials.ts';
import { buildTickerContext } from '../scripts/thesis-context.ts';
import { priceBand } from './bands.ts';
import { resultsDir } from './paths.ts';
import { fetchTierOf } from './tiers.ts';
import { NUMERIC_FIELDS, REAL_GAP_TICKERS } from './thesis-dataset.ts';
import type { IndexTier, PriceBand } from './types.ts';

// Scans every DB ticker (live PSE Edge price, no news), buckets it by sector / price band / index tier,
// and greedily suggests ~20 tickers that cover every cell. The scan is cached; --refresh re-scans.
//   pnpm eval:select [--refresh] [--size 20]

interface Candidate {
  ticker: string;
  sector: string;
  tier: IndexTier;
  band: PriceBand;
  lastPrice: number | null;
  stickerPrice: number | null;
  mosPrice: number | null;
  missing: string[];
}

const { values } = parseArgs({ options: { refresh: { type: 'boolean', default: false }, size: { type: 'string', default: '20' } } });
const size = Number(values.size);
const cacheFile = path.join(resultsDir('thesis'), '..', 'thesis-candidates.json');

async function scan(): Promise<Candidate[]> {
  const tierOf = await fetchTierOf();

  const tickers = (await listTickersWithData()).sort();
  const out: Candidate[] = [];
  for (const [i, ticker] of tickers.entries()) {
    process.stderr.write(`\r${i + 1}/${tickers.length} ${ticker.padEnd(8)}`);
    const ctx = await buildTickerContext(ticker, { news: false }).catch(() => null);
    if (!ctx) continue;
    const profile = await getCompanyProfile(ticker);
    out.push({
      ticker,
      sector: profile?.sector ?? 'Unknown',
      tier: tierOf(ticker),
      band: priceBand(ctx),
      lastPrice: ctx.lastPrice,
      stickerPrice: ctx.stickerPrice,
      mosPrice: ctx.mosPrice,
      missing: NUMERIC_FIELDS.filter((f) => ctx[f] === null),
    });
    await new Promise((r) => setTimeout(r, 300));
  }
  process.stderr.write('\n');
  return out;
}

async function loadCandidates(): Promise<Candidate[]> {
  if (!values.refresh) {
    const cached = await readFile(cacheFile, 'utf8').catch(() => null);
    if (cached) return JSON.parse(cached) as Candidate[];
  }
  const candidates = await scan();
  await mkdir(path.dirname(cacheFile), { recursive: true });
  await writeFile(cacheFile, JSON.stringify(candidates, null, 2) + '\n');
  return candidates;
}

// Non-gap picks may miss a field or two; mostly-empty rows (SECB, PX) add nothing the gap tickers don't
const MAX_MISSING = 4;

// Real-gap tickers are always picked (the missing-data cases); the rest fill uncovered
// sector×band cells first, then under-represented sectors, bands and tiers. Ties go to the most
// complete data (gaps are covered by the forced picks), then alphabetically.
function suggest(candidates: Candidate[]): Candidate[] {
  const picks = candidates.filter((c) => REAL_GAP_TICKERS.includes(c.ticker));
  const pool = candidates.filter((c) => !picks.includes(c) && c.band !== 'no-price' && c.missing.length <= MAX_MISSING);
  const count = (key: (c: Candidate) => string, value: string) => picks.filter((c) => key(c) === value).length;
  const gain = (c: Candidate) =>
    4 * Number(count((p) => `${p.sector}|${p.band}`, `${c.sector}|${c.band}`) === 0) +
    2 * Number(count((p) => p.sector, c.sector) < 2) +
    2 * Number(count((p) => p.band, c.band) < 4) +
    Number(count((p) => p.tier, c.tier) < 6);

  while (picks.length < size && pool.length > 0) {
    pool.sort((a, b) => gain(b) - gain(a) || a.missing.length - b.missing.length || a.ticker.localeCompare(b.ticker));
    picks.push(pool.shift()!);
  }
  return picks;
}

function table(rows: Candidate[]): string {
  const cells = rows.map((c) => [
    c.ticker,
    c.sector,
    c.tier,
    c.band,
    c.lastPrice?.toFixed(2) ?? 'N/A',
    c.mosPrice?.toFixed(2) ?? 'N/A',
    c.stickerPrice?.toFixed(2) ?? 'N/A',
    c.missing.join(',') || '-',
  ]);
  const head = ['ticker', 'sector', 'tier', 'band', 'price', 'mos', 'sticker', 'missing'];
  const widths = head.map((h, i) => Math.max(h.length, ...cells.map((r) => r[i].length)));
  return [head, ...cells].map((r) => r.map((c, i) => c.padEnd(widths[i])).join('  ')).join('\n');
}

function coverage(rows: Candidate[], key: (c: Candidate) => string): string {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(key(r), (counts.get(key(r)) ?? 0) + 1);
  return [...counts.entries()].sort().map(([k, n]) => `${k} ${n}`).join(' | ');
}

const candidates = await loadCandidates();
const picks = suggest(candidates);

console.log(`${candidates.length} candidates (cache: ${path.relative(process.cwd(), cacheFile)})`);
console.log(`sector: ${coverage(candidates, (c) => c.sector)}`);
console.log(`band:   ${coverage(candidates, (c) => c.band)}`);
console.log(`tier:   ${coverage(candidates, (c) => c.tier)}\n`);
console.log(`Suggested ${picks.length}:\n`);
console.log(table(picks));
console.log(`\nsector: ${coverage(picks, (c) => c.sector)}`);
console.log(`band:   ${coverage(picks, (c) => c.band)}`);
console.log(`tier:   ${coverage(picks, (c) => c.tier)}`);

await getPool().end();
