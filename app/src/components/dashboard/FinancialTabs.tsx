'use client';

import { useState } from 'react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { MetricTable, type MetricRow } from './MetricTable';
import type { TransformedFinancials } from '@/lib/types/financials';
import type { PseDisclosure } from '@/lib/pse-edge';
import type { NewsArticle } from '@/lib/google-news';

interface Props {
  financials: TransformedFinancials;
  disclosures?: PseDisclosure[];
  newsArticles?: NewsArticle[];
}

const fmt = {
  pct: (v: number) => v.toFixed(1) + '%',
  ratio: (v: number) => v.toFixed(2) + 'x',
  abs: (v: number) => v.toFixed(2),
};

function DisclosuresList({ disclosures }: { disclosures: PseDisclosure[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (!disclosures.length) return <p className="text-sm text-muted-foreground">No disclosures found.</p>;

  return (
    <ul className="divide-y divide-border/40">
      {disclosures.map((d) => {
        const id = d.disclosureId ?? d.formNum;
        const isOpen = expanded === id;
        return (
          <li key={id}>
            <button
              onClick={() => setExpanded(isOpen ? null : id)}
              className="w-full flex items-start gap-4 py-2.5 text-left hover:bg-muted/30 transition-colors px-1"
            >
              <span className="text-xs text-muted-foreground whitespace-nowrap pt-0.5 w-24 shrink-0">{d.date}</span>
              <span className="text-xs flex-1">{d.templateNm}</span>
              <span className="text-xs text-muted-foreground shrink-0">{isOpen ? '▲' : '▼'}</span>
            </button>
            {isOpen && (
              <div className="px-1 pb-3 pt-1">
                {d.content ? (
                  <p className="text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap">{d.content}</p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No description available. {d.disclosureId && (
                    <a href={`https://edge.pse.com.ph/openDiscViewer.do?edge_no=${d.disclosureId}`}
                      target="_blank" rel="noopener noreferrer" className="underline">View on PSE Edge ↗</a>
                  )}</p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function formatDate(raw: string): string {
  const d = new Date(raw);
  if (isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function FinancialTabs({ financials, disclosures = [], newsArticles = [] }: Props) {
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

  const dividendRows: MetricRow[] = [
    { label: 'Dividends / Share (₱)', data: tabs.dividends?.dps ?? [], format: fmt.abs },
  ];

  return (
    <Tabs defaultValue="growth" className="flex-col gap-0">
      <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0 border-b border-border w-full justify-start rounded-none pb-0">
        {(['growth','profitability','health','cashflow','dividends','disclosures','news'] as const).map((v) => (
          <TabsTrigger
            key={v}
            value={v}
            className="rounded-t-md rounded-b-none border border-b-0 border-border bg-muted/40 px-4 py-1.5 text-sm data-active:bg-background data-active:text-foreground data-active:border-border data-active:shadow-none translate-y-px"
          >
            {v === 'growth' ? 'Growth'
              : v === 'profitability' ? 'Profitability'
              : v === 'health' ? 'Financial Health'
              : v === 'cashflow' ? 'Cash Flow'
              : v === 'dividends' ? 'Dividends'
              : v === 'disclosures' ? 'Disclosures'
              : 'News'}
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="growth" className="pt-4">
        <MetricTable rows={growthRows} />
      </TabsContent>
      <TabsContent value="profitability" className="pt-4">
        <MetricTable rows={profitabilityRows} />
      </TabsContent>
      <TabsContent value="health" className="pt-4">
        <MetricTable rows={healthRows} />
      </TabsContent>
      <TabsContent value="cashflow" className="pt-4">
        <MetricTable rows={cashFlowRows} />
      </TabsContent>
      <TabsContent value="dividends" className="pt-4">
        <MetricTable rows={dividendRows} />
      </TabsContent>

      <TabsContent value="disclosures" className="pt-4">
        <DisclosuresList disclosures={disclosures} />
      </TabsContent>

      <TabsContent value="news" className="pt-4">
        {newsArticles.length === 0 ? (
          <p className="text-sm text-muted-foreground">No news found.</p>
        ) : (
          <ul className="space-y-3">
            {newsArticles.map((a, i) => (
              <li key={i} className="border-b border-border/40 pb-3 last:border-0">
                <a
                  href={a.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-medium hover:underline leading-snug block"
                >
                  {a.title}
                </a>
                <div className="mt-1 flex gap-2 text-xs text-muted-foreground">
                  {a.source && <span>{a.source}</span>}
                  {a.pubDate && <span>· {formatDate(a.pubDate)}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>
    </Tabs>
  );
}
