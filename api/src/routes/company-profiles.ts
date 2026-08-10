import { Router } from 'express';
import { getPool } from '../db.js';

const router = Router();

router.get('/:ticker', async (req, res) => {
  try {
    const { rows } = await getPool().query(
      `SELECT description, sector, subsector, incorporation_date, website
       FROM company_profiles WHERE ticker = $1`,
      [req.params.ticker.toUpperCase()]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

export default router;
