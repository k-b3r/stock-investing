import * as cheerio from 'cheerio';

interface SearchCompany {
  cmpyId: string;
  cmpyNm: string;
  symbol: string;
  etfYn: string;
}

interface Disclosure {
  templateNm: string;
  date: string;
  formNum: string;
  refNum: string;
  disclosureId: string | null;
}

const TICKER = process.argv[2] ?? 'SCC';
const BASE = 'https://edge.pse.com.ph';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://edge.pse.com.ph/',
};

async function getCompanyId(ticker: string): Promise<{ cmpyId: string; cmpyNm: string; symbol: string }> {
  const res = await fetch(`${BASE}/autoComplete/searchCompanyNameSymbol.ax?term=${ticker}`, { headers: HEADERS });
  const data = await res.json() as SearchCompany[];
  if (!data.length) throw new Error(`Ticker not found: ${ticker}`);
  return data[0];
}

async function getDisclosures(companyId: string): Promise<{ totalPages: number; disclosures: Disclosure[] }> {
  const res = await fetch(`${BASE}/companyDisclosures/search.ax`, {
    method: 'POST',
    headers: { ...HEADERS, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ keyword: companyId, tmplNm: '', pageNo: '1' }),
  });

  const html = await res.text();
  const $ = cheerio.load(html);

  const pagesText = $('.count').text();
  const totalPages = parseInt(pagesText.match(/\/\s*(\d+)\]/)?.[1] ?? '1');

  const disclosures: Disclosure[] = [];
  $('tbody tr').each((_, row) => {
    const tds = $(row).find('td');
    const templateNm  = tds.eq(0).text().trim();
    const date        = tds.eq(1).text().trim();
    const formNum     = tds.eq(2).text().trim();
    const refNum      = tds.eq(3).text().trim();
    const onclick     = tds.eq(0).find('a').attr('onclick') ?? '';
    const disclosureId = onclick.match(/openPopup\('([^']+)'\)/)?.[1] ?? null;
    if (templateNm) disclosures.push({ templateNm, date, formNum, refNum, disclosureId });
  });

  return { totalPages, disclosures };
}

async function getFileId(disclosureId: string): Promise<string | null> {
  const res = await fetch(`${BASE}/openDiscViewer.do?edge_no=${disclosureId}`, { headers: HEADERS });
  const html = await res.text();
  const $ = cheerio.load(html);
  const src = $('iframe[name="viewContents"]').attr('src') ?? '';
  return new URLSearchParams(src.split('?')[1]).get('file_id');
}

async function getContent(fileId: string): Promise<Record<string, string>> {
  const res = await fetch(`${BASE}/downloadHtml.do?file_id=${fileId}`, { headers: HEADERS });
  const html = await res.text();
  const $ = cheerio.load(html);
  const rows = $('table.type2 tr').toArray();
  const result: Record<string, string> = {};

  for (let i = 0; i < rows.length; i += 2) {
    const th = $(rows[i]).find('th').text().trim();
    const td = $(rows[i + 1])?.find('td p.valText').text().trim();
    if (th && td) {
      const key = th.toLowerCase().replace(/[^a-z0-9]+(.)/g, (_, c: string) => c.toUpperCase());
      result[key] = td;
    }
  }

  return result;
}

try {
  const company = await getCompanyId(TICKER);
  console.log(`Company : ${company.cmpyNm} (${company.symbol})  ID: ${company.cmpyId}\n`);

  const { totalPages, disclosures } = await getDisclosures(company.cmpyId);
  console.log(`Disclosures: page 1 of ${totalPages}  (${disclosures.length} rows)\n`);

  for (const [i, d] of disclosures.entries()) {
    const type = d.templateNm.length > 45 ? d.templateNm.slice(0, 45) + '…' : d.templateNm.padEnd(46);
    console.log(`[${String(i + 1).padStart(2)}] ${d.date}  ${type}  ${d.refNum}`);
  }

  const first = disclosures[0];
  if (!first?.disclosureId) {
    console.log('\nNo disclosures with IDs found.');
    process.exit(0);
  }

  console.log(`\n--- Content of disclosure #1 (ID: ${first.disclosureId}) ---`);
  const fileId = await getFileId(first.disclosureId);
  if (!fileId) { console.log('Could not extract file_id.'); process.exit(0); }

  console.log(`File ID: ${fileId}\n`);
  const content = await getContent(fileId);

  if (!Object.keys(content).length) {
    console.log('(No structured content — template may use a different layout)');
  } else {
    for (const [k, v] of Object.entries(content)) {
      const val = v.length > 120 ? v.slice(0, 120) + '…' : v;
      console.log(`  ${k.padEnd(25)} : ${val}`);
    }
  }
} catch (e) {
  console.error('Error:', (e as Error).message);
  process.exit(1);
}
