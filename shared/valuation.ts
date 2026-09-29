import { median } from './stats';

export interface StickerPriceResult {
  stickerPrice: number;
  mosPrice: number;
  cappedGrowthPct: number;
  futurePE: number;
  futureEps: number;
}

const DEFAULT_FUTURE_PE_CAP = 20;

// Morningstar occasionally reports an EPS in the wrong unit (JFC 2025: 9386 instead of ~9.386).
// Null out any value more than EPS_OUTLIER_FACTOR x the median magnitude of the other years.
const EPS_OUTLIER_FACTOR = 100;
const EPS_OUTLIER_MIN_PEERS = 3;

export function dropEpsOutliers(values: (number | null)[]): (number | null)[] {
  return values.map((v, i) => {
    if (v === null) return null;
    const peers = values
      .filter((p, j): p is number => j !== i && p !== null && p !== 0)
      .map(Math.abs);
    if (peers.length < EPS_OUTLIER_MIN_PEERS) return v;
    return Math.abs(v) > median(peers) * EPS_OUTLIER_FACTOR ? null : v;
  });
}

export function computeFuturePeCap(high52w: number | null, eps: number | null): number {
  if (high52w === null || eps === null || eps <= 0) return DEFAULT_FUTURE_PE_CAP;
  const cap = high52w / eps;
  return cap > 0 ? cap : DEFAULT_FUTURE_PE_CAP;
}

export function computeStickerPrice(
  eps: number | null,
  growthRatePct: number | null,
  futurePeCap: number = DEFAULT_FUTURE_PE_CAP
): StickerPriceResult | null {
  if (eps === null || eps <= 0) return null;
  if (growthRatePct === null || growthRatePct <= 0) return null;

  const cappedGrowthPct = Math.min(growthRatePct, 15);
  const cappedGrowth = cappedGrowthPct / 100;
  const futurePE = Math.min(cappedGrowthPct * 2, futurePeCap);
  const futureEps = eps * (1 + cappedGrowth) ** 10;
  const futureValue = futureEps * futurePE;
  const stickerPrice = futureValue / 1.15 ** 10;
  const mosPrice = stickerPrice * 0.5;

  return { stickerPrice, mosPrice, cappedGrowthPct, futurePE, futureEps };
}
