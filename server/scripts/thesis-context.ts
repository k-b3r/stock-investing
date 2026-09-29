import { computeFuturePeCap, computeStickerPrice, dropEpsOutliers } from '../../shared/valuation.ts';
import { getCompanyInfo, getStockDataByCmpyId } from '../../shared/pse-edge.ts';
import { getNewsArticles } from '../../shared/google-news.ts';
import { getUsdToPhpRate } from '../../shared/fx.ts';
import { toPhp } from '../../shared/currency.ts';
import { isAnnualYM, isAnnualYear } from '../../shared/fiscal-period.ts';
import { getFinancialByTicker } from '../src/repositories/financials.ts';
import { getCompanyProfile } from '../src/repositories/company-profiles.ts';
import { listRecentDisclosureTemplates } from '../src/repositories/disclosures.ts';

export interface TickerContext {
  ticker: string;
  companyName: string;
  sector: string | null;
  subsector: string | null;
  description: string | null;
  roic: number | null;
  epsGrowth: number | null;
  revenueGrowth: number | null;
  netIncomeGrowth: number | null;
  fcfGrowth: number | null;
  bookValueGrowth: number | null;
  debtEquity: number | null;
  lastPrice: number | null;
  pe: number | null;
  pb: number | null;
  peg: number | null;
  dividendYield: number | null;
  stickerPrice: number | null;
  mosPrice: number | null;
  disclosures: { date: string; template: string }[];
  news: { title: string; source: string }[];
}

async function getNews(companyName: string): Promise<{ title: string; source: string }[]> {
  const articles = await getNewsArticles(companyName);
  return articles.slice(0, 5).map((a) => ({ title: a.title, source: a.source }));
}

export async function buildTickerContext(ticker: string): Promise<TickerContext | null> {
  const upper = ticker.toUpperCase();

  const financialRow = await getFinancialByTicker(upper);
  if (!financialRow) return null;
  const raw = financialRow.data;

  const currency = raw.growth?.currency ?? 'PHP';
  const usdToPhpRate = currency === 'USD' ? await getUsdToPhpRate() : null;

  const annualGrowth = (raw.growth?.dataList ?? []).filter((r) => isAnnualYM(r.fiscalPeriodYearMonth));
  const latestGrowth = annualGrowth[annualGrowth.length - 1];
  const pick = (m?: { tenYearAvg: number | null; fiveYearAvg: number | null; threeYearAvg: number | null; yearOverYear: number | null }) =>
    m?.tenYearAvg ?? m?.fiveYearAvg ?? m?.threeYearAvg ?? m?.yearOverYear ?? null;

  // Morningstar's EPS growth is derived from its own EPS series, so a unit-glitched EPS year
  // (JFC 2025: 9386) poisons that year's growth too. Use the year of the latest valid EPS.
  const annualIncome = (raw['keyMetrics.annual']?.incomeStatementList?.dataList ?? []).filter((r) => isAnnualYM(r.fiscalPeriodYearMonth));
  const epsValues = dropEpsOutliers(annualIncome.map((r) => r.basicEPS));
  const latestEpsIdx = epsValues.findLastIndex((v) => v !== null);
  const latestEpsRaw = latestEpsIdx === -1 ? null : epsValues[latestEpsIdx];
  const latestEpsYM = latestEpsIdx === -1 ? null : annualIncome[latestEpsIdx].fiscalPeriodYearMonth;
  const epsGrowthRow = annualGrowth.find((r) => r.fiscalPeriodYearMonth === latestEpsYM) ?? latestGrowth;
  const epsGrowth = pick(epsGrowthRow?.epsPer);
  const revenueGrowth = pick(latestGrowth?.revenuePer);
  const netIncomeGrowth = pick(latestGrowth?.netIncomePer);

  const annualProfit = (raw.profitability?.dataList ?? []).filter((r) => isAnnualYear(r.fiscalPeriodYear));
  const roic = annualProfit[annualProfit.length - 1]?.roic ?? null;

  const annualHealth = (raw.financialHealth?.dataList ?? []).filter((r) => isAnnualYM(r.fiscalPeriodYearMonth));
  const debtEquity = annualHealth[annualHealth.length - 1]?.debtEquityRatio ?? null;
  const withBV = annualHealth.filter((r): r is typeof r & { bookValuePerShare: number } => r.bookValuePerShare !== null);
  let bookValueGrowth: number | null = null;
  if (withBV.length >= 2) {
    const first = withBV[0];
    const last = withBV[withBV.length - 1];
    const span = parseInt(last.fiscalPeriodYearMonth.slice(0, 4), 10) - parseInt(first.fiscalPeriodYearMonth.slice(0, 4), 10);
    if (span > 0) bookValueGrowth = ((last.bookValuePerShare / first.bookValuePerShare) ** (1 / span) - 1) * 100;
  }
  const latestBvpsRaw = withBV[withBV.length - 1]?.bookValuePerShare ?? null;

  const annualCF = (raw.cashFlow?.dataList ?? []).filter((r) => isAnnualYM(r.fiscalPeriodYearMonth));
  const fcfVals = annualCF.slice(-10).map((r) => r.freeCashFlowGrowthPer).filter((v): v is number => v !== null);
  const fcfGrowth = fcfVals.length > 0 ? fcfVals.reduce((a, b) => a + b, 0) / fcfVals.length : null;

  const latestDpsRaw = [...annualIncome].reverse().find((r) => r.dividentPerShare !== null)?.dividentPerShare ?? null;

  const latestEps = toPhp(latestEpsRaw, currency, usdToPhpRate);
  const latestBvps = toPhp(latestBvpsRaw, currency, usdToPhpRate);
  const latestDps = toPhp(latestDpsRaw, currency, usdToPhpRate);

  const profile = (await getCompanyProfile(upper)) ?? { description: null, sector: null, subsector: null };

  const disclosureRows = await listRecentDisclosureTemplates(upper, 10);
  const disclosures = disclosureRows.map((r) => ({ date: r.filed_at, template: r.template }));

  const info = await getCompanyInfo(upper);
  const companyName = info?.cmpyNm ?? upper;
  const { lastPrice, high52w } = info ? await getStockDataByCmpyId(info.cmpyId) : { lastPrice: null, high52w: null };
  const news = await getNews(companyName);

  const pe = lastPrice && latestEps && latestEps > 0 ? lastPrice / latestEps : null;
  const pb = lastPrice && latestBvps && latestBvps > 0 ? lastPrice / latestBvps : null;
  const dividendYield = latestDps && lastPrice ? (latestDps / lastPrice) * 100 : null;
  const peg = pe && epsGrowth && epsGrowth > 0 ? pe / epsGrowth : null;

  const futurePeCap = computeFuturePeCap(high52w, latestEps);
  const stickerResult = computeStickerPrice(latestEps, epsGrowth, futurePeCap);

  return {
    ticker: upper,
    companyName,
    sector: profile.sector,
    subsector: profile.subsector,
    description: profile.description,
    roic,
    epsGrowth,
    revenueGrowth,
    netIncomeGrowth,
    fcfGrowth,
    bookValueGrowth,
    debtEquity,
    lastPrice,
    pe,
    pb,
    peg,
    dividendYield,
    stickerPrice: stickerResult?.stickerPrice ?? null,
    mosPrice: stickerResult?.mosPrice ?? null,
    disclosures,
    news,
  };
}

function fmt(value: number | null, decimals = 2): string {
  return value === null ? 'N/A' : value.toFixed(decimals);
}

export function buildDataBlock(ctx: TickerContext): string {
  const mosComparison =
    ctx.lastPrice !== null && ctx.mosPrice !== null
      ? ctx.lastPrice <= ctx.mosPrice
        ? `BELOW MOS by ${(((ctx.mosPrice - ctx.lastPrice) / ctx.mosPrice) * 100).toFixed(1)}%`
        : `ABOVE MOS by ${(((ctx.lastPrice - ctx.mosPrice) / ctx.mosPrice) * 100).toFixed(1)}%`
      : 'N/A';

  const disclosureList = ctx.disclosures.length
    ? ctx.disclosures.map((d) => `- ${d.date}: ${d.template}`).join('\n')
    : '(none available)';

  const newsList = ctx.news.length
    ? ctx.news.map((n) => `- ${n.title}${n.source ? ` (${n.source})` : ''}`).join('\n')
    : '(none available)';

  return `## Company: ${ctx.companyName} (${ctx.ticker})
Sector: ${ctx.sector ?? 'N/A'} / ${ctx.subsector ?? 'N/A'}
${ctx.description ?? 'N/A'}

## Key Metrics (10-year averages where available)
- ROIC: ${fmt(ctx.roic, 1)}%
- EPS Growth: ${fmt(ctx.epsGrowth, 1)}%
- Revenue Growth: ${fmt(ctx.revenueGrowth, 1)}%
- Net Income Growth: ${fmt(ctx.netIncomeGrowth, 1)}%
- FCF Growth: ${fmt(ctx.fcfGrowth, 1)}%
- Book Value Growth: ${fmt(ctx.bookValueGrowth, 1)}%
- Debt/Equity: ${fmt(ctx.debtEquity, 2)}x

## Valuation
- Current Price: ₱${fmt(ctx.lastPrice)}
- P/E: ${fmt(ctx.pe, 1)}x | P/B: ${fmt(ctx.pb, 1)}x | PEG: ${fmt(ctx.peg, 2)}x | Dividend Yield: ${fmt(ctx.dividendYield, 1)}%
- Sticker Price (Rule #1 fair value): ₱${fmt(ctx.stickerPrice)}
- MOS Buy Price (50% margin of safety): ₱${fmt(ctx.mosPrice)}
- Current price is ${mosComparison}

## Recent Disclosures (last ${ctx.disclosures.length})
${disclosureList}

## Recent News (last ${ctx.news.length})
${newsList}`;
}

export type Verdict = 'buy' | 'watch' | 'pass';

export interface ParsedThesis {
  thesis: string;
  verdict: Verdict | null;
  highlights: string[];
}

export function parseThesisOutput(raw: string): ParsedThesis {
  const [thesisPart, blockPart] = raw.trim().split('---VERDICT---');
  const thesis = thesisPart.trim();

  let verdict: Verdict | null = null;
  let highlights: string[] = [];
  if (blockPart) {
    const [verdictSection, highlightsSection] = blockPart.split('---HIGHLIGHTS---');
    const verdictMatch = (verdictSection ?? '').match(/^\s*(buy|watch|pass)\s*$/im);
    verdict = (verdictMatch?.[1].toLowerCase() as Verdict | undefined) ?? null;
    highlights = (highlightsSection ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).trim());
  }
  return { thesis, verdict, highlights };
}
