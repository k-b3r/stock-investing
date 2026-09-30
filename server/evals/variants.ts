import { buildDataBlock, type TickerContext } from '../scripts/thesis-context.ts';
import { DEFAULT_ALLOWED, priceBand } from './bands.ts';
import { ALLOWED_OVERRIDES, NUMERIC_FIELDS, type VariantSpec } from './thesis-dataset.ts';
import type { IndexTier, ThesisCase, ThesisExpectations } from './types.ts';

type Meta = Pick<ThesisExpectations, 'kind' | 'base' | 'tier'> & Partial<Pick<ThesisExpectations, 'pair' | 'trap'>>;

// Builds a case from a context: data block, band, allowed verdicts and missing fields all follow from it.
export function buildCase(id: string, frozenAt: string, context: TickerContext, meta: Meta): ThesisCase {
  const band = priceBand(context);
  // Traps can't be bought on: the numbers that would justify it are bogus
  const allowedVerdicts = ALLOWED_OVERRIDES[id] ?? (meta.kind === 'trap' ? ['watch', 'pass'] : DEFAULT_ALLOWED[band]);
  const missingFields = NUMERIC_FIELDS.filter((f) => context[f] === null);
  return {
    id,
    suite: 'thesis',
    frozenAt,
    context,
    dataBlock: buildDataBlock(context),
    expect: { ...meta, band, allowedVerdicts, missingFields },
  };
}

export function realCase(context: TickerContext, tier: IndexTier, frozenAt = new Date().toISOString()): ThesisCase {
  return buildCase(context.ticker.toLowerCase(), frozenAt, context, { kind: 'real', base: null, tier });
}

// Price-dependent ratios scale with price (P/E, P/B, PEG) or against it (dividend yield); the
// underlying EPS, book value and dividend stay the same.
function withPrice(ctx: TickerContext, price: number): TickerContext {
  if (ctx.lastPrice === null) throw new Error(`${ctx.ticker}: no price to shift`);
  const r = price / ctx.lastPrice;
  const scale = (v: number | null, k: number) => (v === null ? null : v * k);
  return {
    ...ctx,
    lastPrice: price,
    pe: scale(ctx.pe, r),
    pb: scale(ctx.pb, r),
    peg: scale(ctx.peg, r),
    dividendYield: scale(ctx.dividendYield, 1 / r),
  };
}

export function deriveVariant(base: ThesisCase, spec: VariantSpec): ThesisCase {
  const ctx = base.context;
  const meta = { base: base.id, tier: base.expect.tier };
  switch (spec.kind) {
    case 'price-shift': {
      if (ctx.mosPrice === null) throw new Error(`${spec.id}: base ${base.id} has no MOS price`);
      // Two decimals, like a real quote
      const price = Math.round(ctx.mosPrice * spec.priceVsMos * 100) / 100;
      return buildCase(spec.id, base.frozenAt, withPrice(ctx, price), { ...meta, kind: 'price-shift', pair: base.id });
    }
    case 'blanked': {
      const fields = spec.fields.includes('stickerPrice') ? [...spec.fields, 'mosPrice' as const] : spec.fields;
      const blanked = { ...ctx, ...Object.fromEntries(fields.map((f) => [f, null])) };
      return buildCase(spec.id, base.frozenAt, blanked, { ...meta, kind: 'blanked' });
    }
    case 'trap':
      return buildCase(spec.id, base.frozenAt, { ...ctx, ...spec.patch }, {
        ...meta,
        kind: 'trap',
        trap: { fields: Object.keys(spec.patch), description: spec.description },
      });
  }
}
