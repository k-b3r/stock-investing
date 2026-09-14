import { getPool } from '../db';
import type { RawFinancials } from '../../../shared/types/financials';

export async function listFinancials(): Promise<RawFinancials[]> {
  const { rows } = await getPool().query<RawFinancials>(
    `SELECT ticker, performance_id, data, scraped_at::text FROM financials ORDER BY ticker`
  );
  return rows;
}

export async function getFinancialByTicker(ticker: string): Promise<RawFinancials | null> {
  const { rows } = await getPool().query<RawFinancials>(
    `SELECT ticker, performance_id, data, scraped_at::text FROM financials WHERE ticker = $1`,
    [ticker]
  );
  return rows[0] ?? null;
}

export async function listTickers(): Promise<string[]> {
  const { rows } = await getPool().query<{ ticker: string }>('SELECT ticker FROM financials ORDER BY ticker');
  return rows.map((r) => r.ticker);
}

export async function listTickersWithData(): Promise<string[]> {
  const { rows } = await getPool().query<{ ticker: string }>(
    `SELECT ticker FROM financials WHERE data != '{}'::jsonb AND data IS NOT NULL`
  );
  return rows.map((r) => r.ticker);
}

export async function upsertFinancialPerformanceId(ticker: string, performanceId: string): Promise<void> {
  await getPool().query(
    `INSERT INTO financials (ticker, performance_id, data, scraped_at)
     VALUES ($1, $2, '{}'::jsonb, now())
     ON CONFLICT (ticker) DO UPDATE SET performance_id = $2`,
    [ticker, performanceId]
  );
}

export async function upsertFinancial(ticker: string, performanceId: string, data: unknown): Promise<void> {
  await getPool().query(
    `INSERT INTO financials (ticker, performance_id, data, scraped_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (ticker) DO UPDATE SET performance_id = $2, data = $3, scraped_at = now()`,
    [ticker, performanceId, data]
  );
}
