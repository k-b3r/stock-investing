import type { TickerContext, Verdict } from '../scripts/thesis-context.ts';
import type { PriceBand } from './types.ts';

// Where the current price sits against the Rule #1 MOS and Sticker Prices.
export function priceBand({ lastPrice, stickerPrice, mosPrice }: Pick<TickerContext, 'lastPrice' | 'stickerPrice' | 'mosPrice'>): PriceBand {
  if (lastPrice === null) return 'no-price';
  if (stickerPrice === null || mosPrice === null) return 'no-sticker';
  if (lastPrice <= mosPrice) return 'below-mos';
  if (lastPrice <= stickerPrice) return 'mos-to-sticker';
  return 'above-sticker';
}

// Rule #1: buy only at or below the MOS price. Below MOS still allows watch (weak Moat/Management),
// but not pass: the price is the point of these cases. Without a price or Sticker Price there is no
// margin of safety to buy on. Per-case overrides live in thesis-dataset.ts.
export const DEFAULT_ALLOWED: Record<PriceBand, Verdict[]> = {
  'below-mos': ['buy', 'watch'],
  'mos-to-sticker': ['watch', 'pass'],
  'above-sticker': ['watch', 'pass'],
  'no-sticker': ['watch', 'pass'],
  'no-price': ['watch', 'pass'],
};
