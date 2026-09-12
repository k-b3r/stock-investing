import { getPool } from '../db';

export async function listDisclosuresByTicker(ticker: string) {
  const { rows } = await getPool().query(
    `SELECT disclosure_id, template, filed_at::text, form_num, ref_num,
            NULLIF(content, '') as content
     FROM disclosures
     WHERE ticker = $1
     ORDER BY filed_at DESC`,
    [ticker]
  );
  return rows;
}

export async function listRecentDisclosureTemplates(ticker: string, limit: number) {
  const { rows } = await getPool().query<{ template: string; filed_at: string }>(
    `SELECT template, filed_at::text FROM disclosures WHERE ticker = $1 ORDER BY filed_at DESC LIMIT $2`,
    [ticker, limit]
  );
  return rows;
}

export interface DisclosureInsert {
  disclosureId: string;
  ticker: string;
  template: string;
  filedAt: string;
  formNum: string | null;
  refNum: string | null;
}

export async function insertDisclosure(d: DisclosureInsert): Promise<number> {
  const result = await getPool().query(
    `INSERT INTO disclosures (disclosure_id, ticker, template, filed_at, form_num, ref_num)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (disclosure_id) DO NOTHING`,
    [d.disclosureId, d.ticker, d.template, d.filedAt, d.formNum, d.refNum]
  );
  return result.rowCount ?? 0;
}

export async function listDisclosureIdsMissingContent(): Promise<string[]> {
  const { rows } = await getPool().query<{ disclosure_id: string }>(
    `SELECT disclosure_id FROM disclosures WHERE content IS NULL ORDER BY filed_at DESC`
  );
  return rows.map((r) => r.disclosure_id);
}

export async function setDisclosureContent(disclosureId: string, content: string): Promise<void> {
  await getPool().query(`UPDATE disclosures SET content = $1 WHERE disclosure_id = $2`, [content, disclosureId]);
}
