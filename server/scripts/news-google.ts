const query = process.argv[2] ?? 'SCC Semirara';
const RSS_URL = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-PH&gl=PH&ceid=PH:en`;

function extractTag(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
  return m ? m[1].trim() : '';
}

function extractItems(xml: string): string[] {
  const items: string[] = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) items.push(m[1]);
  return items;
}

function extractArticleUrl(description: string): string {
  const decoded = description.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  const m = decoded.match(/<a href="([^"]+)"/);
  return m ? m[1] : '';
}

function stripHtml(html: string): string {
  return html
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const res = await fetch(RSS_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });

if (!res.ok) {
  console.error(`Failed: ${res.status} ${res.statusText}`);
  process.exit(1);
}

const xml = await res.text();
const items = extractItems(xml).slice(0, 5);

if (!items.length) { console.log('No items found.'); process.exit(0); }

items.forEach((item, i) => {
  const description = extractTag(item, 'description');
  console.log(`\n[${i + 1}] ${extractTag(item, 'title')}`);
  console.log(`    Source  : ${extractTag(item, 'source')}`);
  console.log(`    Date    : ${extractTag(item, 'pubDate')}`);
  console.log(`    URL     : ${extractArticleUrl(description)}`);
  console.log(`    Snippet : ${stripHtml(description)}`);
});
