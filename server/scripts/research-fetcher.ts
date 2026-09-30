import * as cheerio from 'cheerio';
import { BASE as PSE_EDGE_BASE } from '../../shared/pse-edge.ts';
import { decodeGoogleNewsLink, searchGoogleNews } from '../../shared/google-news.ts';
import type { DisclosureContentRow } from '../src/repositories/disclosures.ts';

// Fetches documents for research questions: web search (Google News) and PSE Edge filings (DB).
// Used to freeze the research eval bundles; meant to be reused for thesis generation, so models read
// pre-fetched documents instead of searching live.

// primary = the company's own filing or site; aggregator = market-data sites; news = press coverage
export type SourceType = 'primary' | 'aggregator' | 'news';

export interface FetchedDoc {
  title: string;
  source: string;
  url: string;
  publishedAt: string | null; // YYYY-MM-DD
  sourceType: SourceType;
  text: string;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const MAX_TEXT = 2500;

const AGGREGATOR_DOMAINS = [
  'tradingview.com', 'marketscreener.com', 'investing.com', 'stockanalysis.com', 'simplywall.st', 'finance.yahoo.com',
  'morningstar.com', 'marketwatch.com', 'wsj.com', 'ft.com', 'investagrams.com', 'pesobility.com', 'dividends.ph',
  'marketbeat.com', 'macrotrends.net', 'companiesmarketcap.com',
];

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
};

const onDomain = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

// PSE Edge and the company's own domains are primary; known market-data sites are aggregators; the rest is news.
export function classifySource(url: string, companyDomains: string[] = []): SourceType {
  const host = hostOf(url);
  if (onDomain(host, 'edge.pse.com.ph') || companyDomains.some((d) => onDomain(host, d))) return 'primary';
  if (AGGREGATOR_DOMAINS.some((d) => onDomain(host, d))) return 'aggregator';
  return 'news';
}

export const disclosureUrl = (disclosureId: string) => `${PSE_EDGE_BASE}/openDiscViewer.do?edge_no=${disclosureId}`;

export function disclosureToDoc(row: DisclosureContentRow): FetchedDoc {
  return {
    title: `${row.ticker}: ${row.template}`,
    source: 'PSE Edge',
    url: disclosureUrl(row.disclosure_id),
    publishedAt: row.filed_at,
    sourceType: 'primary',
    text: row.content.slice(0, MAX_TEXT),
  };
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// Readable text of an article page: paragraphs inside <article> (else <body>), falling back to the meta description.
export async function fetchPageText(url: string): Promise<{ title: string; text: string } | null> {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) });
    if (!res.ok || !(res.headers.get('content-type') ?? '').includes('html')) return null;
    const $ = cheerio.load(await res.text());
    $('script, style, nav, header, footer, aside, noscript, form').remove();
    const title = clean($('meta[property="og:title"]').attr('content') ?? $('title').text());
    const root = $('article').length ? $('article').first() : $('body');
    const paragraphs = root.find('p, li, h2, h3, td').map((_, el) => clean($(el).text())).get().filter((t) => t.length > 40);
    const description = clean($('meta[name="description"]').attr('content') ?? $('meta[property="og:description"]').attr('content') ?? '');
    const text = [...new Set(paragraphs)].join('\n') || description;
    return { title, text: text.slice(0, MAX_TEXT) };
  } catch {
    return null;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const nextDay = (date: string) => new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

export interface SearchOptions {
  before?: string; // YYYY-MM-DD, inclusive; drops later articles
  limit?: number;
  companyDomains?: string[];
  delayMs?: number; // between article fetches
}

// Google News search → publisher pages. A page that cannot be decoded or fetched keeps the headline as its text.
export async function searchWeb(query: string, opts: SearchOptions = {}): Promise<FetchedDoc[]> {
  const { before, limit = 3, companyDomains = [], delayMs = 500 } = opts;
  const hits = await searchGoogleNews(before ? `${query} before:${nextDay(before)}` : query);
  const docs: FetchedDoc[] = [];
  for (const hit of hits) {
    if (docs.length >= limit) break;
    const publishedAt = hit.pubDate ? new Date(hit.pubDate).toISOString().slice(0, 10) : null;
    if (before && (!publishedAt || publishedAt > before)) continue;

    const url = (await decodeGoogleNewsLink(hit.link)) ?? hit.link;
    const page = url === hit.link ? null : await fetchPageText(url);
    docs.push({
      title: hit.title,
      source: hit.source || hostOf(url),
      url,
      publishedAt,
      sourceType: classifySource(url, companyDomains),
      text: page && page.text.length > hit.title.length ? page.text : hit.title,
    });
    await sleep(delayMs);
  }
  return docs;
}
