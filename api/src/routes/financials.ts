import { Router } from 'express';
import { getPool } from '../db.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const { rows } = await getPool().query(
      `SELECT ticker, performance_id, data, scraped_at::text FROM financials ORDER BY ticker`
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

router.get('/:ticker', async (req, res) => {
  try {
    const { rows } = await getPool().query(
      `SELECT ticker, performance_id, data, scraped_at::text FROM financials WHERE ticker = $1`,
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
