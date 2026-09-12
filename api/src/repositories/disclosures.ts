import { getPool } from '../db.js';

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
