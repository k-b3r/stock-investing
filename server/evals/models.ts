import type { ModelSpec } from './types.ts';

// Go prices from https://opencode.ai/docs/go/ (Go tier, peak rate where tiered), checked 2026-09-29.
// Endpoints: GPT models need /responses. Qwen is documented as /messages but Go also serves it on
// /chat/completions (verified 2026-09-29), so it stays on chat to avoid a third request format.
export const MODELS: ModelSpec[] = [
  { id: 'mimo-v2.6-pro', provider: 'go', model: 'mimo-v2.6-pro', price: { input: 0.435, output: 0.87 } },
  { id: 'glm-5.3', provider: 'go', model: 'glm-5.3', price: { input: 1.4, output: 4.4 } },
  { id: 'kimi-k3', provider: 'go', model: 'kimi-k3', price: { input: 3.0, output: 15.0 } },
  { id: 'deepseek-v4-pro', provider: 'go', model: 'deepseek-v4-pro', price: { input: 1.32, output: 3.96 } },
  { id: 'qwen3.8-max', provider: 'go', model: 'qwen3.8-max', price: { input: 2.0, output: 6.0 } },
  { id: 'gpt-6-luna', provider: 'go', model: 'gpt-6-luna', endpoint: 'responses', price: { input: 0.1, output: 0.5 } },
  { id: 'mimo-v2.6-flash', provider: 'go', model: 'mimo-v2.6-flash', price: { input: 0.14, output: 0.28 } },
  { id: 'deepseek-v4.1-flash', provider: 'go', model: 'deepseek-v4.1-flash', price: { input: 0.3, output: 1.2 } },
  { id: 'glm-5.3-flash', provider: 'go', model: 'glm-5.3-flash', price: { input: 0.15, output: 0.5 } },
  { id: 'qwen3.8-flash', provider: 'go', model: 'qwen3.8-flash', price: { input: 0.15, output: 0.47 } },
  { id: 'sonnet', provider: 'claude-cli', model: 'sonnet', price: null },
  // Production fact-checker
  { id: 'haiku', provider: 'claude-cli', model: 'haiku', price: null },
];

export function findModel(id: string): ModelSpec {
  const spec = MODELS.find((m) => m.id === id);
  if (!spec) throw new Error(`unknown model "${id}" — known: ${MODELS.map((m) => m.id).join(', ')}`);
  return spec;
}
