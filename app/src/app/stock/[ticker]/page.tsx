import { notFound } from 'next/navigation';
import { getFinancials } from '@/storage/financials';
import { transformFinancials } from '@/service/financials';
import { MetricStrip } from '@/components/dashboard/MetricStrip';

interface Props {
  params: Promise<{ ticker: string }>;
}

export default async function StockPage({ params }: Props) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();

  const raw = await getFinancials(upper);
  if (!raw) notFound();

  const financials = transformFinancials(raw);

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">{upper}</h1>
          <p className="text-muted-foreground text-sm mt-1">PSE-listed · Morningstar data</p>
        </div>
        <MetricStrip financials={financials} />
      </div>
    </main>
  );
}
