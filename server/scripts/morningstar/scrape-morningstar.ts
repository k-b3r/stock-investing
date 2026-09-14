import { refreshCookies, refreshWafCookies, lookupPerformanceId } from './refresh-cookies.ts';
import { getPool } from '../../src/db.ts';
import { getFinancialByTicker, upsertFinancialPerformanceId, upsertFinancial } from '../../src/repositories/financials.ts';

let COOKIE = process.env.MS_COOKIE ?? '';
let WAF_TOKEN = process.env.MS_WAF_TOKEN ?? '';
let token = process.env.MS_TOKEN ?? '';
let realtimeE = process.env.MS_REALTIME_E ?? '';
let salContent = process.env.MS_SAL_CONTENT ?? '';

export function updateTokens(t: { cookie: string; wafToken: string; msToken: string; realtimeE: string; salContent: string }) {
  COOKIE = t.cookie;
  WAF_TOKEN = t.wafToken;
  token = t.msToken;
  realtimeE = t.realtimeE;
  salContent = t.salContent;
}

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';
const HEADERS_LOOKUP = () => ({
  'User-Agent': UA,
  'Accept': 'application/json, text/plain, */*',
  ...(COOKIE ? { 'Cookie': COOKIE } : {}),
  ...(WAF_TOKEN ? { 'x-aws-waf-token': WAF_TOKEN } : {}),
  'Referer': 'https://www.morningstar.com/',
});
const HEADERS_AUTH = () => ({
  'User-Agent': UA,
  'Accept': '*/*',
  'authorization': `Bearer ${token}`,
  'x-api-realtime-e': realtimeE,
  'x-api-requestid': crypto.randomUUID(),
  'x-sal-contenttype': salContent,
  'sec-fetch-dest': 'empty',
  'sec-fetch-mode': 'cors',
  'sec-fetch-site': 'same-site',
  'Referer': 'https://www.morningstar.com/',
});

const BASE = 'https://www.us-api.morningstar.com/sal/sal-service/stock';
const COMMON = { languageId: 'en', locale: 'en', clientId: 'MDC', version: '4.71.0' };

export async function scrapeTicker(ticker: string) {
  const upper = ticker.toUpperCase();
  const lower = ticker.toLowerCase();

  // Use cached performanceID if available
  const cached = await getFinancialByTicker(upper);
  let performanceID = cached?.performance_id ?? null;

  if (!performanceID) {
    let text = '';
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await fetch(`https://www.morningstar.com/api/v2/stocks/xphs/${lower}`, { headers: HEADERS_LOOKUP() });
      text = await res.text();
      if (text.startsWith('<')) {
        console.error(`[${ticker}] Lookup blocked (${res.status}, HTML) — refreshing WAF tokens (attempt ${attempt + 1})...`);
      } else if (res.status >= 400) {
        console.error(`[${ticker}] Lookup ${res.status} — ticker not found on Morningstar`);
        return null;
      } else if (res.status !== 202) {
        break;
      } else {
        console.error(`[${ticker}] Lookup blocked (202) — refreshing WAF tokens (attempt ${attempt + 1})...`);
      }
      const refreshed = await refreshWafCookies();
      COOKIE = refreshed.cookie;
      WAF_TOKEN = refreshed.wafToken;
    }
    if (!text || text.startsWith('<')) {
      console.error(`[${ticker}] API lookup failed — trying Playwright fallback...`);
      performanceID = await lookupPerformanceId(ticker);
      if (!performanceID) {
        console.error(`[${ticker}] Playwright lookup also failed — skipping`);
        return null;
      }
      console.error(`[${ticker}] Got performanceID via Playwright: ${performanceID}`);
    } else {
      const lookup = JSON.parse(text) as { page: { performanceID: string; name: string } };
      performanceID = lookup.page.performanceID;
      console.error(`[${ticker}] ${lookup.page.name}  →  ${performanceID}`);
    }
    // Cache it immediately
    await upsertFinancialPerformanceId(upper, performanceID);
  } else {
    console.error(`[${ticker}] Using cached performanceID: ${performanceID}`);
  }

  async function fetchEndpoint(label: string, path: string, extra: Record<string, string> = {}) {
    const params = new URLSearchParams({ ...COMMON, ...extra });
    const res = await fetch(`${BASE}/${path}/${performanceID}?${params}`, { headers: HEADERS_AUTH() });
    const text = await res.text();
    if (res.ok) return [label, JSON.parse(text)];
    console.error(`  ✗ ${label} (${res.status})`);
    return [label, null];
  }

  const results = await Promise.all([
    fetchEndpoint('keyMetrics.annual',  'keyMetrics/summary',               { reportType: 'A', component: 'sal-eqsv-key-metrics-financial-summary' }),
    fetchEndpoint('growth',             'keyStats/growthTable',             { component: 'sal-eqsv-key-metrics-growth' }),
    fetchEndpoint('profitability',      'keyMetrics/profitabilityAndEfficiency', { component: 'sal-eqsv-key-metrics-profitability-efficiency' }),
    fetchEndpoint('financialHealth',    'keyMetrics/financialHealth',       { component: 'sal-eqsv-key-metrics-financial-health' }),
    fetchEndpoint('cashFlow',           'keyMetrics/cashFlow',              { component: 'sal-eqsv-key-metrics-cash-flow' }),
  ]);

  const output = Object.fromEntries(results);

  await upsertFinancial(upper, performanceID, output);
  console.error(`[${ticker}] Saved`);
  return output;
}

// Run as standalone: pnpm scrape-ms <TICKER>
const isMain = process.argv[1]?.endsWith('scrape-morningstar.ts');
if (isMain) {
  const ticker = process.argv[2] ?? 'TEL';
  const data = await scrapeTicker(ticker);
  await getPool().end();
  if (data) console.log(JSON.stringify(data, null, 2));
}
