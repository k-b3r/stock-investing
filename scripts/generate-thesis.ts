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

import { spawn } from 'child_process';

const INSTRUCTIONS = `You are a Rule #1 (Phil Town) value investor evaluating whether to invest in a
Philippine Stock Exchange (PSE) listed company for a long-term (5-10+ year)
portfolio with moderate risk tolerance.

Judge this company through the Four Ms:
- Meaning: Do you understand the business? Is it within a reasonable circle of competence?
- Moat: Does it have a durable competitive advantage (brand, network effect, switching costs, cost advantage, secret)?
- Management: Signs of honest, competent management with skin in the game?
- Margin of Safety: Is the current price meaningfully below intrinsic value (Sticker Price)?

Using the company data provided via stdin AND your own research (use
WebSearch/WebFetch to check for recent news, competitive developments,
regulatory risk, or analyst sentiment not captured in the provided data),
write a concise investment thesis (3-5 paragraphs) covering:
1. What the business does and whether it's understandable/meaningful
2. Whether it has a durable moat
3. Signs of management quality (or red flags) from disclosures/recent news
4. Valuation verdict: is the current price an attractive entry given the
   margin of safety, and what would you watch for
5. A clear bottom-line: buy, watch, or pass at the current price — and why

Do not hedge excessively. Take a clear position while acknowledging real
risks. Write in plain prose — no headers or bullet lists in the thesis itself.

After the thesis, append exactly this delimited block (do not add anything
after it):

---VERDICT---
<one of: buy, watch, pass — lowercase, nothing else on this line>
---HIGHLIGHTS---
- <first highlight, one line>
- <second highlight, one line>
- <third highlight, one line>`;

function fmt(value: number | null, decimals = 2): string {
  return value === null ? 'N/A' : value.toFixed(decimals);
}

function buildDataBlock(ctx: TickerContext): string {
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

interface ClaudeJsonResult {
  result: string;
  total_cost_usd?: number;
  is_error?: boolean;
}

interface StreamEvent {
  type: string;
  message?: { content?: { type: string; name?: string; input?: unknown; text?: string }[] };
  result?: string;
  total_cost_usd?: number;
  is_error?: boolean;
  num_turns?: number;
}

function logStreamEvent(event: StreamEvent): void {
  if (event.type === 'assistant' && event.message?.content) {
    for (const block of event.message.content) {
      if (block.type === 'tool_use') {
        console.log(`\n    [tool] ${block.name}: ${JSON.stringify(block.input).slice(0, 120)}`);
      } else if (block.type === 'text' && block.text?.trim()) {
        console.log(`\n    [writing] ${block.text.slice(0, 150).replace(/\s+/g, ' ')}...`);
      }
    }
  } else if (event.type === 'result') {
    console.log(`\n    [done] turns: ${event.num_turns ?? '?'}, est. cost: $${(event.total_cost_usd ?? 0).toFixed(4)}`);
  }
}

function runClaude(stdinData: string, promptArg: string, model: string, tools: string, maxBudget: string): Promise<ClaudeJsonResult | null> {
  return new Promise((resolve) => {
    const proc = spawn(
      'claude',
      ['-p', promptArg, '--model', model, '--tools', tools, '--permission-mode', 'bypassPermissions', '--max-budget-usd', maxBudget, '--output-format', 'stream-json', '--verbose', '--no-session-persistence'],
      { stdio: ['pipe', 'pipe', 'inherit'] }
    );

    let buffer = '';
    let finalResult: ClaudeJsonResult | null = null;

    proc.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as StreamEvent;
          logStreamEvent(event);
          if (event.type === 'result') {
            finalResult = { result: event.result ?? '', total_cost_usd: event.total_cost_usd, is_error: event.is_error };
          }
        } catch {
          // partial/non-JSON line — ignore, next chunk will complete it
        }
      }
    });

    proc.stdin.write(stdinData);
    proc.stdin.end();

    proc.on('close', (code) => {
      if (code !== 0 && !finalResult) {
        console.error(`\nclaude exited with status ${code}`);
      }
      resolve(finalResult);
    });

    proc.on('error', (err) => {
      console.error(`\nclaude invocation error: ${err.message}`);
      resolve(null);
    });
  });
}

function sanityCheck(thesis: string, ctx: TickerContext): string | null {
  if (thesis.length < 500) return `too short (${thesis.length} chars)`;
  const mentionsTicker = thesis.toLowerCase().includes(ctx.ticker.toLowerCase());
  const mentionsName = thesis.toLowerCase().includes(ctx.companyName.toLowerCase());
  if (!mentionsTicker && !mentionsName) return 'does not mention ticker or company name';
  if (!/\b(buy|watch|pass)\b/i.test(thesis)) return 'no clear buy/watch/pass verdict found';
  return null;
}

async function upsertThesis(
  ticker: string,
  thesis: string,
  verdict: 'buy' | 'watch' | 'pass' | null,
  highlights: string[],
  lastPrice: number | null,
  stickerPrice: number | null,
  mosPrice: number | null,
  pe: number | null
): Promise<void> {
  await pool.query(
    `INSERT INTO investment_theses (ticker, thesis, verdict, highlights, last_price, sticker_price, mos_price, pe, generated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (ticker) DO UPDATE SET
       thesis = EXCLUDED.thesis,
       verdict = EXCLUDED.verdict,
       highlights = EXCLUDED.highlights,
       last_price = EXCLUDED.last_price,
       sticker_price = EXCLUDED.sticker_price,
       mos_price = EXCLUDED.mos_price,
       pe = EXCLUDED.pe,
       generated_at = now()`,
    [ticker, thesis, verdict, highlights, lastPrice, stickerPrice, mosPrice, pe]
  );
}

async function generateForTicker(ticker: string): Promise<{ ok: boolean; cost: number; reason?: string }> {
  const ctx = await buildTickerContext(ticker);
  if (!ctx) return { ok: false, cost: 0, reason: 'no financials row for ticker' };

  const dataBlock = buildDataBlock(ctx);

  const genResult = await runClaude(dataBlock, INSTRUCTIONS, 'sonnet', 'WebSearch,WebFetch', '0.50');
  if (!genResult || !genResult.result) {
    return { ok: false, cost: genResult?.total_cost_usd ?? 0, reason: 'generation failed or empty result' };
  }
  const rawResult = genResult.result.trim();
  const genCost = genResult.total_cost_usd ?? 0;

  const [thesisPart, blockPart] = rawResult.split('---VERDICT---');
  const thesis = thesisPart.trim();

  let verdict: 'buy' | 'watch' | 'pass' | null = null;
  let highlights: string[] = [];
  if (blockPart) {
    const [verdictSection, highlightsSection] = blockPart.split('---HIGHLIGHTS---');
    const verdictMatch = (verdictSection ?? '').match(/^\s*(buy|watch|pass)\s*$/im);
    verdict = (verdictMatch?.[1].toLowerCase() as 'buy' | 'watch' | 'pass' | undefined) ?? null;
    highlights = (highlightsSection ?? '')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).trim());
  }
  if (!verdict || highlights.length === 0) {
    console.log(`\n    [warn] could not parse verdict/highlights block for ${ctx.ticker} — storing thesis without them`);
  }

  const factCheckPrompt = `Here is the source financial data for ${ctx.ticker}:
${dataBlock}

Here is a generated investment thesis for ${ctx.ticker}:
${thesis}

List any specific numeric claim in the thesis (price, P/E, growth rate, sticker price,
etc.) that contradicts the source data above. Respond with JSON only:
{"contradictions": ["<claim> contradicts <source value>", ...]}
Empty array if none found.`;

  const factCheckResult = await runClaude('', factCheckPrompt, 'haiku', '', '0.10');
  const factCheckCost = factCheckResult?.total_cost_usd ?? 0;
  const totalCost = genCost + factCheckCost;

  if (!factCheckResult || !factCheckResult.result) {
    return { ok: false, cost: totalCost, reason: 'fact-check call failed' };
  }

  let contradictions: string[] = [];
  try {
    const jsonMatch = factCheckResult.result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no JSON object found in response');
    const parsed = JSON.parse(jsonMatch[0]) as { contradictions: string[] };
    contradictions = parsed.contradictions ?? [];
  } catch {
    return { ok: false, cost: totalCost, reason: 'fact-check response was not valid JSON' };
  }

  if (contradictions.length > 0) {
    return { ok: false, cost: totalCost, reason: `contradictions found: ${contradictions.join('; ')}` };
  }

  const sanityIssue = sanityCheck(thesis, ctx);
  if (sanityIssue) {
    return { ok: false, cost: totalCost, reason: `sanity check failed: ${sanityIssue}` };
  }

  await upsertThesis(ctx.ticker, thesis, verdict, highlights, ctx.lastPrice, ctx.stickerPrice, ctx.mosPrice, ctx.pe);
  return { ok: true, cost: totalCost };
}

const PSEI30 = [
  'AC', 'ACEN', 'AEV', 'AGI', 'ALI', 'AREIT', 'BDO', 'BPI', 'CNPF', 'CNVRG',
  'DMC', 'EMI', 'GLO', 'GTCAP', 'ICT', 'JFC', 'JGS', 'LTG', 'MBT', 'MER',
  'MONDE', 'PGOLD', 'PLUS', 'SCC', 'SM', 'SMC', 'SMPH', 'TEL', 'URC',
];

const TICKER_ARG = process.argv[2];
const tickers = TICKER_ARG ? [TICKER_ARG.toUpperCase()] : PSEI30;

console.log(`Generating investment theses for ${tickers.length} ticker(s)...\n`);

let succeeded = 0;
let failed = 0;
let totalCost = 0;

for (const [i, ticker] of tickers.entries()) {
  process.stdout.write(`[${String(i + 1).padStart(2)}/${tickers.length}] ${ticker.padEnd(8)}`);
  const result = await generateForTicker(ticker);
  totalCost += result.cost;
  if (result.ok) {
    console.log(`→ stored (est. cost: $${result.cost.toFixed(4)})`);
    succeeded++;
  } else {
    console.log(`→ FAILED: ${result.reason} (est. cost: $${result.cost.toFixed(4)})`);
    failed++;
  }
}

await pool.end();
console.log(`\nDone. ${succeeded} succeeded, ${failed} failed. Estimated total cost: $${totalCost.toFixed(4)} (informational — billed against your Claude Code subscription, not per-call).`);
