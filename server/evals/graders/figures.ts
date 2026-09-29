import type { TickerContext } from '../../scripts/thesis-context.ts';
import { NUMERIC_FIELDS, type NumericField } from '../thesis-dataset.ts';

export type FigureUnit = 'peso' | 'pct' | 'x' | null;

export interface Figure {
  raw: string;
  // Absolute value; direction words ("fell 5%") carry the sign in prose, so signs aren't compared
  value: number;
  decimals: number;
  unit: FigureUnit;
  index: number;
}

// Optional currency, number, optional unit. Scale words (billion, B) are dropped: only the mantissa is compared.
const FIGURE = /(?<![\w.,/])(₱|PHP ?|Php ?|P(?=\d))?[-−]?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?:\s?(%|percent\b|pp\b|percentage points?\b|x\b|×|times\b)|\s?(?:billion|million|trillion|bn)\b|[BMT]\b)?/g;

// Figures a thesis states as data: currency-prefixed, with a unit, or with decimals. Bare integers
// (years, counts, "3-5 paragraphs") are skipped since they are rarely metric claims.
export function extractFigures(text: string): Figure[] {
  const figures: Figure[] = [];
  for (const m of text.matchAll(FIGURE)) {
    const [raw, currency, whole, frac, unitWord] = m;
    const unit: FigureUnit = currency ? 'peso' : !unitWord ? null : /^(%|percent|pp|percentage)/.test(unitWord) ? 'pct' : 'x';
    if (!currency && !unitWord && frac === undefined) continue;
    figures.push({ raw: raw.trim(), value: Number(`${whole.replaceAll(',', '')}.${frac ?? '0'}`), decimals: frac?.length ?? 0, unit, index: m.index });
  }
  return figures;
}

// Dates are dropped so their parts ("June 28, 2019") can't vouch for a figure like "₱28"
const DATES = /\d{4}-\d{2}-\d{2}|\b(?:January|February|March|April|May|June|July|August|September|October|November|December) \d{1,2}, \d{4}/g;

// Every number in the prompt's data block, plus the raw context values
export function knownNumbers(ctx: TickerContext, dataBlock: string): number[] {
  const fromBlock = [...dataBlock.replace(DATES, '').matchAll(/\d+(?:,\d{3})*(?:\.\d+)?/g)].map((m) => Number(m[0].replaceAll(',', '')));
  const fields = NUMERIC_FIELDS.map((f) => ctx[f]).filter((v): v is number => v !== null);
  return [...fromBlock, ...fields, ...derivedNumbers(ctx)].map(Math.abs);
}

// Figures a model can fairly compute from the data: % gaps between price, Sticker and MOS
// ("19% below Sticker Price") and earnings yield.
function derivedNumbers({ lastPrice, stickerPrice, mosPrice, pe }: TickerContext): number[] {
  const prices = [lastPrice, stickerPrice, mosPrice].filter((p): p is number => p !== null && p > 0);
  const gaps = prices.flatMap((a) => prices.filter((b) => b !== a).map((b) => ((a - b) / b) * 100));
  return pe ? [...gaps, 100 / pe] : gaps;
}

// Entry prices the model proposes ("watch for a pullback toward ₱27", "buy near or below ₱28") are
// its opinion, not a data claim, so the numbers grader skips them.
const TARGET_LEAD = /(?:toward|towards|closer to|near|nearer|below|under|around|approach(?:es|ing)?|(?:drop|fall|pullback|pull back|decline|correction)s? (?:to|toward)|entry(?: price| point)?(?: of| at| near)?|buy(?:ing)? (?:at|below|under|near))(?: or below| or under)?(?: the)?\s*$/i;
export const isPriceTarget = (text: string, figure: Figure) => figure.unit === 'peso' && TARGET_LEAD.test(text.slice(Math.max(0, figure.index - 40), figure.index));

// Same tolerance as the fact-check prompt (~2 percentage points / 2% relative), plus rounding
// to the stated precision ("₱37" for 36.80, "13x" for 13.38).
export function matches(figure: Figure, expected: number): boolean {
  const diff = Math.abs(figure.value - Math.abs(expected));
  const tolerance = Math.max(0.02 * Math.abs(expected), 0.5 * 10 ** -figure.decimals, figure.unit === 'pct' ? 2 : 0);
  return diff <= tolerance + 1e-9;
}

// Unit each field's figures are written in; a figure with another unit isn't that field
// ("trades at 13.4x" is P/E, not the price)
const FIELD_UNITS: Record<NumericField, 'peso' | 'pct' | 'x'> = {
  roic: 'pct',
  epsGrowth: 'pct',
  revenueGrowth: 'pct',
  netIncomeGrowth: 'pct',
  fcfGrowth: 'pct',
  bookValueGrowth: 'pct',
  debtEquity: 'x',
  lastPrice: 'peso',
  pe: 'x',
  pb: 'x',
  peg: 'x',
  dividendYield: 'pct',
  stickerPrice: 'peso',
  mosPrice: 'peso',
};

export const FIELD_LABELS: Record<NumericField, RegExp> = {
  roic: /\broic\b|return on invested capital/,
  epsGrowth: /\beps growth|earnings(?: per share)? growth/,
  revenueGrowth: /revenue growth|sales growth|top[- ]line growth/,
  netIncomeGrowth: /net income growth|profit growth|bottom[- ]line growth/,
  fcfGrowth: /\bfcf growth|free cash flow growth/,
  bookValueGrowth: /book value(?: per share)? growth|\bbvps growth/,
  debtEquity: /debt[- ]to[- ]equity(?: ratio)?|debt\/equity|\bd\/e\b/,
  lastPrice: /(?:current|share|last|stock) price|trad(?:es|ing) at|priced at/,
  pe: /\bp\/e\b|\bpe ratio|price[- ]to[- ]earnings/,
  pb: /\bp\/b\b|\bpb ratio|price[- ]to[- ]book/,
  peg: /\bpeg\b/,
  dividendYield: /dividend yield/,
  stickerPrice: /sticker(?: price)?|fair value|intrinsic value/,
  mosPrice: /\bmos(?: buy)? price|margin[- ]of[- ]safety(?: buy)? price/,
};

// Words allowed between a label and its figure: "P/E ratio of 13.4x", "ROIC (5.9%)", "sticker price is roughly ₱45"
const CONNECTOR = String.raw`(?:[\s:=(~]+|\b(?:of|at|is|was|near|around|about|roughly|approximately|stands|sits|just|only|currently|ratio|an?)\b)*`;
const LABELED = Object.entries(FIELD_LABELS).map(
  ([field, label]) => [field as NumericField, new RegExp(`(?:${label.source})${CONNECTOR}(?=(?:₱|PHP ?|P(?=\\d))?[-−]?\\d)`, 'gi')] as const
);

// Figure start index → field, for figures directly after a field label with a compatible unit
export function labelFigures(text: string, figures: Figure[]): Map<number, NumericField> {
  const byIndex = new Map(figures.map((f) => [f.index, f]));
  const labeled = new Map<number, NumericField>();
  for (const [field, re] of LABELED) {
    for (const m of text.matchAll(re)) {
      const figure = byIndex.get(m.index + m[0].length);
      if (figure && (figure.unit === null || figure.unit === FIELD_UNITS[field])) labeled.set(figure.index, field);
    }
  }
  return labeled;
}
