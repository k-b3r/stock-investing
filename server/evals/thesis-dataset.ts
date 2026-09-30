import type { TickerContext, Verdict } from '../scripts/thesis-context.ts';

// Thesis eval dataset spec. `pnpm eval:freeze` freezes REAL_TICKERS then derives VARIANTS from them.

export const NUMERIC_FIELDS = [
  'roic',
  'epsGrowth',
  'revenueGrowth',
  'netIncomeGrowth',
  'fcfGrowth',
  'bookValueGrowth',
  'debtEquity',
  'lastPrice',
  'pe',
  'pb',
  'peg',
  'dividendYield',
  'stickerPrice',
  'mosPrice',
] as const satisfies readonly (keyof TickerContext)[];
export type NumericField = (typeof NUMERIC_FIELDS)[number];

// Tickers with known real data gaps; always included as missing-data cases
export const REAL_GAP_TICKERS = ['PPC', 'ABS', 'JAS', 'CREIT', 'DDMPR', 'STI'];

// Picked by `pnpm eval:select` (BEL swapped for AREIT to keep INV-12's case), user-approved 2026-09-30
export const REAL_TICKERS: string[] = [
  ...REAL_GAP_TICKERS,
  'AC', 'APX', 'GTCAP', 'JFC', 'BDO', 'OGP', 'PLUS', 'CBC', 'IDC', 'CNVRG', 'MEG', 'DNL', 'AREIT', 'HTI',
];

// Per-case allowed-verdict overrides (default comes from the price band, see bands.ts)
export const ALLOWED_OVERRIDES: Record<string, Verdict[]> = {
  // No Sticker Price (growth rates missing), but 16% ROIC at 5.8x P/E with little debt can fairly justify a buy (user-approved 2026-09-30)
  sti: ['buy', 'watch', 'pass'],
};

export type VariantSpec =
  // Same company, only price changed. `price` is a multiple of the base case's MOS price.
  | { id: string; base: string; kind: 'price-shift'; priceVsMos: number }
  // Fields nulled out (shown as N/A). Blanking stickerPrice also blanks mosPrice.
  | { id: string; base: string; kind: 'blanked'; fields: NumericField[] }
  // Impossible values the model should flag rather than reason from
  | { id: string; base: string; kind: 'trap'; patch: Partial<Record<NumericField, number>>; description: string };

export const VARIANTS: VariantSpec[] = [
  // PLUS is the only real below-MOS ticker; the rest are buy cases made by dropping the price under MOS
  { id: 'plus-above-sticker', base: 'plus', kind: 'price-shift', priceVsMos: 2.4 },
  { id: 'gtcap-below-mos', base: 'gtcap', kind: 'price-shift', priceVsMos: 0.9 },
  { id: 'bdo-below-mos', base: 'bdo', kind: 'price-shift', priceVsMos: 0.9 },
  { id: 'cnvrg-below-mos', base: 'cnvrg', kind: 'price-shift', priceVsMos: 0.95 },

  { id: 'ac-no-sticker', base: 'ac', kind: 'blanked', fields: ['stickerPrice'] },
  { id: 'apx-blanked', base: 'apx', kind: 'blanked', fields: ['roic', 'epsGrowth', 'debtEquity'] },
  { id: 'jfc-blanked', base: 'jfc', kind: 'blanked', fields: ['pe', 'pb', 'peg', 'dividendYield'] },

  {
    id: 'ac-trap-pe',
    base: 'ac',
    kind: 'trap',
    patch: { pe: 0.02 },
    description: 'P/E of 0.02x is impossible for a profitable company at this price (the EPS unit glitch INV-11 fixed)',
  },
  {
    id: 'cbc-trap-roic-de',
    base: 'cbc',
    kind: 'trap',
    patch: { roic: 412, debtEquity: -3.1 },
    description: 'ROIC of 412% is implausible for a bank, and negative Debt/Equity contradicts positive book value growth',
  },
  {
    id: 'meg-trap-sticker',
    base: 'meg',
    kind: 'trap',
    patch: { stickerPrice: 87, mosPrice: 43.5 },
    description: 'Sticker Price is ~40x the current price, inconsistent with the stated EPS growth and P/E, so "below MOS" is not a real buy signal',
  },
];
