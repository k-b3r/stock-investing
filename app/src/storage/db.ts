import pg from 'pg';

let pool: pg.Pool | null = null;

export async function getPool(): Promise<pg.Pool> {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }
  return pool;
}
