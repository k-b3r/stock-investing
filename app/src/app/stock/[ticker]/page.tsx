export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getFinancials } from '@/storage/financials';
import { transformFinancials } from '@/service/financials';
import { getLastPrice } from '@/lib/pse-edge';
import { MetricStrip } from '@/components/dashboard/MetricStrip';
import { FinancialTabs } from '@/components/dashboard/FinancialTabs';

interface Props {
  params: Promise<{ ticker: string }>;
}

export default async function StockPage({ params }: Props) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();

  const [raw, lastPrice] = await Promise.all([
    getFinancials(upper),
    getLastPrice(upper),
  ]);

  if (!raw) notFound();

  const financials = transformFinancials(raw);

  const latestDps = financials.tabs.dividends.dps.findLast((d) => d.value !== null)?.value ?? null;
  const dividendYield = latestDps && lastPrice ? (latestDps / lastPrice) * 100 : null;

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">
            {upper}
            {lastPrice && (
              <span className="ml-3 text-xl font-normal text-muted-foreground">
                ₱{lastPrice.toFixed(2)}
              </span>
            )}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">PSE-listed · Morningstar data</p>
        </div>
        <MetricStrip financials={financials} dividendYield={dividendYield} />
        <FinancialTabs financials={financials} />
      </div>
    </main>
  );
}
