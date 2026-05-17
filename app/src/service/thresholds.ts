import type { MetricCategory, ThresholdResult } from '@/lib/types/financials';

export function classifyMetric(category: MetricCategory, value: number | null): ThresholdResult {
  if (value === null) return 'neutral';

  if (category === 'debtEquity') {
    if (value <= 0.5) return 'green';
    if (value <= 1.0) return 'yellow';
    return 'red';
  }

  // 'growth' and 'roic' share the same thresholds
  if (value >= 10) return 'green';
  if (value >= 5) return 'yellow';
  return 'red';
}
