import { Router } from 'express';
import { listFinancials, getFinancialByTicker } from '../repositories/financials';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    res.json(await listFinancials());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

router.get('/:ticker', async (req, res) => {
  try {
    const row = await getFinancialByTicker(req.params.ticker.toUpperCase());
    if (!row) return res.status(404).json({ error: 'Not found' });
    res.json(row);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

export default router;
