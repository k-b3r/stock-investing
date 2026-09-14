import type { PseDisclosure } from '@/lib/pse-edge';
import type { DisclosureRow } from '../../../shared/types/disclosure';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function getDisclosures(ticker: string): Promise<PseDisclosure[]> {
  const res = await fetch(`${API_URL}/disclosures/${ticker.toUpperCase()}`, {
    next: { revalidate: 1800 },
  });
  if (!res.ok) return [];
  const rows = (await res.json()) as DisclosureRow[];
  return rows.map((r) => ({
    templateNm: r.template,
    date: r.filed_at,
    formNum: r.form_num ?? '',
    refNum: r.ref_num ?? '',
    disclosureId: r.disclosure_id,
    content: r.content,
  }));
}
