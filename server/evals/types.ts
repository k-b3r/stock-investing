import type { TickerContext, Verdict } from '../scripts/thesis-context.ts';

export type Suite = 'thesis';

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
  // price-shift: id of the real case this differs from only in price (the lower price should never get a worse verdict)
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

export interface RunResult {
  suite: Suite;
  caseId: string;
  model: string;
  runIndex: number;
  startedAt: string;
  completion: Completion;
  grades: { format?: FormatGradeResult } & Record<string, GradeResult>;
}
