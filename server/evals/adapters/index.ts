import type { Completion, CompletionRequest, ModelSpec } from '../types.ts';
import { completeClaudeCli } from './claude-cli.ts';
import { completeGo } from './go.ts';

export function complete(spec: ModelSpec, req: CompletionRequest): Promise<Completion> {
  return spec.provider === 'go' ? completeGo(spec, req) : completeClaudeCli(spec, req);
}
