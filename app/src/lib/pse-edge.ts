// Server-side only — never import from a client component
import * as cheerio from 'cheerio';
import { getCompanyInfo as sharedGetCompanyInfo, getStockDataByCmpyId } from '../../../shared/pse-edge';

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

function getCompanyInfo(ticker: string) {
  return sharedGetCompanyInfo(ticker, { next: { revalidate: 86400 } });
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
  const info = await getCompanyInfo(ticker);
  if (!info) return { lastPrice: null, high52w: null };
  return getStockDataByCmpyId(info.cmpyId, { next: { revalidate: 300 } });
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
