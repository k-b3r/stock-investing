import { getPool } from '../db.js';

export async function getThesisByTicker(ticker: string) {
  const { rows } = await getPool().query(
    `SELECT thesis, verdict, highlights, last_price, sticker_price, mos_price, pe, generated_at
     FROM investment_theses WHERE ticker = $1`,
    [ticker]
  );
  return rows[0] ?? null;
}
