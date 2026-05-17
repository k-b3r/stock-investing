'use client';

import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MetricTable, type MetricRow } from './MetricTable';
import type { TransformedFinancials } from '@/lib/types/financials';

interface Props {
  financials: TransformedFinancials;
}

const fmt = {
  pct: (v: number) => v.toFixed(1) + '%',
  ratio: (v: number) => v.toFixed(2) + 'x',
  abs: (v: number) => v.toFixed(2),
};

export function FinancialTabs({ financials }: Props) {
  const { tabs } = financials;

  const growthRows: MetricRow[] = [
    { label: 'EPS (₱)', data: tabs.growth.eps, format: fmt.abs },
    { label: 'Revenue (B)', data: tabs.growth.revenue, format: fmt.abs },
    { label: 'Net Income (B)', data: tabs.growth.netIncome, format: fmt.abs },
  ];

  const profitabilityRows: MetricRow[] = [
    { label: 'ROE', data: tabs.profitability.roe, category: 'roic', format: fmt.pct },
    { label: 'ROA', data: tabs.profitability.roa, category: 'roic', format: fmt.pct },
    {
      label: 'ROIC',
      data: tabs.profitability.roic,
      category: 'roic',
      format: fmt.pct,
      tooltip: 'ROIC is not applicable for banks and financial institutions',
    },
  ];

  const healthRows: MetricRow[] = [
    { label: 'Debt / Equity', data: tabs.financialHealth.debtEquity, category: 'debtEquity', format: fmt.ratio },
    { label: 'Current Ratio', data: tabs.financialHealth.currentRatio, format: fmt.ratio },
    { label: 'Book Value / Share (₱)', data: tabs.financialHealth.bookValuePerShare, format: fmt.abs },
  ];

  const cashFlowRows: MetricRow[] = [
    { label: 'FCF Growth', data: tabs.cashFlow.fcfGrowth, category: 'growth', format: fmt.pct },
    { label: 'Operating CF Growth', data: tabs.cashFlow.operatingCFGrowth, category: 'growth', format: fmt.pct },
    { label: 'FCF / Net Income', data: tabs.cashFlow.fcfToNetIncome, format: fmt.ratio },
  ];

  return (
    <Tabs defaultValue="growth">
      <TabsList>
        <TabsTrigger value="growth">Growth</TabsTrigger>
        <TabsTrigger value="profitability">Profitability</TabsTrigger>
        <TabsTrigger value="health">Financial Health</TabsTrigger>
        <TabsTrigger value="cashflow">Cash Flow</TabsTrigger>
      </TabsList>

      <TabsContent value="growth" className="mt-4">
        <MetricTable rows={growthRows} />
      </TabsContent>
      <TabsContent value="profitability" className="mt-4">
        <MetricTable rows={profitabilityRows} />
      </TabsContent>
      <TabsContent value="health" className="mt-4">
        <MetricTable rows={healthRows} />
      </TabsContent>
      <TabsContent value="cashflow" className="mt-4">
        <MetricTable rows={cashFlowRows} />
      </TabsContent>
    </Tabs>
  );
}
