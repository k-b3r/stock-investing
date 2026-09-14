export interface InvestmentThesisRow {
  thesis: string;
  verdict: 'buy' | 'watch' | 'pass' | null;
  highlights: string[] | null;
  last_price: string | null;
  sticker_price: string | null;
  mos_price: string | null;
  pe: string | null;
  generated_at: string;
}
