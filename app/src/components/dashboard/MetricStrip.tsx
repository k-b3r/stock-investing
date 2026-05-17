import { MetricCard } from './MetricCard';
import { classifyMetric } from '@/service/thresholds';
import type { TransformedFinancials } from '@/lib/types/financials';

interface Props {
  financials: TransformedFinancials;
}

export function MetricStrip({ financials }: Props) {
  const { summary, tabs } = financials;

  const metrics = [
    {
      label: 'ROIC',
      value: summary.roic,
      threshold: classifyMetric('roic', summary.roic),
      sparkData: tabs.profitability.roic,
    },
    {
      label: 'EPS Growth',
      value: summary.epsGrowth.tenYearAvg,
      threshold: classifyMetric('growth', summary.epsGrowth.tenYearAvg),
      sparkData: tabs.growth.eps,
    },
    {
      label: 'Revenue Growth',
      value: summary.revenueGrowth.tenYearAvg,
      threshold: classifyMetric('growth', summary.revenueGrowth.tenYearAvg),
      sparkData: tabs.growth.revenue,
    },
    {
      label: 'Net Income Growth',
      value: summary.netIncomeGrowth.tenYearAvg,
      threshold: classifyMetric('growth', summary.netIncomeGrowth.tenYearAvg),
      sparkData: tabs.growth.netIncome,
    },
    {
      label: 'FCF Growth',
      value: summary.fcfGrowth.tenYearAvg,
      threshold: classifyMetric('growth', summary.fcfGrowth.tenYearAvg),
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
