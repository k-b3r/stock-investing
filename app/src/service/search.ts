import axios from 'axios';
import { cacheGet, cacheSet } from '@/lib/cache/in-memory-cache';

export interface SearchResult {
  ticker: string;
  companyName: string;
}

const PSE_EDGE_BASE = process.env.PSE_EDGE_BASE_URL ?? 'https://edge.pse.com.ph';
const TTL = 30 * 60 * 1000; // 30 min

interface PseAutocompleteItem {
  symbol: string;
  cname: string;
}

export async function searchCompanies(query: string): Promise<SearchResult[]> {
  if (!query.trim()) return [];

  const cacheKey = `search:${query.toLowerCase()}`;
  const cached = cacheGet<SearchResult[]>(cacheKey);
  if (cached) return cached;

  try {
    const { data } = await axios.get<PseAutocompleteItem[]>(
      `${PSE_EDGE_BASE}/autoComplete/searchCompanyNameSymbol.ax`,
      {
        params: { term: query },
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Referer: 'https://edge.pse.com.ph/',
        },
        timeout: 8000,
      }
    );

    const results: SearchResult[] = (Array.isArray(data) ? data : []).map((item) => ({
      ticker: item.symbol,
      companyName: item.cname,
    }));

    cacheSet(cacheKey, results, TTL);
    return results;
  } catch {
    return [];
  }
}
