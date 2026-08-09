import type { MetricCategory, ThresholdResult } from '@/lib/types/financials';

export function classifyMetric(category: MetricCategory, value: number | null): ThresholdResult {
  if (value === null) return 'neutral';

  if (category === 'debtEquity') {
    if (value <= 0.5) return 'green';
    if (value <= 1.0) return 'yellow';
    return 'red';
  }

  if (category === 'pe') {
    if (value <= 15) return 'green';
    if (value <= 25) return 'yellow';
    return 'red';
  }

  if (category === 'pb') {
    if (value <= 1.5) return 'green';
    if (value <= 3) return 'yellow';
    return 'red';
  }

  if (category === 'peg') {
    if (value <= 1) return 'green';
    if (value <= 2) return 'yellow';
    return 'red';
  }

  // 'growth' and 'roic' share the same thresholds
  if (value >= 10) return 'green';
  if (value >= 5) return 'yellow';
  return 'red';
}

export function classifyStickerPrice(
  lastPrice: number | null,
  stickerPrice: number | null
): ThresholdResult {
  if (lastPrice === null || stickerPrice === null || stickerPrice <= 0) return 'neutral';

  const ratio = lastPrice / stickerPrice;
  if (ratio <= 0.5) return 'green';
  if (ratio <= 1) return 'yellow';
  return 'red';
}
