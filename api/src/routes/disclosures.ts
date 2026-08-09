import { Router } from 'express';
import { getPool } from '../db.js';

const router = Router();

router.get('/:ticker', async (req, res) => {
  try {
    const { rows } = await getPool().query(
      `SELECT disclosure_id, template, filed_at::text, form_num, ref_num,
              NULLIF(content, '') as content
       FROM disclosures
       WHERE ticker = $1
       ORDER BY filed_at DESC`,
      [req.params.ticker.toUpperCase()]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

export default router;
