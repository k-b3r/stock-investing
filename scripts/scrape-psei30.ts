import pg from 'pg';
import { scrapeTicker, updateTokens } from './scrape-morningstar.ts';
import { refreshCookies } from './refresh-cookies.ts';

// PSEi 30 — verified via PSE, last updated Aug 2025
const PSEI30 = [
  'AC',     // Ayala Corporation
  'ACEN',   // ACEN Corporation
  'AEV',    // Aboitiz Equity Ventures
  'AGI',    // Alliance Global Group
  'ALI',    // Ayala Land
  'AREIT',  // AREIT Inc.
  'BDO',    // BDO Unibank
  'BPI',    // Bank of the Philippine Islands
  'CNPF',   // Century Pacific Food
  'CNVRG',  // Converge ICT
  'DMC',    // DMCI Holdings
  'EMI',    // Emperador
  'GLO',    // Globe Telecom
  'GTCAP',  // GT Capital Holdings
  'ICT',    // ICTSI
  'JFC',    // Jollibee Foods
  'JGS',    // JG Summit Holdings
  'LTG',    // LT Group
  'MBT',    // Metrobank
  'MER',    // Meralco
  'MONDE',  // Monde Nissin
  'PGOLD',  // Puregold
  'PLUS',   // DigiPlus Interactive
  'SCC',    // Semirara Mining
  'SM',     // SM Investments
  'SMC',    // San Miguel Corporation
  'SMPH',   // SM Prime Holdings
  'TEL',    // PLDT
  'URC',    // Universal Robina
];

// PSE Midcap index — verified via PSE, March 2026
const MIDCAP = [
  'APX',    // Apex Mining
  'AUB',    // Asia United Bank
  'BLOOM',  // Bloomberry Resorts
  'COSCO',  // Cosco Capital
  'DNL',    // D&L Industries
  'GSMI',   // Ginebra San Miguel
  'KEEPR',  // The Keepers Holdings
  'MEG',    // Megaworld
  'MREIT',  // MREIT
  'MWC',    // Manila Water
  'NIKL',   // Nickel Asia
  'OGP',    // OceanaGold Philippines
  'PNB',    // Philippine National Bank
  'RLC',    // Robinsons Land
  'RRHI',   // Robinsons Retail
  'SEVN',   // Philippine Seven
  'SGP',    // Synergy Grid & Development
  'WLCON',  // Wilcon Depot
  // AGI, SECB already in PSEi 30
];

const ALL = [...new Set([...PSEI30, ...MIDCAP])];
const argTickers = process.argv.slice(2);

updateTokens(await refreshCookies());

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

let tickers: string[];
if (argTickers.length) {
  tickers = argTickers;
} else {
  const { rows } = await db.query<{ ticker: string }>(
    `SELECT ticker FROM financials WHERE data != '{}'::jsonb AND data IS NOT NULL`
  );
  const done = new Set(rows.map(r => r.ticker.toUpperCase()));
  tickers = ALL.filter(t => !done.has(t.toUpperCase()));
  console.error(`Skipping ${done.size} already scraped. Remaining: ${tickers.length}`);
}

let ok = 0, fail = 0;
for (const ticker of tickers) {
  try {
    await scrapeTicker(ticker, db);
    ok++;
  } catch (e) {
    console.error(`[${ticker}] Error: ${(e as Error).message}`);
    fail++;
  }
  // delay to avoid WAF rate-limiting on lookup endpoint
  await new Promise(r => setTimeout(r, 3000));
}

await db.end();
console.error(`\nDone: ${ok} saved, ${fail} failed`);
