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
