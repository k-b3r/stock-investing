'use client';

import { useState } from 'react';
import { MetricCard } from './MetricCard';
import { classifyMetric } from '@/service/thresholds';
import { cn } from '@/lib/utils';
import type { GrowthMetric, TransformedFinancials } from '@/lib/types/financials';

interface Props {
  financials: TransformedFinancials;
}

type Period = '3Y' | '5Y' | '10Y';

function pickGrowth(g: GrowthMetric, period: Period): number | null {
  if (period === '10Y') return g.tenYearAvg ?? g.fiveYearAvg ?? g.threeYearAvg ?? g.yearOverYear;
  if (period === '5Y') return g.fiveYearAvg ?? g.threeYearAvg ?? g.yearOverYear;
  return g.threeYearAvg ?? g.yearOverYear;
}

export function MetricStrip({ financials }: Props) {
  const { summary, tabs } = financials;
  const [period, setPeriod] = useState<Period>('10Y');
  const years = period === '3Y' ? 3 : period === '5Y' ? 5 : 10;

  const eps = pickGrowth(summary.epsGrowth, period);
  const rev = pickGrowth(summary.revenueGrowth, period);
  const ni = pickGrowth(summary.netIncomeGrowth, period);
  const fcf = pickGrowth(summary.fcfGrowth, period);

  const metrics = [
    {
      label: 'ROIC',
      value: summary.roic,
      threshold: classifyMetric('roic', summary.roic),
      sparkData: tabs.profitability.roic,
    },
    {
      label: 'EPS Growth',
      value: eps,
      threshold: classifyMetric('growth', eps),
      sparkData: tabs.growth.epsGrowthPct,
    },
    {
      label: 'Revenue Growth',
      value: rev,
      threshold: classifyMetric('growth', rev),
      sparkData: tabs.growth.revenueGrowthPct,
    },
    {
      label: 'Net Income Growth',
      value: ni,
      threshold: classifyMetric('growth', ni),
      sparkData: tabs.growth.netIncomeGrowthPct,
    },
    {
      label: 'FCF Growth',
      value: fcf,
      threshold: classifyMetric('growth', fcf),
      sparkData: tabs.cashFlow.fcfGrowth,
    },
    {
      label: 'Book Value Growth',
      value: summary.bookValueGrowth,
      threshold: classifyMetric('growth', summary.bookValueGrowth),
      sparkData: tabs.financialHealth.bookValuePerShare,
    },
    {
      label: 'Debt / Equity',
      value: summary.debtEquity,
      threshold: classifyMetric('debtEquity', summary.debtEquity),
      sparkData: tabs.financialHealth.debtEquity,
      unit: 'x',
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
        <MetricCard key={m.label} {...m} years={years} />
      ))}
    </div>
    </div>
  );
}
