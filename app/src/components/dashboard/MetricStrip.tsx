import { MetricCard } from './MetricCard';
import { classifyMetric } from '@/service/thresholds';
import type { GrowthMetric, TransformedFinancials } from '@/lib/types/financials';

interface Props {
  financials: TransformedFinancials;
}

function bestGrowth(g: GrowthMetric): { value: number | null; label: string } {
  if (g.tenYearAvg !== null) return { value: g.tenYearAvg, label: '10Y' };
  if (g.fiveYearAvg !== null) return { value: g.fiveYearAvg, label: '5Y' };
  if (g.threeYearAvg !== null) return { value: g.threeYearAvg, label: '3Y' };
  return { value: g.yearOverYear, label: 'YoY' };
}

export function MetricStrip({ financials }: Props) {
  const { summary, tabs } = financials;

  const eps = bestGrowth(summary.epsGrowth);
  const rev = bestGrowth(summary.revenueGrowth);
  const ni = bestGrowth(summary.netIncomeGrowth);
  const fcf = bestGrowth(summary.fcfGrowth);

  const metrics = [
    {
      label: 'ROIC',
      value: summary.roic,
      threshold: classifyMetric('roic', summary.roic),
      sparkData: tabs.profitability.roic,
    },
    {
      label: `EPS Growth (${eps.label})`,
      value: eps.value,
      threshold: classifyMetric('growth', eps.value),
      sparkData: tabs.growth.eps,
    },
    {
      label: `Revenue Growth (${rev.label})`,
      value: rev.value,
      threshold: classifyMetric('growth', rev.value),
      sparkData: tabs.growth.revenue,
    },
    {
      label: `Net Income Growth (${ni.label})`,
      value: ni.value,
      threshold: classifyMetric('growth', ni.value),
      sparkData: tabs.growth.netIncome,
    },
    {
      label: `FCF Growth (${fcf.label})`,
      value: fcf.value,
      threshold: classifyMetric('growth', fcf.value),
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
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((m) => (
        <MetricCard key={m.label} {...m} />
      ))}
    </div>
  );
}
