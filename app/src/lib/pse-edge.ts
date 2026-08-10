// Server-side only — never import from a client component
import * as cheerio from 'cheerio';

const BASE = 'https://edge.pse.com.ph';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://edge.pse.com.ph/',
};

export interface PseDisclosure {
  templateNm: string;
  date: string;
  formNum: string;
  refNum: string;
  disclosureId: string | null;
  content?: string | null;
}

interface CompanyInfo {
  cmpyId: string;
  cmpyNm: string;
}

async function getCompanyInfo(ticker: string): Promise<CompanyInfo | null> {
  try {
    const res = await fetch(
      `${BASE}/autoComplete/searchCompanyNameSymbol.ax?term=${encodeURIComponent(ticker)}`,
      { headers: HEADERS, next: { revalidate: 86400 } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { cmpyId: string; cmpyNm: string }[];
    const first = data[0];
    return first ? { cmpyId: first.cmpyId, cmpyNm: first.cmpyNm } : null;
  } catch {
    return null;
  }
}

export async function getCompanyName(ticker: string): Promise<string | null> {
  const info = await getCompanyInfo(ticker);
  return info?.cmpyNm ?? null;
}

export interface StockData {
  lastPrice: number | null;
  high52w: number | null;
}

export async function getStockData(ticker: string): Promise<StockData> {
  try {
    const info = await getCompanyInfo(ticker);
    if (!info) return { lastPrice: null, high52w: null };

    const res = await fetch(
      `${BASE}/companyPage/stockData.do?cmpy_id=${info.cmpyId}`,
      { headers: HEADERS, next: { revalidate: 300 } }
    );
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

export async function getDisclosures(ticker: string): Promise<PseDisclosure[]> {
  try {
    const info = await getCompanyInfo(ticker);
    if (!info) return [];

    const res = await fetch(`${BASE}/companyDisclosures/search.ax`, {
      method: 'POST',
      headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ keyword: info.cmpyId, tmplNm: '', pageNo: '1' }),
      cache: 'no-store',
    });
    if (!res.ok) return [];

    const html = await res.text();
    const $ = cheerio.load(html);
    const disclosures: PseDisclosure[] = [];

    $('tbody tr').each((_, row) => {
      const tds = $(row).find('td');
      const templateNm = tds.eq(0).text().trim();
      const date = tds.eq(1).text().trim();
      const formNum = tds.eq(2).text().trim();
      const refNum = tds.eq(3).text().trim();
      const onclick = tds.eq(0).find('a').attr('onclick') ?? '';
      const disclosureId = onclick.match(/openPopup\('([^']+)'\)/)?.[1] ?? null;
      if (templateNm) disclosures.push({ templateNm, date, formNum, refNum, disclosureId });
    });

    return disclosures;
  } catch {
    return [];
  }
}
