CREATE TABLE IF NOT EXISTS financials (
  ticker      TEXT PRIMARY KEY,
  data        JSONB NOT NULL,
  scraped_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS disclosures (
  disclosure_id TEXT PRIMARY KEY,
  ticker        TEXT NOT NULL,
  template      TEXT NOT NULL,
  filed_at      DATE NOT NULL,
  form_num      TEXT,
  ref_num       TEXT,
  content       TEXT,
  scraped_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS disclosures_ticker_filed_idx ON disclosures (ticker, filed_at DESC);

CREATE TABLE IF NOT EXISTS company_profiles (
  ticker              TEXT PRIMARY KEY,
  description         TEXT,
  sector              TEXT,
  subsector           TEXT,
  incorporation_date  TEXT,
  website             TEXT,
  scraped_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS investment_theses (
  ticker        TEXT PRIMARY KEY,
  thesis        TEXT NOT NULL,
  generated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE investment_theses ADD COLUMN IF NOT EXISTS verdict TEXT;
ALTER TABLE investment_theses ADD COLUMN IF NOT EXISTS highlights TEXT[];
ALTER TABLE investment_theses ADD COLUMN IF NOT EXISTS last_price NUMERIC;
ALTER TABLE investment_theses ADD COLUMN IF NOT EXISTS sticker_price NUMERIC;
ALTER TABLE investment_theses ADD COLUMN IF NOT EXISTS mos_price NUMERIC;
ALTER TABLE investment_theses ADD COLUMN IF NOT EXISTS pe NUMERIC;
