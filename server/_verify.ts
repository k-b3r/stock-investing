import * as cheerio from 'cheerio';
import { readFile, writeFile } from 'fs/promises';
import { containsAnswer } from './evals/graders/research.ts';
import { fetchPageText, searchWeb } from './scripts/research-fetcher.ts';
import type { ResearchQuestion } from './evals/types.ts';
const H = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36', Referer: 'https://edge.pse.com.ph/' };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function liveFiling(id: string): Promise<string | null> {
  const v = await (await fetch(`https://edge.pse.com.ph/openDiscViewer.do?edge_no=${id}`, { headers: H })).text();
  const fileId = v.match(/file_id=([^&"'\s]+)/)?.[1];
  if (!fileId) return null;
  const $ = cheerio.load(await (await fetch(`https://edge.pse.com.ph/downloadHtml.do?file_id=${fileId}`, { headers: H })).text());
  return $('body').text().replace(/\s+/g, ' ');
}
const Q = JSON.parse(await readFile('evals/research/questions.json', 'utf8')) as ResearchQuestion[];
const out: Record<string, unknown> = {};
for (const q of Q) {
  const r: { primary: { url: string; ok: boolean; quote: string }[]; news: { url: string; source: string; date: string | null; title: string }[] } = { primary: [], news: [] };
  if (q.answer.kind !== 'not_found') {
    for (const id of q.answerDocs) {
      const t = await liveFiling(id).catch(() => null);
      const ok = !!t && containsAnswer(t, q.answer);
      r.primary.push({ url: `https://edge.pse.com.ph/openDiscViewer.do?edge_no=${id}`, ok, quote: t ? t.slice(0, 300) : 'FETCH FAILED' });
      await sleep(500);
    }
    for (const url of q.answerUrls) {
      const p = await fetchPageText(url);
      r.primary.push({ url, ok: !!p && containsAnswer(`${p.title}\n${p.text}`, q.answer), quote: p?.text.slice(0, 300) ?? 'FETCH FAILED' });
    }
    const queries = [...q.search, `${q.company.split(',')[0]} ${q.question.replace(/\?$/, '').split(' ').slice(-6).join(' ')}`];
    for (const query of queries) {
      for (const d of await searchWeb(query, { limit: 6, companyDomains: q.companyDomains, delayMs: 300 })) {
        if (d.sourceType === 'aggregator' || d.url.includes('edge.pse.com.ph')) continue;
        if (containsAnswer(`${d.title}\n${d.text}`, q.answer) && !r.news.some((n) => n.url === d.url)) r.news.push({ url: d.url, source: d.source, date: d.publishedAt, title: d.title });
      }
    }
  }
  out[q.id] = r;
  console.log(q.id.padEnd(30), 'primary', r.primary.map((p) => (p.ok ? 'OK' : 'NO')).join(','), 'news', r.news.length);
  await writeFile(process.argv[2], JSON.stringify(out, null, 2));
}
