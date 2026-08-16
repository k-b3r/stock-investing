export const dynamic = 'force-dynamic';

import { notFound } from 'next/navigation';
import { getFinancials } from '@/storage/financials';
import { transformFinancials } from '@/service/financials';
import { toPhp } from '@/service/currency';
import { getStockData, getCompanyName } from '@/lib/pse-edge';
import { getUsdToPhpRate } from '@/lib/fx';
import { getDisclosures } from '@/storage/disclosures';
import { getCompanyProfile } from '@/storage/company-profiles';
import { getInvestmentThesis } from '@/storage/investment-thesis';
import { getNewsArticles } from '@/lib/google-news';
import { MetricStrip } from '@/components/dashboard/MetricStrip';
import { FinancialTabs } from '@/components/dashboard/FinancialTabs';
import { CompanyAbout } from '@/components/dashboard/CompanyAbout';
import { InvestmentThesisCard } from '@/components/dashboard/InvestmentThesisCard';
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

  const [stockData, disclosures, newsArticles, usdToPhpRate, companyProfile, investmentThesis] = await Promise.all([
    getStockData(upper),
    getDisclosures(upper),
    companyName ? getNewsArticles(companyName) : Promise.resolve([]),
    getUsdToPhpRate(),
    getCompanyProfile(upper),
    getInvestmentThesis(upper),
  ]);
  const { lastPrice, high52w } = stockData;

  const financials = transformFinancials(raw);
  const { tabs, summary, currency } = financials;

  const latestDpsRaw  = tabs.dividends?.dps.findLast((d) => d.value !== null)?.value ?? null;
  const latestEpsRaw  = tabs.growth.eps.findLast((d) => d.value !== null)?.value ?? null;
  const latestBvpsRaw = tabs.financialHealth.bookValuePerShare.findLast((d) => d.value !== null)?.value ?? null;

  const latestDps  = toPhp(latestDpsRaw, currency, usdToPhpRate);
  const latestEps  = toPhp(latestEpsRaw, currency, usdToPhpRate);
  const latestBvps = toPhp(latestBvpsRaw, currency, usdToPhpRate);

  const dividendYield = latestDps && lastPrice ? (latestDps / lastPrice) * 100 : null;
  const pe  = lastPrice && latestEps && latestEps > 0 ? lastPrice / latestEps : null;
  const pb  = lastPrice && latestBvps && latestBvps > 0 ? lastPrice / latestBvps : null;
  const epsGrowthRate = summary.epsGrowth.tenYearAvg ?? summary.epsGrowth.fiveYearAvg ?? summary.epsGrowth.threeYearAvg;
  const peg = pe && epsGrowthRate && epsGrowthRate > 0 ? pe / epsGrowthRate : null;

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
          latestEps={latestEps}
          high52w={high52w}
        />
        <FinancialTabs
          financials={financials}
          disclosures={disclosures}
          newsArticles={newsArticles}
        />
        <CompanyAbout profile={companyProfile} />
        <InvestmentThesisCard thesis={investmentThesis} />
      </div>
    </main>
  );
}
