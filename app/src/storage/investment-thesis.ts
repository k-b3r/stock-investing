const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export interface InvestmentThesis {
  thesis: string;
  verdict: 'buy' | 'watch' | 'pass' | null;
  highlights: string[];
  lastPrice: number | null;
  stickerPrice: number | null;
  mosPrice: number | null;
  pe: number | null;
  generatedAt: string;
}

interface DbInvestmentThesis {
  thesis: string;
  verdict: 'buy' | 'watch' | 'pass' | null;
  highlights: string[] | null;
  last_price: string | null;
  sticker_price: string | null;
  mos_price: string | null;
  pe: string | null;
  generated_at: string;
}

export async function getInvestmentThesis(ticker: string): Promise<InvestmentThesis | null> {
  const res = await fetch(`${API_URL}/investment-theses/${ticker.toUpperCase()}`, {
    next: { revalidate: 1800 },
  });
  if (!res.ok) return null;
  const row = (await res.json()) as DbInvestmentThesis;
  return {
    thesis: row.thesis,
    verdict: row.verdict,
    highlights: row.highlights ?? [],
    lastPrice: row.last_price === null ? null : parseFloat(row.last_price),
    stickerPrice: row.sticker_price === null ? null : parseFloat(row.sticker_price),
    mosPrice: row.mos_price === null ? null : parseFloat(row.mos_price),
    pe: row.pe === null ? null : parseFloat(row.pe),
    generatedAt: row.generated_at,
  };
}
