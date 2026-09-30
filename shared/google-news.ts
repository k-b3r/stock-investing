export interface NewsArticle {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

export async function getNewsArticles(companyName: string, init?: RequestInit): Promise<NewsArticle[]> {
  return searchGoogleNews(`"${companyName}" Philippines`, init);
}

// Google News RSS search. Supports operators such as before:YYYY-MM-DD. Links are news.google.com redirects (see decodeGoogleNewsLink).
export async function searchGoogleNews(query: string, init?: RequestInit): Promise<NewsArticle[]> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-PH&gl=PH&ceid=PH:en`;
    const res = await fetch(url, { ...init, headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (!res.ok) return [];

    const xml = await res.text();
    const articles: NewsArticle[] = [];
    const itemRegex = /<item>([\s\S]*?)<\/item>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const item = match[1];
      const rawTitle = item.match(/<title>([^<]*)<\/title>/)?.[1] ?? '';
      // strip trailing " - Source Name" from title
      const sourceTag = item.match(/<source[^>]*>([^<]+)<\/source>/)?.[1]?.trim() ?? '';
      const title = sourceTag
        ? rawTitle.replace(new RegExp(` - ${sourceTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`), '').trim()
        : rawTitle.trim();
      const link = item.match(/<link>([^<]+)<\/link>/)?.[1]?.trim() ?? '';
      const pubDate = item.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1]?.trim() ?? '';

      if (title && link) {
        articles.push({
          title: title.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>'),
          link,
          pubDate,
          source: sourceTag,
        });
      }
    }

    return articles;
  } catch {
    return [];
  }
}

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

// Resolves a news.google.com/rss/articles/... link to the publisher URL via the same batchexecute call the
// Google News web app makes. Returns null when Google changes the page or rejects the request.
export async function decodeGoogleNewsLink(link: string): Promise<string | null> {
  try {
    const id = new URL(link).pathname.split('/').pop();
    if (!id) return null;
    const page = await (await fetch(`https://news.google.com/articles/${id}`, { headers: { 'User-Agent': BROWSER_UA } })).text();
    const signature = page.match(/data-n-a-sg="([^"]+)"/)?.[1];
    const timestamp = page.match(/data-n-a-ts="([^"]+)"/)?.[1];
    if (!signature || !timestamp) return null;

    const payload = [
      'garturlreq',
      [['X', 'X', ['X', 'X'], null, null, 1, 1, 'US:en', null, 1, null, null, null, null, null, 0, 1], 'X', 'X', 1, [1, 1, 1], 1, 1, null, 0, 0, null, 0],
      id,
      Number(timestamp),
      signature,
    ];
    const res = await fetch('https://news.google.com/_/DotsSplashUi/data/batchexecute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8', 'User-Agent': BROWSER_UA },
      body: 'f.req=' + encodeURIComponent(JSON.stringify([[['Fbv4je', JSON.stringify(payload), null, 'generic']]])),
    });
    const body = (await res.text()).split('\n\n')[1];
    const url = JSON.parse(JSON.parse(body)[0][2])[1];
    return typeof url === 'string' && url.startsWith('http') ? url : null;
  } catch {
    return null;
  }
}
