import { fetchIndexComposition } from '../scripts/scrape-index-composition.ts';
import type { IndexTier } from './types.ts';

// Live PSEi / MidCap membership; anything else is SmallCap.
export async function fetchTierOf(): Promise<(ticker: string) => IndexTier> {
  const [psei, midcap] = await Promise.all([fetchIndexComposition('psei'), fetchIndexComposition('midcap')]);
  const pseiSet = new Set(psei.map((c) => c.symbol));
  const midcapSet = new Set(midcap.map((c) => c.symbol));
  return (ticker) => (pseiSet.has(ticker) ? 'psei' : midcapSet.has(ticker) ? 'midcap' : 'smallcap');
}
