import { getPool } from './db';
import type { RawFinancials } from '@/lib/types/financials';

export async function getFinancials(ticker: string): Promise<RawFinancials | null> {
  const pool = await getPool();
  const { rows } = await pool.query<RawFinancials>(
    `SELECT ticker, performance_id, data, scraped_at::text FROM financials WHERE ticker = $1`,
    [ticker.toUpperCase()]
  );
  return rows[0] ?? null;
}

export async function getAllFinancials(): Promise<RawFinancials[]> {
  const pool = await getPool();
  const { rows } = await pool.query<RawFinancials>(
    `SELECT ticker, performance_id, data, scraped_at::text FROM financials ORDER BY ticker`
  );
  return rows;
}
