import express from 'express';
import financialsRouter from './routes/financials.js';
import disclosuresRouter from './routes/disclosures.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(express.json());
app.use('/financials', financialsRouter);
app.use('/disclosures', disclosuresRouter);

app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`API listening on :${PORT}`);
});
