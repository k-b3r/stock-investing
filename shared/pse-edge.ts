export const BASE = 'https://edge.pse.com.ph';
export const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://edge.pse.com.ph/',
};

export interface PseCompanySearchResult {
  cmpyId: string;
  cmpyNm: string;
  symbol: string;
  etfYn: string;
}

export async function searchCompanies(term: string, init?: RequestInit): Promise<PseCompanySearchResult[]> {
  try {
    const res = await fetch(
      `${BASE}/autoComplete/searchCompanyNameSymbol.ax?term=${encodeURIComponent(term)}`,
      { ...init, headers: HEADERS }
    );
    if (!res.ok) return [];
    return (await res.json()) as PseCompanySearchResult[];
  } catch {
    return [];
  }
}

export interface PseCompanyInfo {
  cmpyId: string;
  cmpyNm: string;
}

export async function getCompanyInfo(ticker: string, init?: RequestInit): Promise<PseCompanyInfo | null> {
  const results = await searchCompanies(ticker, init);
  const first = results[0];
  return first ? { cmpyId: first.cmpyId, cmpyNm: first.cmpyNm } : null;
}

export interface PseDisclosureRow {
  templateNm: string;
  date: string;
  formNum: string;
  refNum: string;
  disclosureId: string | null;
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
