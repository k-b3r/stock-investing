import { computeFuturePeCap, computeStickerPrice, dropEpsOutliers } from '../../shared/valuation.ts';
import { getCompanyInfo, getStockDataByCmpyId } from '../../shared/pse-edge.ts';
import { getNewsArticles } from '../../shared/google-news.ts';
import { getUsdToPhpRate } from '../../shared/fx.ts';
import { getPool } from '../src/db.ts';
import { getFinancialByTicker } from '../src/repositories/financials.ts';
import { getCompanyProfile } from '../src/repositories/company-profiles.ts';
import { listRecentDisclosureTemplates } from '../src/repositories/disclosures.ts';
import { upsertInvestmentThesis } from '../src/repositories/investment-theses.ts';
import { spawn } from 'child_process';
import { THESIS_INSTRUCTIONS } from '../prompts/thesis-instructions.ts';
import { buildFactCheckPrompt } from '../prompts/fact-check.ts';


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

async function generateForTicker(ticker: string): Promise<{ ok: boolean; cost: number; reason?: string }> {
  const ctx = await buildTickerContext(ticker);
  if (!ctx) return { ok: false, cost: 0, reason: 'no financials row for ticker' };

  const dataBlock = buildDataBlock(ctx);

  const genResult = await runClaude(dataBlock, THESIS_INSTRUCTIONS, 'sonnet', 'WebSearch,WebFetch', '0.50');
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

  const factCheckPrompt = buildFactCheckPrompt(ctx.ticker, dataBlock, thesis);

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

  await upsertInvestmentThesis(ctx.ticker, thesis, verdict, highlights, ctx.lastPrice, ctx.stickerPrice, ctx.mosPrice, ctx.pe);
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

await getPool().end();
console.log(`\nDone. ${succeeded} succeeded, ${failed} failed. Estimated total cost: $${totalCost.toFixed(4)} (informational — billed against your Claude Code subscription, not per-call).`);
