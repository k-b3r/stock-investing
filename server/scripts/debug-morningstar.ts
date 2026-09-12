// Manual probe for the Morningstar keyMetrics endpoint — usage:
//   pnpm --dir server exec tsx --env-file=../.env scripts/debug-morningstar.ts <performanceId>
// Pull fresh MS_TOKEN / MS_REALTIME_E / MS_SAL_CONTENT into .env from DevTools ("Copy as fetch")
// before running — these expire ~1hr (see .env.example).
const performanceId = process.argv[2] ?? '0P0000EDRJ';

const token = process.env.MS_TOKEN ?? '';
const realtimeE = process.env.MS_REALTIME_E ?? '';
const salContent = process.env.MS_SAL_CONTENT ?? '';

if (!token || !realtimeE || !salContent) {
  console.error('Missing MS_TOKEN / MS_REALTIME_E / MS_SAL_CONTENT — grab fresh values from DevTools and set them in .env');
  process.exit(1);
}

const res = await fetch(
  `https://www.us-api.morningstar.com/sal/sal-service/stock/keyMetrics/summary/${performanceId}?reportType=A&languageId=en&locale=en&clientId=MDC&component=sal-eqsv-key-metrics-financial-summary&version=4.71.0`,
  {
    headers: {
      'accept': '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'authorization': `Bearer ${token}`,
      'sec-fetch-dest': 'empty',
      'sec-fetch-mode': 'cors',
      'sec-fetch-site': 'same-site',
      'x-api-realtime-e': realtimeE,
      'x-api-requestid': crypto.randomUUID(),
      'x-sal-contenttype': salContent,
      'Referer': 'https://www.morningstar.com/',
    },
    method: 'GET',
  }
);

console.log(`Status: ${res.status}`);
const text = await res.text();
console.log(text.slice(0, 500));
