const BASE = 'https://edge.pse.com.ph';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://edge.pse.com.ph/',
};

export interface PseCompanyInfo {
  cmpyId: string;
  cmpyNm: string;
}

export async function getCompanyInfo(ticker: string, init?: RequestInit): Promise<PseCompanyInfo | null> {
  try {
    const res = await fetch(
      `${BASE}/autoComplete/searchCompanyNameSymbol.ax?term=${encodeURIComponent(ticker)}`,
      { ...init, headers: HEADERS }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { cmpyId: string; cmpyNm: string }[];
    const first = data[0];
    return first ? { cmpyId: first.cmpyId, cmpyNm: first.cmpyNm } : null;
  } catch {
    return null;
  }
}

export interface PseStockData {
  lastPrice: number | null;
  high52w: number | null;
}

export async function getStockDataByCmpyId(cmpyId: string, init?: RequestInit): Promise<PseStockData> {
  try {
    const res = await fetch(`${BASE}/companyPage/stockData.do?cmpy_id=${cmpyId}`, { ...init, headers: HEADERS });
    if (!res.ok) return { lastPrice: null, high52w: null };

    const html = await res.text();
    const parseField = (regex: RegExp): number | null => {
      const match = html.match(regex);
      if (!match) return null;
      const value = parseFloat(match[1].replace(/,/g, ''));
      return isNaN(value) ? null : value;
    };

    // "Last Traded Price" is empty when the stock hasn't traded yet today (pre-market,
    // suspended, etc) — fall back to "Previous Close" so we still surface a usable price.
    const lastPrice =
      parseField(/Last Traded Price<\/th>\s*<td[^>]*>\s*([\d,]+(?:\.\d+)?)/) ??
      parseField(/Previous Close and Date<\/th>\s*<td[^>]*>\s*([\d,]+(?:\.\d+)?)/);
    const high52w = parseField(/52-Week High<\/th>\s*<td[^>]*>\s*([\d,]+(?:\.\d+)?)/);

    return { lastPrice, high52w };
  } catch {
    return { lastPrice: null, high52w: null };
  }
}
