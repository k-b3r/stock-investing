import type { TickerContext } from '../../scripts/thesis-context.ts';
import type { GradeResult } from '../types.ts';

// A stored thesis paired with the source data it is checked against. Price-derived fields are
// overlaid with the values stored at generation time so the thesis and source agree on price.
export interface FactCheckBase {
  ticker: string;
  frozenAt: string;
  generatedAt: string;
  context: TickerContext;
  dataBlock: string;
  // Thesis as stored in investment_theses
  storedThesis: string;
  // storedThesis with source contradictions fixed (the clean copy); null until reconciled
  thesis: string | null;
  // Edits that turned storedThesis into thesis, for review
  reconcileEdits: TextEdit[];
  // Drafted planted errors that passed validation, and non-errors, on the clean thesis
  candidates?: PlantedError[];
  nonErrorCandidates?: NonError[];
  drafted?: { model: string; at: string };
}

export interface TextEdit {
  find: string;
  replace: string;
  reason: string;
}

export type ErrorType = 'size' | 'direction' | 'year' | 'units' | 'stake' | 'currency';
export type NonErrorType = 'rounding' | 'founding-year';

// A wrong claim planted in an otherwise clean thesis
export interface PlantedError {
  type: ErrorType;
  // Clean text that was replaced
  original: string;
  // Wrong text now in the thesis
  claim: string;
  // What the source says
  trueValue: string;
  // Verbatim line from the data block the claim contradicts
  sourceQuote: string;
  // Case-insensitive substrings; a contradiction containing any of them counts as catching this error
  match: string[];
}

// A change the fact-checker must NOT flag (rounding within tolerance, true fact absent from source)
export interface NonError {
  type: NonErrorType;
  original: string;
  text: string;
  note: string;
}

export interface FactCheckCase {
  id: string;
  suite: 'factcheck';
  ticker: string;
  // drafted = LLM-drafted (see draftedBy), script = mechanical mutation, real = reproduces a past production failure
  origin: 'drafted' | 'script' | 'real' | 'clean';
  // Model that drafted the clean copy and planted errors (draft.ts --model)
  draftedBy: string | null;
  dataBlock: string;
  thesis: string;
  errors: PlantedError[];
  nonErrors: NonError[];
  // Set by the user after reviewing REVIEW.md; the runner skips unapproved cases unless --all
  approved: boolean;
  // Web check of the case's facts, from review/verification.json
  verification: Verification | null;
}

// verified = true value (and clean-thesis spot-checks) confirmed by 2+ independent sources;
// source-only = pipeline-computed figure, no web check applies; conflict = needs the user's judgment
export interface Verification {
  status: 'verified' | 'source-only' | 'conflict';
  checkedAt: string;
  notes: string;
  sources: string[];
  // User's decision on a conflict
  resolution?: string;
}

export interface FactCheckGradeResult extends GradeResult {
  parsed: boolean;
  planted: number;
  caught: number;
  // Contradictions that match no planted error
  falseAlarms: string[];
}
