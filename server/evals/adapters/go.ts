import { randomUUID } from 'crypto';
import type { Completion, CompletionRequest, ModelSpec } from '../types.ts';

const GO_BASE_URL = 'https://opencode.ai/zen/go/v1';

interface ChatResponse {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

export async function completeGo(spec: ModelSpec, req: CompletionRequest): Promise<Completion> {
  const apiKey = process.env.OPENCODE_API_KEY;
  if (!apiKey) throw new Error('OPENCODE_API_KEY is not set');

  const started = Date.now();
  try {
    const res = await fetch(`${GO_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        // Go rejects requests without it (400 MissingSessionID)
        'x-opencode-session': `eval-${randomUUID()}`,
      },
      body: JSON.stringify({
        model: spec.model,
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
      }),
    });
    const latencyMs = Date.now() - started;
    const body = (await res.json().catch(() => ({}))) as ChatResponse;
    if (!res.ok) {
      return { text: '', inputTokens: null, outputTokens: null, costUsd: null, latencyMs, error: `HTTP ${res.status}: ${body.error?.message ?? 'unknown error'}` };
    }

    const inputTokens = body.usage?.prompt_tokens ?? null;
    const outputTokens = body.usage?.completion_tokens ?? null;
    const costUsd =
      spec.price && inputTokens !== null && outputTokens !== null
        ? (inputTokens * spec.price.input + outputTokens * spec.price.output) / 1_000_000
        : null;
    return { text: body.choices?.[0]?.message?.content ?? '', inputTokens, outputTokens, costUsd, latencyMs, error: null };
  } catch (err) {
    return { text: '', inputTokens: null, outputTokens: null, costUsd: null, latencyMs: Date.now() - started, error: (err as Error).message };
  }
}
