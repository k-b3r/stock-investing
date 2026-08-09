// Server-side only — never import from a client component

export interface NewsArticle {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

export async function getNewsArticles(companyName: string): Promise<NewsArticle[]> {
  try {
    const query = encodeURIComponent(`"${companyName}" Philippines`);
    const url = `https://news.google.com/rss/search?q=${query}&hl=en-PH&gl=PH&ceid=PH:en`;
    const res = await fetch(url, { next: { revalidate: 1800 } });
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
      const link = item.match(/<guid[^>]*>([^<]+)<\/guid>/)?.[1]?.trim() ?? '';
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

    return articles.slice(0, 20);
  } catch {
    return [];
  }
}
