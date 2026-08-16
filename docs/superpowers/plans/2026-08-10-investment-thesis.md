# Investment Thesis Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A standalone script (`scripts/generate-thesis.ts`) that generates a Rule #1
value-investor thesis per ticker via two real `claude -p` subprocess calls (generation +
fact-check), validates the output, and stores it in Postgres. First real run targets one
ticker (BDO) only.

**Architecture:** Task 1 builds `buildTickerContext(ticker)` — gathers everything the
prompt needs (DB financials/profile/disclosures, live price/52-week-high, live news,
computed Sticker Price/MOS, USD→PHP conversion where needed) into one object, duplicating
small pure-calc pieces from `app/src/service/*` and `app/src/lib/*` per this codebase's
established scripts-duplicate-not-share convention (scripts/ never imports app/). Task 2
turns that context into the two-pass `claude -p` prompt, invokes the real `claude` binary
via `child_process.spawnSync` (a genuine subprocess call — identical whether the user runs
it or an agent does, since it's just ambient CLI auth, no session-specific state), runs
validation, and upserts into a new `investment_theses` table.

**Tech Stack:** Node/tsx (matches every other `scripts/*.ts`), `pg`, the `claude` CLI
(must be on `PATH`), Postgres.

## Global Constraints

- `claude -p` invoked via `child_process.spawnSync('claude', [...argsArray], { input, encoding: 'utf-8' })`
  — args passed as an array, never a shell string with interpolated data, to avoid any
  injection risk from ticker data (company descriptions, disclosure titles) reaching a
  shell.
- Per-ticker data goes to `claude`'s **stdin**; the fixed Rule #1 persona + Four Ms +
  task instructions go as the **`-p` prompt argument** — matches the idiomatic
  `cat file | claude -p "instructions"` pattern already referenced in this project's own
  `claude-docs/claude-code-notes.md`.
- Pass 1 (generation): `--model sonnet --tools "WebSearch,WebFetch" --permission-mode bypassPermissions --max-budget-usd 0.50 --output-format json --no-session-persistence`.
- Pass 2 (fact-check): `--model haiku --tools "" --permission-mode bypassPermissions --max-budget-usd 0.10 --output-format json --no-session-persistence`.
- **Auth is a Claude Code subscription (Pro/Max), not an API key** — confirmed no
  `ANTHROPIC_API_KEY` is set in this repo's env files, so `claude` uses its own ambient
  login when spawned as a subprocess. `--max-budget-usd`'s help text is worded for
  API-key dollar billing ("Maximum dollar amount to spend on API calls"); under
  subscription auth its actual effect is unverified, so it is not the primary safety
  net — `--tools "WebSearch,WebFetch"` (a small, fixed, read-only tool set) is. The
  script's per-ticker cost output is labeled "estimated cost", not a confirmed charge.
- A thesis is only stored if: both passes' JSON parses cleanly, Pass 2's `contradictions`
  array is empty, and the thesis text passes basic sanity checks (≥500 characters,
  contains the ticker or company name case-insensitively, matches
  `/\b(buy|watch|pass)\b/i`).
- `investment_theses` table: `ticker TEXT PRIMARY KEY, thesis TEXT NOT NULL, generated_at TIMESTAMPTZ NOT NULL DEFAULT now()`,
  upserted with `ON CONFLICT (ticker) DO UPDATE` (matches `company_profiles`' pattern — a
  thesis is a single mutable row per ticker, refreshed on re-run).
- Growth-rate inputs use Morningstar's own pre-computed `tenYearAvg ?? fiveYearAvg ?? threeYearAvg ?? yearOverYear`
  fields directly from `data.growth.dataList`'s most recent annual row — **not** the
  app's own recomputed CAGR (`computeGrowthMetricFromValues` in
  `app/src/service/financials.ts`). This is a deliberate simplification: the script's
  output feeds a qualitative LLM prompt, not a precisely-thresholded UI metric, so
  duplicating ~100 lines of CAGR windowing logic isn't worth it. Book Value Growth and FCF
  Growth still use small duplicated pure calculations (first-to-last CAGR and averaged
  YoY%, respectively — both under 10 lines each) since Morningstar doesn't pre-supply
  those as ready-made fields.
- USD-reporting tickers (6 known: DELM, FOOD, ICT, IMI, ION, OGP — confirmed via
  `data.growth.currency !== 'PHP'`) must have EPS/BVPS/DPS converted to PHP via a live
  USD/PHP rate before computing P/E, P/B, dividend yield, or Sticker Price — **ICT is in
  the default `PSEI30` batch list**, so skipping this would reproduce the exact
  currency-mismatch bug fixed earlier this session (P/E showing 1931x instead of ~32x).
- Follow existing code style: 2-space indent, single quotes, semicolons, no comments
  unless explaining non-obvious "why" (matches every other `scripts/*.ts`).
- No automated tests — matches this project's existing convention that every script in
  `scripts/` has none. Verification is running the script for real against BDO.

---

### Task 1: `buildTickerContext` — data gathering

**Files:**
- Modify: `scripts/schema.sql`
- Create: `scripts/generate-thesis.ts` (this task writes the data-gathering portion only;
  Task 2 appends the generation/validation/storage portion to the same file)

**Interfaces:**
- Produces: `interface TickerContext { ticker: string; companyName: string; sector: string | null; subsector: string | null; description: string | null; roic: number | null; epsGrowth: number | null; revenueGrowth: number | null; netIncomeGrowth: number | null; fcfGrowth: number | null; bookValueGrowth: number | null; debtEquity: number | null; lastPrice: number | null; pe: number | null; pb: number | null; peg: number | null; dividendYield: number | null; stickerPrice: number | null; mosPrice: number | null; disclosures: { date: string; template: string }[]; news: { title: string; source: string }[] }`
  and `async function buildTickerContext(ticker: string): Promise<TickerContext | null>`
  (returns `null` only if the ticker has no row in `financials` — the caller in Task 2
  treats every other individual field as independently nullable, matching this project's
  "never hallucinate, always N/A" convention).

- [ ] **Step 1: Add the `investment_theses` table to the schema file**

Append to `scripts/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS investment_theses (
  ticker        TEXT PRIMARY KEY,
  thesis        TEXT NOT NULL,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 2: Apply the schema change**

Run: `PGPASSWORD=postgres psql -h localhost -U postgres -d stocks -f scripts/schema.sql`
Expected: no errors. Verify: `PGPASSWORD=postgres psql -h localhost -U postgres -d stocks -c "\d investment_theses"`
— expect the 3 columns listed above.

- [ ] **Step 3: Write `scripts/generate-thesis.ts` — data gathering half**

Create `scripts/generate-thesis.ts` with this content (Task 2 will append more to the end
of this same file — do not add a final blank-line-only ending, Task 2's content picks up
directly after):

```typescript
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
```

- [ ] **Step 4: Verify against real BDO data**

Run this ad-hoc check:

```bash
cd /home/kim/Develop/portfolio/main/stock-investing && npx tsx -e '
import { buildTickerContext } from "./scripts/generate-thesis.ts";
buildTickerContext("BDO").then((ctx) => console.log(JSON.stringify(ctx, null, 2)));
'
```

Expected: a populated `TickerContext` object — `companyName: "BDO Unibank, Inc."`,
`sector: "Financials"`, non-null `epsGrowth`/`roic`-or-null-for-banks/`debtEquity`,
non-null `lastPrice`/`stickerPrice`/`mosPrice`, a non-empty `disclosures` array, and a
`news` array (may be empty if Google News has nothing recent — that's fine, not an error).

Also spot-check the currency fix didn't regress by running against ICT:

```bash
cd /home/kim/Develop/portfolio/main/stock-investing && npx tsx -e '
import { buildTickerContext } from "./scripts/generate-thesis.ts";
buildTickerContext("ICT").then((ctx) => console.log({ pe: ctx?.pe, stickerPrice: ctx?.stickerPrice }));
'
```

Expected: `pe` in the ~25-40x range (NOT ~1900x — that would mean the USD conversion is
broken).

- [ ] **Step 5: Commit**

```bash
git add scripts/schema.sql scripts/generate-thesis.ts
git commit -m "add investment_theses table and ticker context data gathering"
```

---

### Task 2: Prompt assembly, claude -p invocation, validation, storage, CLI

**Files:**
- Modify: `scripts/generate-thesis.ts` (append to the file Task 1 created)
- Modify: `package.json` (add an npm script entry)

**Interfaces:**
- Consumes: `TickerContext` and `buildTickerContext(ticker)` from Task 1 (same file, no
  import needed — appended to the same module).
- Produces: the script's CLI entrypoint — no new exports needed by anything else.

- [ ] **Step 1: Append the prompt-building, claude invocation, validation, and storage logic**

Append this to the end of `scripts/generate-thesis.ts` (after Task 1's
`buildTickerContext` function):

```typescript
import { spawnSync } from 'child_process';

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
risks. Write in plain prose — no headers or bullet lists in the thesis itself.`;

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

function runClaude(stdinData: string, promptArg: string, model: string, tools: string, maxBudget: string): ClaudeJsonResult | null {
  const proc = spawnSync(
    'claude',
    ['-p', promptArg, '--model', model, '--tools', tools, '--permission-mode', 'bypassPermissions', '--max-budget-usd', maxBudget, '--output-format', 'json', '--no-session-persistence'],
    { input: stdinData, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 }
  );

  if (proc.error) {
    console.error(`claude invocation error: ${proc.error.message}`);
    return null;
  }
  if (proc.status !== 0) {
    console.error(`claude exited with status ${proc.status}: ${proc.stderr}`);
    return null;
  }

  try {
    return JSON.parse(proc.stdout) as ClaudeJsonResult;
  } catch {
    console.error('failed to parse claude JSON output');
    return null;
  }
}

function sanityCheck(thesis: string, ctx: TickerContext): string | null {
  if (thesis.length < 500) return `too short (${thesis.length} chars)`;
  const mentionsTicker = thesis.toLowerCase().includes(ctx.ticker.toLowerCase());
  const mentionsName = thesis.toLowerCase().includes(ctx.companyName.toLowerCase());
  if (!mentionsTicker && !mentionsName) return 'does not mention ticker or company name';
  if (!/\b(buy|watch|pass)\b/i.test(thesis)) return 'no clear buy/watch/pass verdict found';
  return null;
}

async function upsertThesis(ticker: string, thesis: string): Promise<void> {
  await pool.query(
    `INSERT INTO investment_theses (ticker, thesis, generated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (ticker) DO UPDATE SET thesis = EXCLUDED.thesis, generated_at = now()`,
    [ticker, thesis]
  );
}

async function generateForTicker(ticker: string): Promise<{ ok: boolean; cost: number; reason?: string }> {
  const ctx = await buildTickerContext(ticker);
  if (!ctx) return { ok: false, cost: 0, reason: 'no financials row for ticker' };

  const dataBlock = buildDataBlock(ctx);

  const genResult = runClaude(dataBlock, INSTRUCTIONS, 'sonnet', 'WebSearch,WebFetch', '0.50');
  if (!genResult || !genResult.result) {
    return { ok: false, cost: genResult?.total_cost_usd ?? 0, reason: 'generation failed or empty result' };
  }
  const thesis = genResult.result.trim();
  const genCost = genResult.total_cost_usd ?? 0;

  const factCheckPrompt = `Here is the source financial data for ${ctx.ticker}:
${dataBlock}

Here is a generated investment thesis for ${ctx.ticker}:
${thesis}

List any specific numeric claim in the thesis (price, P/E, growth rate, sticker price,
etc.) that contradicts the source data above. Respond with JSON only:
{"contradictions": ["<claim> contradicts <source value>", ...]}
Empty array if none found.`;

  const factCheckResult = runClaude('', factCheckPrompt, 'haiku', '', '0.10');
  const factCheckCost = factCheckResult?.total_cost_usd ?? 0;
  const totalCost = genCost + factCheckCost;

  if (!factCheckResult || !factCheckResult.result) {
    return { ok: false, cost: totalCost, reason: 'fact-check call failed' };
  }

  let contradictions: string[] = [];
  try {
    const parsed = JSON.parse(factCheckResult.result) as { contradictions: string[] };
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

  await upsertThesis(ctx.ticker, thesis);
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
```

- [ ] **Step 2: Add the npm script entry**

In `package.json`, add this line inside `"scripts"` (alongside the other `tsx --env-file=.env scripts/*.ts` entries):

```json
    "generate-thesis": "tsx --env-file=.env scripts/generate-thesis.ts",
```

- [ ] **Step 3: Confirm `claude` is on PATH before running for real**

Run: `which claude`
Expected: a path is printed. If not found, STOP and report BLOCKED — the rest of this
task requires a real, working `claude` CLI installation; there is no fallback or mock.

- [ ] **Step 4: Run the real single-ticker validation (BDO)**

Run: `pnpm generate-thesis BDO`

This makes real `claude -p` API calls with real cost (bounded by the `$0.50` + `$0.10`
budget caps). Expected: console output showing `[1/1] BDO     → stored (est. cost: $X.XXXX)`
or a `FAILED` line with a specific reason. This is the actual acceptance test for this
whole plan — there is no simulated/mocked version.

If it fails, read the reason and fix the specific problem (e.g. if `claude` isn't
authenticated, that's an environment issue to resolve, not a code bug — do not work around
it by removing the real invocation).

- [ ] **Step 5: Verify the stored thesis**

Run: `PGPASSWORD=postgres psql -h localhost -U postgres -d stocks -c "SELECT ticker, generated_at, left(thesis, 300) FROM investment_theses WHERE ticker = 'BDO'"`

Expected: one row, a recent `generated_at` timestamp, and the first 300 characters of a
real, coherent investment thesis about BDO Unibank — read it and confirm it's actually
about BDO's business (not a generic/empty/off-topic response), mentions its banking
business, and reaches some kind of verdict.

- [ ] **Step 6: Commit**

```bash
git add scripts/generate-thesis.ts package.json
git commit -m "generate and store investment thesis via headless claude -p"
```

## Self-Review Notes

- **Spec coverage:** investor profile / Four Ms persona (Task 2's `INSTRUCTIONS`), all
  data sources (Task 1), prompt template structure (Task 2's `buildDataBlock`), both
  `claude -p` passes with exact flags (Task 2's `runClaude` calls), validation (Task 2's
  `sanityCheck` + contradiction check), storage (Task 1's schema + Task 2's
  `upsertThesis`), single-ticker-first rollout (Task 2 Step 4 runs `BDO` specifically, the
  `PSEI30` batch list exists but isn't the first invocation) — all spec sections covered.
- **Placeholder scan:** no TBD/TODO; every code block is complete and directly usable.
- **Type consistency:** `TickerContext`'s fields are defined once in Task 1 and consumed
  identically by Task 2's `buildDataBlock`, `sanityCheck`, and `generateForTicker` — no
  renamed fields. `buildTickerContext`'s return type (`TickerContext | null`) matches its
  Task 2 call site's `if (!ctx) return ...` null-check exactly.
