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

// Figures a model can fairly compute from the data: gaps and ratios between price, Sticker and MOS
// ("19% below Sticker Price", "78% of fair value", "4.7x the MOS price"), earnings yield, and
// per-share values implied by price and multiples ("EPS of roughly ₱0.64").
function derivedNumbers({ lastPrice, stickerPrice, mosPrice, pe, pb, dividendYield }: TickerContext): number[] {
  const prices = [lastPrice, stickerPrice, mosPrice].filter((p): p is number => p !== null && p > 0);
  const pairs = prices.flatMap((a) => prices.filter((b) => b !== a).map((b) => [a, b]));
  const gaps = pairs.flatMap(([a, b]) => [((a - b) / b) * 100, (a / b) * 100, a / b]);
  const perShare = lastPrice ? [pe && lastPrice / pe, pb && lastPrice / pb, dividendYield && (lastPrice * dividendYield) / 100] : [];
  return [...gaps, ...(pe ? [100 / pe] : []), ...perShare.filter((v): v is number => typeof v === 'number' && v > 0)];
}

// Figures the model proposes rather than quotes are its opinion, not a data claim, so the numbers
// grader skips them: entry prices and scenarios ("pullback toward the low ₱90s", "a buyer at ₱2.30",
// "re-rating toward 0.6x book") and any range endpoint ("₱2.30–2.50", "10-12x"), since the data
// only holds single values.
const TARGET_LEAD = /(?:toward|towards|closer to|near|nearer|below|under|around|into|approach(?:es|ing)?|(?:drop|fall|pullback|pull back|decline|correction|drift)s? (?:to|toward|towards)|entry(?: price| point)?(?: of| at| near)?|buy(?:ing|er)? (?:at|below|under|near)|re-?rat(?:e|es|ing) (?:to|toward|towards)|applying an?|interested (?:in|at))(?: or below| or under)?(?: the)?\s*(?:(?:low|mid|high|upper|lower)(?:-to-(?:low|mid|high|upper))?[- ]?)?$/i;
const RANGE_BEFORE = /\d(?:\.\d+)?s?\s*(?:[–-]|to)\s*(?:(?:low|mid|high|upper|lower)[- ]?)?(?:₱|PHP ?|P)?$/;
const RANGE_AFTER = /^s?\s*(?:[–-]|to\s)\s*(?:₱|PHP ?|P)?\d/;
export function isHypothetical(text: string, figure: Figure): boolean {
  const before = text.slice(Math.max(0, figure.index - 40), figure.index);
  const after = text.slice(figure.index + figure.raw.length);
  const signedRange = /^[-−]/.test(figure.raw) && /\d$/.test(before);
  return TARGET_LEAD.test(before) || RANGE_BEFORE.test(before) || RANGE_AFTER.test(after) || signedRange;
}

// "20%+", "over 20%", "at least ₱40": true when the data value is at or above the figure (within 1.5x, so any
// big number in the data can't vouch for it)
const MIN_BEFORE = /\b(?:over|more than|at least|above|upwards of|in excess of|north of)\s*$/i;
export const isLowerBound = (text: string, figure: Figure) =>
  text[figure.index + figure.raw.length] === '+' || MIN_BEFORE.test(text.slice(Math.max(0, figure.index - 20), figure.index));

// Same tolerance as the fact-check prompt (~2 percentage points / 2% relative), plus rounding
// to the stated precision ("₱37" for 36.80, "13x" for 13.38).
export function matches(figure: Figure, expected: number, atLeast = false): boolean {
  const diff = Math.abs(figure.value - Math.abs(expected));
  const tolerance = Math.max(0.02 * Math.abs(expected), 0.5 * 10 ** -figure.decimals, figure.unit === 'pct' ? 2 : 0);
  const abs = Math.abs(expected);
  return (atLeast && abs >= figure.value && abs <= figure.value * 1.5) || diff <= tolerance + 1e-9;
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
  // Not bare "earnings growth": models use it for a single year's net income ("earnings growth (6% in 2025)")
  epsGrowth: /\beps growth|earnings per share growth/,
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
  // Not "fair/intrinsic value": models use those loosely ("trades at intrinsic value (₱1.42 vs ₱1.50 sticker)")
  stickerPrice: /sticker(?: price)?/,
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
