import { Router } from 'express';
import { listDisclosuresByTicker } from '../repositories/disclosures.js';

const router = Router();

router.get('/:ticker', async (req, res) => {
  try {
    res.json(await listDisclosuresByTicker(req.params.ticker.toUpperCase()));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'DB error' });
  }
});

export default router;
