export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getFinancials } from '@/storage/financials';
import { transformFinancials } from '@/service/financials';
import { computeStickerPrice } from '@/service/valuation';
import { getLastPrice, getCompanyName } from '@/lib/pse-edge';
import { getDisclosures } from '@/storage/disclosures';
import { getNewsArticles } from '@/lib/google-news';
import { MetricStrip } from '@/components/dashboard/MetricStrip';
import { FinancialTabs } from '@/components/dashboard/FinancialTabs';
import { BackButton } from '@/components/BackButton';

interface Props {
  params: Promise<{ ticker: string }>;
}

export default async function StockPage({ params }: Props) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();

  const [raw, companyName] = await Promise.all([
    getFinancials(upper),
    getCompanyName(upper),
  ]);

  if (!raw) notFound();

  const [lastPrice, disclosures, newsArticles] = await Promise.all([
    getLastPrice(upper),
    getDisclosures(upper),
    companyName ? getNewsArticles(companyName) : Promise.resolve([]),
  ]);

  const financials = transformFinancials(raw);
  const { tabs, summary } = financials;

  const latestDps  = tabs.dividends?.dps.findLast((d) => d.value !== null)?.value ?? null;
  const latestEps  = tabs.growth.eps.findLast((d) => d.value !== null)?.value ?? null;
  const latestBvps = tabs.financialHealth.bookValuePerShare.findLast((d) => d.value !== null)?.value ?? null;

  const dividendYield = latestDps && lastPrice ? (latestDps / lastPrice) * 100 : null;
  const pe  = lastPrice && latestEps && latestEps > 0 ? lastPrice / latestEps : null;
  const pb  = lastPrice && latestBvps && latestBvps > 0 ? lastPrice / latestBvps : null;
  const epsGrowthRate = summary.epsGrowth.tenYearAvg ?? summary.epsGrowth.fiveYearAvg ?? summary.epsGrowth.threeYearAvg;
  const peg = pe && epsGrowthRate && epsGrowthRate > 0 ? pe / epsGrowthRate : null;
  const stickerResult = computeStickerPrice(latestEps, epsGrowthRate);
  const stickerPrice = stickerResult?.stickerPrice ?? null;
  const mosPrice = stickerResult?.mosPrice ?? null;

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div>
          <BackButton />
          <h1 className="text-3xl font-bold mt-2">
            {upper}
            {lastPrice && (
              <span className="ml-3 text-xl font-normal text-muted-foreground">
                ₱{lastPrice.toFixed(2)}
              </span>
            )}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {companyName ?? 'PSE-listed'} · Morningstar data
          </p>
        </div>
        <MetricStrip
          financials={financials}
          dividendYield={dividendYield}
          pe={pe}
          pb={pb}
          peg={peg}
          lastPrice={lastPrice}
          stickerPrice={stickerPrice}
          mosPrice={mosPrice}
        />
        <FinancialTabs
          financials={financials}
          disclosures={disclosures}
          newsArticles={newsArticles}
        />
      </div>
    </main>
  );
}
