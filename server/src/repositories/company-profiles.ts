import { getPool } from '../db';

export async function getCompanyProfile(ticker: string) {
  const { rows } = await getPool().query(
    `SELECT description, sector, subsector, incorporation_date, website
     FROM company_profiles WHERE ticker = $1`,
    [ticker]
  );
  return rows[0] ?? null;
}

export interface CompanyProfileUpsert {
  description: string | null;
  sector: string | null;
  subsector: string | null;
  incorporationDate: string | null;
  website: string | null;
}

export async function upsertCompanyProfile(ticker: string, profile: CompanyProfileUpsert): Promise<void> {
  await getPool().query(
    `INSERT INTO company_profiles (ticker, description, sector, subsector, incorporation_date, website, scraped_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (ticker) DO UPDATE SET
       description = EXCLUDED.description,
       sector = EXCLUDED.sector,
       subsector = EXCLUDED.subsector,
       incorporation_date = EXCLUDED.incorporation_date,
       website = EXCLUDED.website,
       scraped_at = now()`,
    [ticker, profile.description, profile.sector, profile.subsector, profile.incorporationDate, profile.website]
  );
}
