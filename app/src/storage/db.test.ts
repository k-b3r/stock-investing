import { describe, it, expect, afterAll } from 'vitest';
import { getPool } from './db';

describe('db', () => {
  afterAll(async () => {
    await (await getPool()).end();
  });

  it('connects to Postgres and returns a result', async () => {
    const pool = await getPool();
    const result = await pool.query<{ one: number }>('SELECT 1 AS one');
    expect(result.rows[0].one).toBe(1);
  });

  it('returns empty rows for unknown ticker', async () => {
    const pool = await getPool();
    const result = await pool.query(
      'SELECT * FROM financials WHERE ticker = $1',
      ['DOESNOTEXIST']
    );
    expect(result.rows).toHaveLength(0);
  });
});
