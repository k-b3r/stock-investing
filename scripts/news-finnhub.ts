interface FinnhubArticle {
  headline: string;
  source: string;
  datetime: number;
  summary: string;
  url: string;
}

const API_KEY = process.env.FINNHUB_API_KEY;
if (!API_KEY) {
  console.error('Missing FINNHUB_API_KEY env var');
  process.exit(1);
}

const SYMBOL = process.argv[2] ?? 'SCC';

function toYMD(date: Date): string {
  return date.toISOString().slice(0, 10);
}

const to = toYMD(new Date());
const from = toYMD(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

const url = `https://finnhub.io/api/v1/company-news?symbol=${SYMBOL}&from=${from}&to=${to}&token=${API_KEY}`;
const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });

if (!res.ok) {
  console.error(`Finnhub error: ${res.status} ${res.statusText}`);
  process.exit(1);
}

const articles = await res.json() as FinnhubArticle[];

if (!Array.isArray(articles) || articles.length === 0) {
  console.log(`No news found for ${SYMBOL} in the last 30 days.`);
  process.exit(0);
}

articles.slice(0, 5).forEach((a, i) => {
  const date = new Date(a.datetime * 1000).toUTCString();
  console.log(`\n[${i + 1}] ${a.headline}`);
  console.log(`    Source  : ${a.source}`);
  console.log(`    Date    : ${date}`);
  console.log(`    Summary : ${a.summary?.slice(0, 200) ?? 'N/A'}`);
  console.log(`    URL     : ${a.url}`);
});
