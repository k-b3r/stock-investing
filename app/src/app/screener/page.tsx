import { getAllFinancials } from '@/storage/financials';
import { transformFinancials } from '@/service/financials';
import { ScreenerTable, type ScreenerRow } from '@/components/screener/ScreenerTable';

function bigFiveScore(row: Omit<ScreenerRow, 'score'>): number {
  const metrics = [row.roic, row.epsGrowth, row.revenueGrowth, row.niGrowth, row.fcfGrowth];
  return metrics.filter(v => v !== null && v >= 10).length;
}

export default async function ScreenerPage() {
  const raws = await getAllFinancials();

  const rows: ScreenerRow[] = raws.flatMap(raw => {
    try {
      const f = transformFinancials(raw);
      const { summary } = f;
      const period = summary.epsGrowth.tenYearAvg ?? summary.epsGrowth.fiveYearAvg ?? summary.epsGrowth.threeYearAvg;
      const revPeriod = summary.revenueGrowth.tenYearAvg ?? summary.revenueGrowth.fiveYearAvg ?? summary.revenueGrowth.threeYearAvg;
      const niPeriod = summary.netIncomeGrowth.tenYearAvg ?? summary.netIncomeGrowth.fiveYearAvg ?? summary.netIncomeGrowth.threeYearAvg;
      const fcfPeriod = summary.fcfGrowth.tenYearAvg ?? summary.fcfGrowth.fiveYearAvg ?? summary.fcfGrowth.threeYearAvg;

      const partial = {
        ticker: raw.ticker,
        roic: summary.roic,
        epsGrowth: period ?? null,
        revenueGrowth: revPeriod ?? null,
        niGrowth: niPeriod ?? null,
        fcfGrowth: fcfPeriod ?? null,
        bvGrowth: summary.bookValueGrowth,
        debtEquity: summary.debtEquity,
      };
      return [{ ...partial, score: bigFiveScore(partial) }];
    } catch {
      return [];
    }
  });

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
