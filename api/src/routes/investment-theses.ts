import { Router } from 'express';
import { getThesisByTicker } from '../repositories/investment-theses.js';

const router = Router();

router.get('/:ticker', async (req, res) => {
  try {
    const row = await getThesisByTicker(req.params.ticker.toUpperCase());
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

export default router;
