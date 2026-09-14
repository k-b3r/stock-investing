import type { CompanyProfileRow } from '../../../shared/types/company-profile';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export interface CompanyProfile {
  description: string | null;
  sector: string | null;
  subsector: string | null;
  incorporationDate: string | null;
  website: string | null;
}

export async function getCompanyProfile(ticker: string): Promise<CompanyProfile | null> {
  const res = await fetch(`${API_URL}/company-profiles/${ticker.toUpperCase()}`, {
    next: { revalidate: 1800 },
  });
  if (!res.ok) return null;
  const row = (await res.json()) as CompanyProfileRow;
  return {
    description: row.description,
    sector: row.sector,
    subsector: row.subsector,
    incorporationDate: row.incorporation_date,
    website: row.website,
  };
}
