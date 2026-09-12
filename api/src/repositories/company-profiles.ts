import { getPool } from '../db';

export async function getCompanyProfile(ticker: string) {
  const { rows } = await getPool().query(
    `SELECT description, sector, subsector, incorporation_date, website
     FROM company_profiles WHERE ticker = $1`,
    [ticker]
  );
  return rows[0] ?? null;
}
