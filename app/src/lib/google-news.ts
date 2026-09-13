// Server-side only — never import from a client component
import { getNewsArticles as sharedGetNewsArticles, type NewsArticle } from '../../../shared/google-news';

export type { NewsArticle };

export async function getNewsArticles(companyName: string): Promise<NewsArticle[]> {
  const articles = await sharedGetNewsArticles(companyName, { next: { revalidate: 1800 } });
  return articles.slice(0, 20);
}
