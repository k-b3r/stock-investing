import type { RawFinancials } from '@/lib/types/financials';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function getFinancials(ticker: string): Promise<RawFinancials | null> {
  const res = await fetch(`${API_URL}/financials/${ticker.toUpperCase()}`, {
    next: { revalidate: 300 },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}

export async function getAllFinancials(): Promise<RawFinancials[]> {
  const res = await fetch(`${API_URL}/financials`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) throw new Error(`API error ${res.status}`);
  return res.json();
}
