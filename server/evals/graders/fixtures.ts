import { readFileSync } from 'fs';
import { casesDir } from '../paths.ts';
import { buildCase } from '../variants.ts';
import type { ThesisCase, ThesisExpectations } from '../types.ts';

const load = (id: string) => JSON.parse(readFileSync(`${casesDir('thesis')}/${id}.json`, 'utf8')) as ThesisCase;

// INV-12 tracer case: AREIT at ₱37.50, between MOS (₱22.60) and Sticker Price (₱45.20)
export const areit = load('areit');

// Copy of a case with context edits; band, allowed verdicts and missing fields are rebuilt like a frozen variant's
export const withContext = (
  base: ThesisCase,
  patch: Partial<ThesisCase['context']>,
  meta: Partial<Pick<ThesisExpectations, 'kind' | 'pair' | 'trap'>> & { id?: string } = {}
): ThesisCase => {
  const { id = base.id, kind = 'real', ...rest } = meta;
  return buildCase(id, base.frozenAt, { ...base.context, ...patch }, { kind, base: kind === 'real' ? null : base.id, tier: base.expect.tier, ...rest });
};

// A clean watch thesis quoting only frozen AREIT figures
export const areitThesis = [
  `AREIT, Inc. is the Ayala Land-sponsored REIT that owns offices, malls, hotels and industrial land, a simple rent-collecting business that is easy to understand. The recent P17.3B share swap for Ayala malls and hotels deepens the portfolio and shows the sponsor keeps feeding assets into the vehicle.`,
  `The moat is the sponsor pipeline and prime Ayala locations. ROIC of 5.9% is modest, typical of a REIT, but revenue growth of 43.1% and EPS growth of 17.5% show the portfolio compounding, and debt/equity of 0.01x leaves the balance sheet nearly unlevered.`,
  `Management keeps raising dividends, and the dividend yield of 6.3% is attractive. At ₱37.50 the stock trades at a P/E of 13.6x, about 17% below the Sticker Price of ₱45.20 but well above the MOS price of ₱22.60, so there is no margin of safety yet. Rising bond yields are the main risk to REIT valuations.`,
  `Bottom line: watch. AREIT is a quality REIT but needs to fall toward ₱22.60 before it is a buy.`,
  `---VERDICT---`,
  `watch`,
  `---HIGHLIGHTS---`,
  `- Trades 66% above the MOS price of ₱22.60`,
  `- Dividend yield of 6.3% with a nearly debt-free balance sheet`,
  `- Sponsor pipeline from Ayala Land drives growth`,
].join('\n\n');
