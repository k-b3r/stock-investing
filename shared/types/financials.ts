export interface RawFinancials {
  ticker: string;
  performance_id: string | null;
  data: Record<string, unknown>;
  scraped_at: string;
}
