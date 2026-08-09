export interface StickerPriceResult {
  stickerPrice: number;
  mosPrice: number;
  cappedGrowthPct: number;
  futurePE: number;
  futureEps: number;
}

export function computeStickerPrice(
  eps: number | null,
  growthRatePct: number | null
): StickerPriceResult | null {
  if (eps === null || eps <= 0) return null;
  if (growthRatePct === null || growthRatePct <= 0) return null;

  const cappedGrowthPct = Math.min(growthRatePct, 15);
  const cappedGrowth = cappedGrowthPct / 100;
  const futurePE = Math.min(cappedGrowthPct * 2, 20);
  const futureEps = eps * (1 + cappedGrowth) ** 10;
  const futureValue = futureEps * futurePE;
  const stickerPrice = futureValue / 1.15 ** 10;
  const mosPrice = stickerPrice * 0.5;

  return { stickerPrice, mosPrice, cappedGrowthPct, futurePE, futureEps };
}
