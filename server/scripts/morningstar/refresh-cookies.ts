import { chromium } from 'playwright';
import fs from 'fs';

const ENV_FILE = new URL('../../.env', import.meta.url).pathname;
const AUTH_FILE = new URL('../../data/ms-auth.json', import.meta.url).pathname;

export interface MorningstarTokens {
  cookie: string;
  wafToken: string;
  msToken: string;
  realtimeE: string;
  salContent: string;
}

export async function refreshWafCookies(): Promise<Pick<MorningstarTokens, 'cookie' | 'wafToken'>> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://www.morningstar.com/stocks/xphs/tel', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForTimeout(3000);

  const cookies = await context.cookies('https://www.morningstar.com');
  await browser.close();

  const cookie = cookies.map(c => `${c.name}=${c.value}`).join('; ');
  const wafToken = cookies.find(c => c.name === 'aws-waf-token')?.value ?? '';

  if (!wafToken) throw new Error('No aws-waf-token found');
  return { cookie, wafToken };
}

async function refreshBearerTokens(): Promise<Pick<MorningstarTokens, 'msToken' | 'realtimeE' | 'salContent'>> {
  if (!fs.existsSync(AUTH_FILE)) {
    throw new Error('No saved session found — run `pnpm login-morningstar` first');
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: AUTH_FILE });

  let msToken = '';
  let realtimeE = '';
  let salContent = '';

  const page = await context.newPage();
  page.on('request', req => {
    if (!req.url().includes('us-api.morningstar.com')) return;
    const h = req.headers();
    if (h['authorization']?.startsWith('Bearer ')) {
      msToken = h['authorization'].slice(7);
      realtimeE = h['x-api-realtime-e'] ?? realtimeE;
      salContent = h['x-sal-contenttype'] ?? salContent;
    }
  });

  await page.goto('https://www.morningstar.com/stocks/xphs/tel/key-metrics', {
    waitUntil: 'networkidle',
  });
  await browser.close();

  if (!msToken) throw new Error('No Bearer token captured — session may have expired, re-run `pnpm login-morningstar`');
  return { msToken, realtimeE, salContent };
}

export async function lookupPerformanceId(ticker: string): Promise<string | null> {
  if (!fs.existsSync(AUTH_FILE)) {
    throw new Error('No saved session found — run `pnpm login-morningstar` first');
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const context = await browser.newContext({
    storageState: AUTH_FILE,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });

  // Inject WAF cookies from env so headless browser bypasses the challenge page
  const envCookie = process.env.MS_COOKIE ?? '';
  const wafCookies = envCookie.split(';')
    .map(s => s.trim())
    .filter(s => s.includes('='))
    .map(s => {
      const [name, ...rest] = s.split('=');
      return { name: name.trim(), value: rest.join('=').trim(), domain: '.morningstar.com', path: '/' };
    });
  if (wafCookies.length) await context.addCookies(wafCookies);

  let performanceId: string | null = null;

  const page = await context.newPage();
  page.on('request', req => {
    const url = req.url();
    if (!url.includes('us-api.morningstar.com')) return;
    const match = url.match(/\/(0P[A-Z0-9]+)/);
    if (match) performanceId = match[1];
  });

  await page.goto(`https://www.morningstar.com/stocks/xphs/${ticker.toLowerCase()}/key-metrics`, {
    waitUntil: 'networkidle',
  });

  // Fallback: extract from __NEXT_DATA__ if no request was intercepted
  if (!performanceId) {
    try {
      const html = await page.content();
      const match = html.match(/"performanceId"\s*:\s*"(0P[A-Z0-9]+)"/);
      if (match) performanceId = match[1];
    } catch { /* ignore */ }
  }

  await browser.close();

  return performanceId;
}

export async function refreshCookies(): Promise<MorningstarTokens> {
  console.error('Refreshing Morningstar tokens...');
  const existingBearer = {
    msToken: process.env.MS_TOKEN ?? '',
    realtimeE: process.env.MS_REALTIME_E ?? '',
    salContent: process.env.MS_SAL_CONTENT ?? '',
  };
  const [waf, bearer] = await Promise.all([
    refreshWafCookies(),
    existingBearer.msToken ? Promise.resolve(existingBearer) : refreshBearerTokens(),
  ]);
  const tokens = { ...waf, ...bearer };

  let env = fs.readFileSync(ENV_FILE, 'utf8');
  const update = (key: string, val: string) => {
    if (env.includes(`${key}=`)) {
      env = env.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${val}`);
    } else {
      env += `\n${key}=${val}`;
    }
  };
  update('MS_COOKIE', tokens.cookie);
  update('MS_WAF_TOKEN', tokens.wafToken);
  update('MS_TOKEN', tokens.msToken);
  update('MS_REALTIME_E', tokens.realtimeE);
  update('MS_SAL_CONTENT', tokens.salContent);
  fs.writeFileSync(ENV_FILE, env);

  console.error('Tokens refreshed. Bearer:', tokens.msToken.slice(0, 20) + '...');
  return tokens;
}

const isMain = process.argv[1]?.endsWith('refresh-cookies.ts');
if (isMain) {
  await refreshCookies();
}
