import { chromium } from 'playwright';
import fs from 'fs';

fs.mkdirSync('data', { recursive: true });

const ENV_FILE = new URL('../../.env', import.meta.url).pathname;

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

let msToken = '';
let realtimeE = '';
let salContent = '';

page.on('request', req => {
  if (!req.url().includes('us-api.morningstar.com')) return;
  const h = req.headers();
  if (h['authorization']?.startsWith('Bearer ')) {
    msToken = h['authorization'].slice(7);
    realtimeE = h['x-api-realtime-e'] ?? realtimeE;
    salContent = h['x-sal-contenttype'] ?? salContent;
  }
});

await page.goto('https://www.morningstar.com/stocks/xphs/tel/key-metrics');
console.log('\nLog in to Morningstar in the browser window.');
console.log('Wait for the page to fully load (charts/tables appear), then press Enter here...');
await new Promise(r => process.stdin.once('data', r));
process.stdin.destroy();

await context.storageState({ path: 'data/ms-auth.json' });
const cookies = await context.cookies('https://www.morningstar.com');
await browser.close();

const cookie = cookies.map(c => `${c.name}=${c.value}`).join('; ');
const wafToken = cookies.find(c => c.name === 'aws-waf-token')?.value ?? '';

console.log('Session saved to data/ms-auth.json');

if (!msToken) {
  console.error('WARNING: No Bearer token captured. Make sure the page fully loaded before pressing Enter.');
  console.error('You may need to run `pnpm refresh-cookies` separately after the WAF cookies are warm.');
} else {
  let env = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  const update = (key: string, val: string) => {
    if (env.includes(`${key}=`)) {
      env = env.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${val}`);
    } else {
      env += `\n${key}=${val}`;
    }
  };
  update('MS_COOKIE', cookie);
  update('MS_WAF_TOKEN', wafToken);
  update('MS_TOKEN', msToken);
  update('MS_REALTIME_E', realtimeE);
  update('MS_SAL_CONTENT', salContent);
  fs.writeFileSync(ENV_FILE, env);
  console.log('Tokens saved to .env. Bearer:', msToken.slice(0, 20) + '...');
}
