import pg from 'pg';

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/stocks';
const BASE = 'https://edge.pse.com.ph';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://edge.pse.com.ph/',
};

const pool = new pg.Pool({ connectionString: DB_URL });

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

function isAnnualYM(s: string): boolean {
  return /^\d{4}-\d{2}$/.test(s);
}

function isAnnualYear(s: string): boolean {
  return /^\d{4}$/.test(s);
}

function toPhp(value: number | null, currency: string, usdToPhpRate: number | null): number | null {
  if (value === null) return null;
  if (currency === 'PHP') return value;
  if (currency === 'USD') return usdToPhpRate === null ? null : value * usdToPhpRate;
  return null;
}

const DEFAULT_FUTURE_PE_CAP = 20;

function computeFuturePeCap(high52w: number | null, eps: number | null): number {
  if (high52w === null || eps === null || eps <= 0) return DEFAULT_FUTURE_PE_CAP;
  const cap = high52w / eps;
  return cap > 0 ? cap : DEFAULT_FUTURE_PE_CAP;
}

function computeStickerPrice(
  eps: number | null,
  growthRatePct: number | null,
  futurePeCap: number = DEFAULT_FUTURE_PE_CAP
): { stickerPrice: number; mosPrice: number } | null {
  if (eps === null || eps <= 0) return null;
  if (growthRatePct === null || growthRatePct <= 0) return null;

  const cappedGrowthPct = Math.min(growthRatePct, 15);
  const cappedGrowth = cappedGrowthPct / 100;
  const futurePE = Math.min(cappedGrowthPct * 2, futurePeCap);
  const futureEps = eps * (1 + cappedGrowth) ** 10;
  const futureValue = futureEps * futurePE;
  const stickerPrice = futureValue / 1.15 ** 10;
  const mosPrice = stickerPrice * 0.5;

  return { stickerPrice, mosPrice };
}

async function getUsdToPhpRate(): Promise<number | null> {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) return null;
    const data = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (data.result !== 'success') return null;
    const rate = data.rates?.PHP;
    return typeof rate === 'number' ? rate : null;
  } catch {
    return null;
  }
}

async function getCompanyInfo(ticker: string): Promise<{ cmpyId: string; cmpyNm: string } | null> {
  try {
    const res = await fetch(
      `${BASE}/autoComplete/searchCompanyNameSymbol.ax?term=${encodeURIComponent(ticker)}`,
      { headers: HEADERS }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { cmpyId: string; cmpyNm: string }[];
    const first = data[0];
    return first ? { cmpyId: first.cmpyId, cmpyNm: first.cmpyNm } : null;
  } catch {
    return null;
  }
}

async function getStockData(cmpyId: string): Promise<{ lastPrice: number | null; high52w: number | null }> {
  try {
    const res = await fetch(`${BASE}/companyPage/stockData.do?cmpy_id=${cmpyId}`, { headers: HEADERS });
    if (!res.ok) return { lastPrice: null, high52w: null };

    const html = await res.text();
    const parseField = (regex: RegExp): number | null => {
      const match = html.match(regex);
      if (!match) return null;
      const value = parseFloat(match[1].replace(/,/g, ''));
      return isNaN(value) ? null : value;
    };

    const lastPrice =
      parseField(/Last Traded Price<\/th>\s*<td[^>]*>\s*([\d,]+(?:\.\d+)?)/) ??
      parseField(/Previous Close and Date<\/th>\s*<td[^>]*>\s*([\d,]+(?:\.\d+)?)/);
    const high52w = parseField(/52-Week High<\/th>\s*<td[^>]*>\s*([\d,]+(?:\.\d+)?)/);

    return { lastPrice, high52w };
  } catch {
    return { lastPrice: null, high52w: null };
  }
}

async function getNews(companyName: string): Promise<{ title: string; source: string }[]> {
  try {
    const query = encodeURIComponent(`"${companyName}" Philippines`);
    const res = await fetch(`https://news.google.com/rss/search?q=${query}&hl=en-PH&gl=PH&ceid=PH:en`, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    if (!res.ok) return [];

    const xml = await res.text();
    const items: { title: string; source: string }[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;
    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      const item = match[1];
      const rawTitle = item.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
      const source = item.match(/<source[^>]*>([^<]+)<\/source>/)?.[1]?.trim() ?? '';
      if (rawTitle) items.push({ title: rawTitle.replace(/&amp;/g, '&'), source });
    }
    return items;
  } catch {
    return [];
  }
}

export async function buildTickerContext(ticker: string): Promise<TickerContext | null> {
  const upper = ticker.toUpperCase();

  const financialsRes = await pool.query<{ data: Record<string, unknown> }>(
    'SELECT data FROM financials WHERE ticker = $1',
    [upper]
  );
  if (!financialsRes.rows[0]) return null;
  const raw = financialsRes.rows[0].data as {
    growth: { currency?: string; dataList: { fiscalPeriodYearMonth: string; epsPer: { tenYearAvg: number | null; fiveYearAvg: number | null; threeYearAvg: number | null; yearOverYear: number | null }; revenuePer: { tenYearAvg: number | null; fiveYearAvg: number | null; threeYearAvg: number | null; yearOverYear: number | null }; netIncomePer: { tenYearAvg: number | null; fiveYearAvg: number | null; threeYearAvg: number | null; yearOverYear: number | null } }[] };
    profitability: { dataList: { fiscalPeriodYear: string; roic: number | null }[] };
    financialHealth: { dataList: { fiscalPeriodYearMonth: string; debtEquityRatio: number | null; bookValuePerShare: number | null }[] };
    cashFlow: { dataList: { fiscalPeriodYearMonth: string; freeCashFlowGrowthPer: number | null }[] };
    'keyMetrics.annual': { incomeStatementList: { dataList: { fiscalPeriodYearMonth: string; basicEPS: number | null; dividentPerShare: number | null }[] } };
  };

  const currency = raw.growth?.currency ?? 'PHP';
  const usdToPhpRate = currency === 'USD' ? await getUsdToPhpRate() : null;

  const annualGrowth = (raw.growth?.dataList ?? []).filter((r) => isAnnualYM(r.fiscalPeriodYearMonth));
  const latestGrowth = annualGrowth[annualGrowth.length - 1];
  const pick = (m?: { tenYearAvg: number | null; fiveYearAvg: number | null; threeYearAvg: number | null; yearOverYear: number | null }) =>
    m?.tenYearAvg ?? m?.fiveYearAvg ?? m?.threeYearAvg ?? m?.yearOverYear ?? null;

  const epsGrowth = pick(latestGrowth?.epsPer);
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

  const annualIncome = (raw['keyMetrics.annual']?.incomeStatementList?.dataList ?? []).filter((r) => isAnnualYM(r.fiscalPeriodYearMonth));
  const latestEpsRaw = [...annualIncome].reverse().find((r) => r.basicEPS !== null)?.basicEPS ?? null;
  const latestDpsRaw = [...annualIncome].reverse().find((r) => r.dividentPerShare !== null)?.dividentPerShare ?? null;

  const latestEps = toPhp(latestEpsRaw, currency, usdToPhpRate);
  const latestBvps = toPhp(latestBvpsRaw, currency, usdToPhpRate);
  const latestDps = toPhp(latestDpsRaw, currency, usdToPhpRate);

  const profileRes = await pool.query<{ description: string | null; sector: string | null; subsector: string | null }>(
    'SELECT description, sector, subsector FROM company_profiles WHERE ticker = $1',
    [upper]
  );
  const profile = profileRes.rows[0] ?? { description: null, sector: null, subsector: null };

  const disclosuresRes = await pool.query<{ template: string; filed_at: string }>(
    'SELECT template, filed_at::text FROM disclosures WHERE ticker = $1 ORDER BY filed_at DESC LIMIT 10',
    [upper]
  );
  const disclosures = disclosuresRes.rows.map((r) => ({ date: r.filed_at, template: r.template }));

  const info = await getCompanyInfo(upper);
  const companyName = info?.cmpyNm ?? upper;
  const { lastPrice, high52w } = info ? await getStockData(info.cmpyId) : { lastPrice: null, high52w: null };
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
