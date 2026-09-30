import type { TickerContext } from '../../scripts/thesis-context.ts';
import type { NonError, PlantedError } from './types.ts';

type Unit = '%' | 'x' | '₱';
type FigureField = 'roic' | 'epsGrowth' | 'revenueGrowth' | 'netIncomeGrowth' | 'fcfGrowth' | 'bookValueGrowth' | 'debtEquity' | 'lastPrice' | 'pe' | 'pb' | 'peg' | 'dividendYield' | 'stickerPrice' | 'mosPrice';

// Each data-block figure, its unit and its label/format in buildDataBlock
const FIELDS: { field: FigureField; unit: Unit; label: string; decimals: number }[] = [
  { field: 'roic', unit: '%', label: 'ROIC', decimals: 1 },
  { field: 'epsGrowth', unit: '%', label: 'EPS Growth', decimals: 1 },
  { field: 'revenueGrowth', unit: '%', label: 'Revenue Growth', decimals: 1 },
  { field: 'netIncomeGrowth', unit: '%', label: 'Net Income Growth', decimals: 1 },
  { field: 'fcfGrowth', unit: '%', label: 'FCF Growth', decimals: 1 },
  { field: 'bookValueGrowth', unit: '%', label: 'Book Value Growth', decimals: 1 },
  { field: 'debtEquity', unit: 'x', label: 'Debt/Equity', decimals: 2 },
  { field: 'lastPrice', unit: '₱', label: 'Current Price', decimals: 2 },
  { field: 'pe', unit: 'x', label: 'P/E', decimals: 1 },
  { field: 'pb', unit: 'x', label: 'P/B', decimals: 1 },
  { field: 'peg', unit: 'x', label: 'PEG', decimals: 2 },
  { field: 'dividendYield', unit: '%', label: 'Dividend Yield', decimals: 1 },
  { field: 'stickerPrice', unit: '₱', label: 'Sticker Price', decimals: 2 },
  { field: 'mosPrice', unit: '₱', label: 'MOS Buy Price', decimals: 2 },
];

export interface FigureMention {
  field: FigureField;
  label: string;
  unit: Unit;
  // Value as the data block prints it
  sourceValue: number;
  sourceText: string;
  // Exact matched text in the thesis, e.g. "₱36.80" or "13.4x"
  text: string;
  value: number;
  decimals: number;
  index: number;
}

const FIGURE = /(₱)?(\d[\d,]*(?:\.\d+)?)(%|x\b)?/g;

// Thesis figures that restate exactly one data-block figure (same unit, equal at the thesis's precision).
// A figure matching several fields is ambiguous and skipped.
export function findFigureMentions(thesis: string, ctx: TickerContext): FigureMention[] {
  const mentions: FigureMention[] = [];
  for (const m of thesis.matchAll(FIGURE)) {
    const unit: Unit | null = m[1] ? '₱' : ((m[3] as Unit | undefined) ?? null);
    if (!unit || (m[1] && m[3])) continue;
    const raw = m[2].replace(/,/g, '');
    const value = Number(raw);
    const decimals = raw.includes('.') ? raw.split('.')[1].length : 0;
    const hits = FIELDS.filter((f) => {
      const v = ctx[f.field];
      if (v === null || f.unit !== unit) return false;
      const shown = Number(v.toFixed(f.decimals));
      return Math.abs(Number(shown.toFixed(decimals)) - value) < 1e-9;
    });
    if (hits.length !== 1) continue;
    const f = hits[0];
    const shown = Number(ctx[f.field]!.toFixed(f.decimals));
    mentions.push({ field: f.field, label: f.label, unit, sourceValue: shown, sourceText: formatFigure(shown, unit, f.decimals), text: m[0], value, decimals, index: m.index! });
  }
  return mentions;
}

export function formatFigure(value: number, unit: Unit, decimals: number): string {
  const n = value.toFixed(decimals);
  return unit === '₱' ? `₱${n}` : `${n}${unit}`;
}

// Data-block line holding a field, e.g. "- ROIC: 5.9%" or the Valuation line containing "P/E: 13.4x"
export function sourceLine(dataBlock: string, label: string): string {
  return dataBlock.split('\n').find((l) => l.includes(`${label}:`) || l.includes(`${label} (`))?.trim() ?? '';
}

const replaceAt = (s: string, index: number, from: string, to: string) => s.slice(0, index) + to + s.slice(index + from.length);

export interface Mutation<T> {
  thesis: string;
  record: T;
}

// Mention with a few surrounding words, before and after the replacement, so reviewers can locate it
function mutate(thesis: string, mention: FigureMention, replacement: string) {
  const start = Math.max(0, thesis.lastIndexOf(' ', Math.max(0, mention.index - 25)));
  const endAt = thesis.indexOf(' ', Math.min(thesis.length, mention.index + mention.text.length + 20));
  const end = endAt === -1 ? thesis.length : endAt;
  const mutated = replaceAt(thesis, mention.index, mention.text, replacement);
  const original = thesis.slice(start, end).trim();
  const claim = mutated.slice(start, end + replacement.length - mention.text.length).trim();
  return { mutated, original, claim };
}

// Wrong size: the figure scaled well past the prompt's ~2pp / 2% tolerance (doubled, or halved when large).
export function plantSizeError(thesis: string, dataBlock: string, mention: FigureMention): Mutation<PlantedError> | null {
  if (mention.value === 0) return null;
  const factor = Math.abs(mention.value) >= 50 ? 0.5 : 2;
  const decimals = Math.max(mention.decimals, 1);
  const wrong = formatFigure(mention.value * factor, mention.unit, decimals);
  const { mutated, original, claim } = mutate(thesis, mention, wrong);
  const number = wrong.replace(/[₱%x]/g, '');
  return {
    thesis: mutated,
    record: { type: 'size', original, claim, trueValue: `${mention.label} ${mention.sourceText}`, sourceQuote: sourceLine(dataBlock, mention.label), match: [number] },
  };
}

// USD/PHP mix-up: a peso price restated in US dollars (a ~57x difference).
export function plantCurrencyError(thesis: string, dataBlock: string, mention: FigureMention): Mutation<PlantedError> {
  if (mention.unit !== '₱') throw new Error('currency error needs a peso figure');
  const wrong = mention.text.replace('₱', 'US$');
  const { mutated, original, claim } = mutate(thesis, mention, wrong);
  return {
    thesis: mutated,
    record: { type: 'currency', original, claim, trueValue: `${mention.label} ${mention.sourceText}`, sourceQuote: sourceLine(dataBlock, mention.label), match: ['US$', 'USD', 'dollar'] },
  };
}

// Rounding the prompt says to ignore: one fewer decimal place, only when within 1.5% of the source.
export function roundingNonError(thesis: string, mention: FigureMention): Mutation<NonError> | null {
  if (mention.decimals === 0) return null;
  const rounded = Number(mention.value.toFixed(mention.decimals - 1));
  if (rounded === mention.value || mention.sourceValue === 0) return null;
  if (Math.abs(rounded - mention.sourceValue) / Math.abs(mention.sourceValue) > 0.015) return null;
  const text = formatFigure(rounded, mention.unit, mention.decimals - 1);
  const { mutated, original, claim } = mutate(thesis, mention, text);
  return { thesis: mutated, record: { type: 'rounding', original, text: claim, note: `${mention.label} is ${mention.sourceText} in the source` } };
}
