import type { TickerContext } from '../scripts/thesis-context.ts';

export type Suite = 'thesis';

export interface ThesisCase {
  id: string;
  suite: 'thesis';
  frozenAt: string;
  context: TickerContext;
  dataBlock: string;
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

export interface RunResult {
  suite: Suite;
  caseId: string;
  model: string;
  runIndex: number;
  startedAt: string;
  completion: Completion;
  grades: Record<string, GradeResult>;
}
