import type { FactCheckGradeResult } from './factcheck/types.ts';
import type { ResearchGradeResult } from './research/types.ts';
import type { TickerContext, Verdict } from '../scripts/thesis-context.ts';

export type Suite = 'thesis' | 'factcheck' | 'research';

export type PriceBand = 'below-mos' | 'mos-to-sticker' | 'above-sticker' | 'no-sticker' | 'no-price';
export type IndexTier = 'psei' | 'midcap' | 'smallcap';
// real = frozen as-is; the rest are copies of a real case with one kind of change
export type CaseKind = 'real' | 'price-shift' | 'blanked' | 'trap';

export interface ThesisExpectations {
  kind: CaseKind;
  // Real case this was derived from (null for real cases)
  base: string | null;
  tier: IndexTier;
  band: PriceBand;
  allowedVerdicts: Verdict[];
  // Numeric context fields that are null (shown as N/A); the thesis must not state values for them
  missingFields: string[];
  // price-shift: id of the real case this differs from only in price; the verdict must move toward buy at the lower
  // price and toward pass at the higher one (unchanged fails, see gradePriceShift)
  pair?: string;
  // trap: fields holding impossible values and what the model should notice
  trap?: { fields: string[]; description: string };
}

export interface ThesisCase {
  id: string;
  suite: 'thesis';
  frozenAt: string;
  context: TickerContext;
  dataBlock: string;
  expect: ThesisExpectations;
}

export type Provider = 'go' | 'claude-cli';

// Go API format per model, from https://opencode.ai/docs/go/
export type GoEndpoint = 'chat' | 'responses';

export interface ModelSpec {
  id: string;
  provider: Provider;
  model: string;
  // Go only; defaults to 'chat'
  endpoint?: GoEndpoint;
  // USD per million tokens; null when billed by subscription (Claude CLI reports its own estimate)
  price: { input: number; output: number } | null;
}

export interface CompletionRequest {
  system: string;
  user: string;
}

export interface Completion {
  text: string;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  latencyMs: number;
  error: string | null;
}

export interface GradeResult {
  pass: boolean;
  checks: Record<string, boolean>;
  notes: string[];
}

export interface FormatGradeResult extends GradeResult {
  // Verdict + 3 highlights parse, so the app can show them; style checks may still fail
  usable: boolean;
}

export interface NumbersGradeResult extends GradeResult {
  figures: number;
  // Labeled figure that contradicts its field ("P/E of 20x" when P/E is 13.4)
  wrong: number;
  // Figure matching nothing in the frozen data, or quoting a field that is null
  invented: number;
}

// Per-run grader keys. Graders that don't apply to a case are omitted.
export interface RunGrades {
  format?: FormatGradeResult;
  numbers?: NumbersGradeResult;
  verdict?: GradeResult;
  naHandling?: GradeResult;
  trap?: GradeResult;
  sanity?: GradeResult;
  // Fact-check suite only
  factCheck?: FactCheckGradeResult;
  // Research suite only
  research?: ResearchGradeResult;
}

export interface RunResult {
  suite: Suite;
  caseId: string;
  model: string;
  runIndex: number;
  startedAt: string;
  completion: Completion;
  grades: RunGrades;
}
