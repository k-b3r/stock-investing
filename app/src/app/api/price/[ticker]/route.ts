export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getFinancials } from '@/storage/financials';
import { transformFinancials } from '@/service/financials';
import { computeStickerPrice } from '@/service/valuation';
import { toPhp } from '@/service/currency';
import { getLastPrice } from '@/lib/pse-edge';
import { getUsdToPhpRate } from '@/lib/fx';

interface Params {
  params: Promise<{ ticker: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { ticker } = await params;
  const upper = ticker.toUpperCase();

  const raw = await getFinancials(upper);
  if (!raw) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const [lastPrice, usdToPhpRate] = await Promise.all([getLastPrice(upper), getUsdToPhpRate()]);
  const { summary, tabs, currency } = transformFinancials(raw);
  const latestEpsRaw = tabs.growth.eps.findLast((d) => d.value !== null)?.value ?? null;
  const latestEps = toPhp(latestEpsRaw, currency, usdToPhpRate);
  const epsGrowthRate = summary.epsGrowth.tenYearAvg ?? summary.epsGrowth.fiveYearAvg ?? summary.epsGrowth.threeYearAvg;
  const stickerResult = computeStickerPrice(latestEps, epsGrowthRate);

  return NextResponse.json({
    lastPrice,
    stickerPrice: stickerResult?.stickerPrice ?? null,
    mosPrice: stickerResult?.mosPrice ?? null,
  });
}
