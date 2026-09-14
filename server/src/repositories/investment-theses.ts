import { getPool } from '../db';
import type { InvestmentThesisRow } from '../../../shared/types/investment-thesis';

export async function getThesisByTicker(ticker: string): Promise<InvestmentThesisRow | null> {
  const { rows } = await getPool().query<InvestmentThesisRow>(
    `SELECT thesis, verdict, highlights, last_price, sticker_price, mos_price, pe, generated_at
     FROM investment_theses WHERE ticker = $1`,
    [ticker]
  );
  return rows[0] ?? null;
}

export async function upsertInvestmentThesis(
  ticker: string,
  thesis: string,
  verdict: 'buy' | 'watch' | 'pass' | null,
  highlights: string[],
  lastPrice: number | null,
  stickerPrice: number | null,
  mosPrice: number | null,
  pe: number | null
): Promise<void> {
  await getPool().query(
    `INSERT INTO investment_theses (ticker, thesis, verdict, highlights, last_price, sticker_price, mos_price, pe, generated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     ON CONFLICT (ticker) DO UPDATE SET
       thesis = EXCLUDED.thesis,
       verdict = EXCLUDED.verdict,
       highlights = EXCLUDED.highlights,
       last_price = EXCLUDED.last_price,
       sticker_price = EXCLUDED.sticker_price,
       mos_price = EXCLUDED.mos_price,
       pe = EXCLUDED.pe,
       generated_at = now()`,
    [ticker, thesis, verdict, highlights, lastPrice, stickerPrice, mosPrice, pe]
  );
}
