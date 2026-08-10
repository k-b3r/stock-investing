'use client';

import { useState } from 'react';
import { MetricCard } from './MetricCard';
import { classifyMetric, classifyStickerPrice } from '@/service/thresholds';
import { computeStickerPrice, computeFuturePeCap } from '@/service/valuation';
import { cn } from '@/lib/utils';
import type { GrowthMetric, TransformedFinancials } from '@/lib/types/financials';

interface Props {
  financials: TransformedFinancials;
  dividendYield?: number | null;
  pe?: number | null;
  pb?: number | null;
  peg?: number | null;
  lastPrice?: number | null;
  latestEps?: number | null;
  high52w?: number | null;
}

type Period = '3Y' | '5Y' | '10Y';

function pickGrowth(g: GrowthMetric, period: Period): number | null {
  if (period === '10Y') return g.tenYearAvg ?? g.fiveYearAvg ?? g.threeYearAvg ?? g.yearOverYear;
  if (period === '5Y') return g.fiveYearAvg ?? g.threeYearAvg ?? g.yearOverYear;
  return g.threeYearAvg ?? g.yearOverYear;
}

export function MetricStrip({
  financials,
  dividendYield = null,
  pe = null,
  pb = null,
  peg = null,
  lastPrice = null,
  latestEps = null,
  high52w = null,
}: Props) {
  const { summary, tabs } = financials;
  const [period, setPeriod] = useState<Period>('10Y');
  const years = period === '3Y' ? 3 : period === '5Y' ? 5 : 10;

  const epsGrowth = pickGrowth(summary.epsGrowth, period);
  const rev = pickGrowth(summary.revenueGrowth, period);
  const ni = pickGrowth(summary.netIncomeGrowth, period);
  const fcf = pickGrowth(summary.fcfGrowth, period);

  const futurePeCap = computeFuturePeCap(high52w, latestEps);
  const stickerResult = computeStickerPrice(latestEps, epsGrowth, futurePeCap);
  const stickerPrice = stickerResult?.stickerPrice ?? null;
  const mosPrice = stickerResult?.mosPrice ?? null;

  const stickerTooltip = stickerResult
    ? `Fair value estimate (Phil Town Rule #1). EPS ₱${latestEps!.toFixed(2)} × (1 + ${stickerResult.cappedGrowthPct.toFixed(1)}%)^10 = ₱${stickerResult.futureEps.toFixed(2)} future EPS. × future P/E ${stickerResult.futurePE.toFixed(1)} = ₱${(stickerResult.futureEps * stickerResult.futurePE).toFixed(2)} future value, discounted at 15%/yr over 10yrs → ₱${stickerResult.stickerPrice.toFixed(2)} sticker price.`
    : 'Fair value estimate (Phil Town Rule #1): ((EPS × (1+g)^10) × min(2g, 20)) ÷ 1.15^10, g capped at 15%. Needs positive EPS and growth rate — N/A here.';

  const mosTooltip = stickerResult
    ? `Target buy price with a 50% margin of safety: ₱${stickerResult.stickerPrice.toFixed(2)} sticker price × 50% = ₱${stickerResult.mosPrice.toFixed(2)}.`
    : 'Target buy price with a 50% margin of safety below Sticker Price. Formula: MOS = Sticker Price × 50% — N/A here.';

  const metrics = [
    {
      label: 'ROIC',
      value: summary.roic,
      threshold: classifyMetric('roic', summary.roic),
      sparkData: tabs.profitability.roic,
      tooltip: 'Return on Invested Capital: NOPAT ÷ Invested Capital. ≥10% green, ≥5% yellow, <5% red.',
    },
    {
      label: 'EPS Growth',
      value: epsGrowth,
      threshold: classifyMetric('growth', epsGrowth),
      sparkData: tabs.growth.eps,
      sparkUnit: '',
      tooltip: `EPS compound annual growth rate over the selected ${period} period. ≥10% green, ≥5% yellow, <5% red.`,
    },
    {
      label: 'Revenue Growth',
      value: rev,
      threshold: classifyMetric('growth', rev),
      sparkData: tabs.growth.revenue,
      sparkUnit: 'B',
      tooltip: `Revenue compound annual growth rate over the selected ${period} period. ≥10% green, ≥5% yellow, <5% red.`,
    },
    {
      label: 'Net Income Growth',
      value: ni,
      threshold: classifyMetric('growth', ni),
      sparkData: tabs.growth.netIncome,
      sparkUnit: 'B',
      tooltip: `Net Income compound annual growth rate over the selected ${period} period. ≥10% green, ≥5% yellow, <5% red.`,
    },
    {
      label: 'FCF Growth',
      value: fcf,
      threshold: classifyMetric('growth', fcf),
      sparkData: tabs.cashFlow.fcfGrowth,
      tooltip: `Free Cash Flow average year-over-year growth over the selected ${period} period. ≥10% green, ≥5% yellow, <5% red.`,
    },
    {
      label: 'Book Value Growth',
      value: summary.bookValueGrowth,
      threshold: classifyMetric('growth', summary.bookValueGrowth),
      sparkData: tabs.financialHealth.bookValuePerShare,
      tooltip: 'Book Value Per Share compound annual growth rate over the full available history (not affected by the period toggle above). ≥10% green, ≥5% yellow, <5% red.',
    },
    {
      label: 'Debt / Equity',
      value: summary.debtEquity,
      threshold: classifyMetric('debtEquity', summary.debtEquity),
      sparkData: tabs.financialHealth.debtEquity,
      unit: 'x',
      tooltip: 'Total Debt ÷ Total Equity. ≤0.5x green, ≤1.0x yellow, >1.0x red.',
    },
    {
      label: 'Dividend Yield',
      value: dividendYield,
      threshold: classifyMetric('growth', dividendYield),
      sparkData: tabs.dividends?.dps ?? [],
      unit: '%',
      sparkUnit: '',
      tooltip: 'Annual Dividend Per Share ÷ Current Price × 100. ≥10% green, ≥5% yellow, <5% red.',
    },
    {
      label: 'P/E',
      value: pe,
      threshold: classifyMetric('pe', pe),
      sparkData: tabs.growth.eps,
      unit: 'x',
      sparkUnit: '',
      tooltip: 'Price ÷ Earnings Per Share. Lower means cheaper relative to earnings. ≤15x green, ≤25x yellow, >25x red.',
    },
    {
      label: 'P/B',
      value: pb,
      threshold: classifyMetric('pb', pb),
      sparkData: tabs.financialHealth.bookValuePerShare,
      unit: 'x',
      sparkUnit: '',
      tooltip: 'Price ÷ Book Value Per Share. Lower means cheaper relative to net assets. ≤1.5x green, ≤3x yellow, >3x red.',
    },
    {
      label: 'PEG',
      value: peg,
      threshold: classifyMetric('peg', peg),
      sparkData: tabs.growth.epsGrowthPct,
      unit: 'x',
      sparkUnit: '%',
      tooltip: 'P/E ÷ EPS Growth Rate. Below 1 suggests undervalued relative to growth. ≤1x green, ≤2x yellow, >2x red.',
    },
    {
      label: 'Sticker Price (₱)',
      value: stickerPrice,
      threshold: classifyStickerPrice(lastPrice, stickerPrice, mosPrice),
      sparkData: tabs.growth.eps,
      unit: '',
      sparkUnit: '',
      tooltip: stickerTooltip,
    },
    {
      label: 'MOS Buy Price (₱)',
      value: mosPrice,
      threshold: 'neutral' as const,
      sparkData: tabs.growth.eps,
      unit: '',
      sparkUnit: '',
      tooltip: mosTooltip,
    },
  ];

  return (
    <div className="space-y-3">
    <div className="flex items-center gap-1">
      <span className="text-xs text-muted-foreground mr-1">Avg period:</span>
      {(['3Y', '5Y', '10Y'] as Period[]).map((p) => (
        <button
          key={p}
          onClick={() => setPeriod(p)}
          className={cn(
            'px-2.5 py-1 text-xs rounded font-medium transition-colors',
            period === p
              ? 'bg-foreground text-background'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          )}
        >
          {p}
        </button>
      ))}
    </div>
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((m) => (
        <MetricCard key={m.label} {...m} sparkUnit={m.sparkUnit} years={years} />
      ))}
    </div>
    </div>
  );
}
