import type { SourceType } from '../../scripts/research-fetcher.ts';
import type { GradeResult } from '../types.ts';

export type { SourceType };

export type ResearchCategory = 'dividends' | 'financials' | 'officers' | 'stakes' | 'events';

// What a correct answer must contain. Amounts are in base units (3.2e9 for "P3.2 billion", 0.62 for "Php0.62/share").
export type AnswerKey =
  | { kind: 'amount'; value: number; tolerance?: number } // relative, default 0.005
  | { kind: 'percent'; value: number; tolerance?: number } // percentage points, default 0.05
  | { kind: 'date'; value: string } // YYYY-MM-DD
  | { kind: 'text'; accept: string[] } // any alias, case/punctuation-insensitive
  | { kind: 'not_found' };

// Why a doc is in the bundle. Hidden from models; used by the review sheet and analysis.
export type DocRole = 'answer' | 'conflict' | 'stale' | 'noise' | 'search';

export interface ResearchDoc {
  id: string; // d1..dN, shuffled so position gives nothing away
  title: string;
  source: string;
  url: string;
  publishedAt: string | null; // YYYY-MM-DD
  sourceType: SourceType;
  role: DocRole;
  synthetic: boolean; // written by the fetcher (conflicting aggregator page), not fetched
  text: string;
}

// Hand-written question + answer key + retrieval plan, in research/questions.json.
export interface ResearchQuestion {
  id: string;
  ticker: string;
  company: string;
  companyDomains: string[]; // company websites, classified as primary sources
  category: ResearchCategory;
  asOf: string; // YYYY-MM-DD; docs dated after it are dropped
  question: string;
  answer: AnswerKey;
  // PSE Edge disclosure ids (DB) holding the answer, and older/superseded ones
  answerDocs: string[];
  staleDocs: string[];
  // Web pages holding the answer (non-DB facts; keys drafted by Opus via research/draft-key.ts)
  answerUrls: string[];
  // Synthetic aggregator page asserting a wrong value
  conflict: { label: string; value: string } | null;
  // Google News queries; hits dated <= asOf and not matching `exclude` are kept
  search: string[];
  exclude: string[]; // case-insensitive regexes that drop a web doc (keeps not-found bundles answer-free)
  noise: number; // unrelated disclosures from other companies
  notes: string;
  source: string; // where the key came from (disclosure id or URL)
  verified: boolean; // key confirmed by 2+ independent sources (or, for not-found, the bundle checked)
  // Sources checked against the key; `issue` explains why it stays unverified (disagreement, single source)
  verification: { sources: { url: string; date: string | null; quote: string }[]; issue: string | null };
}

export interface ResearchCase {
  id: string;
  suite: 'research';
  frozenAt: string;
  ticker: string;
  company: string;
  category: ResearchCategory;
  asOf: string;
  question: string;
  answer: AnswerKey;
  verified: boolean;
  docs: ResearchDoc[];
}

export interface ResearchGradeResult extends GradeResult {
  found: boolean | null; // model's claim; null when output did not parse
  citedSourceType: SourceType | null;
}
