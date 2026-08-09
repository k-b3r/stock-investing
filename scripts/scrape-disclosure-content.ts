import pg from 'pg';
import * as cheerio from 'cheerio';

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/stocks';
const BASE = 'https://edge.pse.com.ph';
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://edge.pse.com.ph/',
};
const DELAY_MS = parseInt(process.env.SCRAPER_REQUEST_DELAY_MS ?? '500');

// Patterns that add no value — entire part matches → discard
const NOISE_PATTERNS = [
  /^-+$/,                                              // "---"
  /^none\.?$/i,                                        // "None."
  /^n\/?a\.?$/i,                                       // "N/A"
  /^(please\s+)?(see|refer\s+to|kindly\s+(see|refer\s+to))\s+(the\s+)?(attached?|attachment)/i,
  /^we\s+(attach|enclose|annex)/i,                     // "We attach herewith..."
  /^please\s+(find|refer)/i,                           // "Please find attached..."
  /^(kindly\s+)?refer\s+to\s+(the\s+)?attached/i,
  /attached?\s+(hereto|herewith)/i,
  /^for\s+(your|reference|more)\s+(reference|information|details)[,.]?\s*please\s+see/i,
];

function isNoise(text: string): boolean {
  return NOISE_PATTERNS.some((re) => re.test(text.trim()));
}

function cleanPart(text: string): string {
  return text
    .replace(/\s+/g, ' ')       // collapse whitespace
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

const pool = new pg.Pool({ connectionString: DB_URL });

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getFileId(disclosureId: string): Promise<string | null> {
  const res = await fetch(`${BASE}/openDiscViewer.do?edge_no=${disclosureId}`, { headers: HEADERS });
  if (!res.ok) return null;
  const html = await res.text();
  return html.match(/file_id=([^&"'\s]+)/)?.[1] ?? null;
}

async function fetchContent(fileId: string): Promise<string | null> {
  const res = await fetch(`${BASE}/downloadHtml.do?file_id=${fileId}`, { headers: HEADERS });
  if (!res.ok) return null;
  const html = await res.text();
  const $ = cheerio.load(html);

  const parts: string[] = [];
  $('p.valText').each((_, el) => {
    const raw = $(el).text().trim();
    if (!raw || raw === '-') return;
    const text = cleanPart(raw);
    if (!isNoise(text)) parts.push(text);
  });

  if (!parts.length) return null;

  const content = parts.join('\n\n').slice(0, 3000);
  return content || null;
}

const { rows } = await pool.query<{ disclosure_id: string }>(
  `SELECT disclosure_id FROM disclosures WHERE content IS NULL ORDER BY filed_at DESC`
);

console.log(`Fetching content for ${rows.length} disclosures...\n`);

let filled = 0;
let skipped = 0;
let failed = 0;

for (const [i, row] of rows.entries()) {
  if ((i + 1) % 100 === 0) {
    process.stdout.write(`[${i + 1}/${rows.length}] filled=${filled} skipped=${skipped} failed=${failed}\n`);
  }

  try {
    const fileId = await getFileId(row.disclosure_id);
    await sleep(DELAY_MS);

    if (!fileId) {
      await pool.query(`UPDATE disclosures SET content = '' WHERE disclosure_id = $1`, [row.disclosure_id]);
      skipped++;
      continue;
    }

    const content = await fetchContent(fileId);
    await sleep(DELAY_MS);

    // '' = attempted but no meaningful content; NULL = not yet attempted
    await pool.query(
      `UPDATE disclosures SET content = $1 WHERE disclosure_id = $2`,
      [content ?? '', row.disclosure_id]
    );

    if (content) filled++;
    else skipped++;
  } catch (e) {
    process.stdout.write(`\nError ${row.disclosure_id}: ${(e as Error).message}\n`);
    failed++;
  }
}

await pool.end();
console.log(`\nDone. ${filled} with content, ${skipped} skipped, ${failed} errors.`);
