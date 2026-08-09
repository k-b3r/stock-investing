export function computeStickerPrice(
  eps: number | null,
  growthRatePct: number | null
): { stickerPrice: number; mosPrice: number } | null {
  if (eps === null || eps <= 0) return null;
  if (growthRatePct === null || growthRatePct <= 0) return null;

  const cappedGrowth = Math.min(growthRatePct, 15) / 100;
  const futurePE = Math.min(cappedGrowth * 100 * 2, 20);
  const futureEps = eps * (1 + cappedGrowth) ** 10;
  const futureValue = futureEps * futurePE;
  const stickerPrice = futureValue / 1.15 ** 10;
  const mosPrice = stickerPrice * 0.5;

  return { stickerPrice, mosPrice };
}
