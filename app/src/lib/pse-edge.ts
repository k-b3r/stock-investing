// Server-side only — never import from a client component
import * as cheerio from 'cheerio';
import {
  getCompanyInfo as sharedGetCompanyInfo,
  getStockDataByCmpyId,
  BASE,
  HEADERS,
  type PseDisclosureRow,
  type PseStockData,
} from '../../../shared/pse-edge';

export interface PseDisclosure extends PseDisclosureRow {
  content?: string | null;
}

export type StockData = PseStockData;

function getCompanyInfo(ticker: string) {
  return sharedGetCompanyInfo(ticker, { next: { revalidate: 86400 } });
}

export async function getCompanyName(ticker: string): Promise<string | null> {
  const info = await getCompanyInfo(ticker);
  return info?.cmpyNm ?? null;
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
