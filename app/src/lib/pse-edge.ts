// Server-side only — never import from a client component

const BASE = 'https://edge.pse.com.ph';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://edge.pse.com.ph/',
};

async function getCmpyId(ticker: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${BASE}/autoComplete/searchCompanyNameSymbol.ax?term=${encodeURIComponent(ticker)}`,
      { headers: HEADERS, next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { cmpyId: string }[];
    return data[0]?.cmpyId ?? null;
  } catch {
    return null;
  }
}

export async function getLastPrice(ticker: string): Promise<number | null> {
  try {
    const cmpyId = await getCmpyId(ticker);
    if (!cmpyId) return null;

    const res = await fetch(
      `${BASE}/companyPage/stockData.do?cmpy_id=${cmpyId}`,
      { headers: HEADERS, next: { revalidate: 300 } }
    );
    if (!res.ok) return null;

    const html = await res.text();
    // HTML: <th>Last Traded Price</th><td style="...">253.00</td>
    const match = html.match(/Last Traded Price<\/th>\s*<td[^>]*>\s*([\d,]+(?:\.\d+)?)/);
    if (!match) return null;

    const price = parseFloat(match[1].replace(/,/g, ''));
    return isNaN(price) ? null : price;
  } catch {
    return null;
  }
}
