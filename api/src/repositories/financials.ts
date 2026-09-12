import { getPool } from '../db';

export async function listFinancials() {
  const { rows } = await getPool().query(
    `SELECT ticker, performance_id, data, scraped_at::text FROM financials ORDER BY ticker`
  );
  return rows;
}

export async function getFinancialByTicker(ticker: string) {
  const { rows } = await getPool().query(
    `SELECT ticker, performance_id, data, scraped_at::text FROM financials WHERE ticker = $1`,
    [ticker]
  );
  return rows[0] ?? null;
}
