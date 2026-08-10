export const dynamic = 'force-dynamic';

import { getAllFinancials } from '@/storage/financials';
import { transformFinancials } from '@/service/financials';
import { computeStickerPrice } from '@/service/valuation';
import { getLastPrice } from '@/lib/pse-edge';
import { ScreenerTable, type ScreenerRow } from '@/components/screener/ScreenerTable';

function bigFiveScore(row: Omit<ScreenerRow, 'score'>): number {
  const metrics = [row.roic, row.epsGrowth, row.revenueGrowth, row.niGrowth, row.fcfGrowth];
  return metrics.filter(v => v !== null && v >= 10).length;
}

export default async function ScreenerPage() {
  const raws = await getAllFinancials();

  const partials = raws.flatMap(raw => {
    try {
      const f = transformFinancials(raw);
      const { summary, tabs } = f;
      const period = summary.epsGrowth.tenYearAvg ?? summary.epsGrowth.fiveYearAvg ?? summary.epsGrowth.threeYearAvg;
      const revPeriod = summary.revenueGrowth.tenYearAvg ?? summary.revenueGrowth.fiveYearAvg ?? summary.revenueGrowth.threeYearAvg;
      const niPeriod = summary.netIncomeGrowth.tenYearAvg ?? summary.netIncomeGrowth.fiveYearAvg ?? summary.netIncomeGrowth.threeYearAvg;
      const fcfPeriod = summary.fcfGrowth.tenYearAvg ?? summary.fcfGrowth.fiveYearAvg ?? summary.fcfGrowth.threeYearAvg;
      const dpsPeriod = summary.dpsGrowth.tenYearAvg ?? summary.dpsGrowth.fiveYearAvg ?? summary.dpsGrowth.threeYearAvg;
      const latestEps = tabs.growth.eps.findLast(d => d.value !== null)?.value ?? null;

      return [{
        ticker: raw.ticker,
        roic: summary.roic,
        epsGrowth: period ?? null,
        revenueGrowth: revPeriod ?? null,
        niGrowth: niPeriod ?? null,
        fcfGrowth: fcfPeriod ?? null,
        bvGrowth: summary.bookValueGrowth,
        dpsGrowth: dpsPeriod ?? null,
        debtEquity: summary.debtEquity,
        latestEps,
        epsGrowthRate: period ?? null,
      }];
    } catch {
      return [];
    }
  });

  const rows: ScreenerRow[] = await Promise.all(
    partials.map(async (p) => {
      const lastPrice = await getLastPrice(p.ticker);
      const stickerResult = computeStickerPrice(p.latestEps, p.epsGrowthRate);
      const { latestEps, epsGrowthRate, ...rest } = p;
      const partial = {
        ...rest,
        lastPrice,
        stickerPrice: stickerResult?.stickerPrice ?? null,
        mosPrice: stickerResult?.mosPrice ?? null,
      };
      return { ...partial, score: bigFiveScore(partial) };
    })
  );

  return (
    <main className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Screener</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {rows.length} PSE-listed companies · Rule #1 Big Five · click column to sort
          </p>
        </div>
        <ScreenerTable rows={rows} />
      </div>
    </main>
  );
}
