import { randomUUID } from 'crypto';
import type { Completion, CompletionRequest, GoEndpoint, ModelSpec } from '../types.ts';
import { failedCompletion } from '../utils.ts';

const GO_BASE_URL = 'https://opencode.ai/zen/go/v1';

interface ChatResponse {
  choices?: { message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  error?: { message?: string };
}

interface ResponsesResponse {
  output?: { type?: string; content?: { type?: string; text?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number };
  error?: { message?: string };
}

export function buildGoRequest(endpoint: GoEndpoint, model: string, req: CompletionRequest): { path: string; body: object } {
  if (endpoint === 'responses') {
    return { path: '/responses', body: { model, instructions: req.system, input: req.user } };
  }
  return {
    path: '/chat/completions',
    body: {
      model,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: req.user },
      ],
    },
  };
}

// Only the final answer text: reasoning (chat `reasoning_content`, responses `reasoning` items) is dropped.
export function parseGoResponse(endpoint: GoEndpoint, body: unknown): { text: string; inputTokens: number | null; outputTokens: number | null } {
  if (endpoint === 'responses') {
    const r = body as ResponsesResponse;
    const text = (r.output ?? [])
      .filter((o) => o.type === 'message')
      .flatMap((o) => o.content ?? [])
      .filter((c) => c.type === 'output_text')
      .map((c) => c.text ?? '')
      .join('');
    return { text, inputTokens: r.usage?.input_tokens ?? null, outputTokens: r.usage?.output_tokens ?? null };
  }
  const r = body as ChatResponse;
  return { text: r.choices?.[0]?.message?.content ?? '', inputTokens: r.usage?.prompt_tokens ?? null, outputTokens: r.usage?.completion_tokens ?? null };
}

export async function completeGo(spec: ModelSpec, req: CompletionRequest): Promise<Completion> {
  const apiKey = process.env.OPENCODE_API_KEY;
  if (!apiKey) throw new Error('OPENCODE_API_KEY is not set');

  const endpoint = spec.endpoint ?? 'chat';
  const { path, body } = buildGoRequest(endpoint, spec.model, req);
  const started = Date.now();
  try {
    const res = await fetch(`${GO_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        // Go rejects requests without it (400 MissingSessionID)
        'x-opencode-session': `eval-${randomUUID()}`,
      },
      body: JSON.stringify(body),
    });
    const latencyMs = Date.now() - started;
    const json = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    if (!res.ok) {
      return failedCompletion(`HTTP ${res.status}: ${json.error?.message ?? 'unknown error'}`, latencyMs);
    }

    const { text, inputTokens, outputTokens } = parseGoResponse(endpoint, json);
    const costUsd =
      spec.price && inputTokens !== null && outputTokens !== null
        ? (inputTokens * spec.price.input + outputTokens * spec.price.output) / 1_000_000
        : null;
    return { text, inputTokens, outputTokens, costUsd, latencyMs, error: null };
  } catch (err) {
    return failedCompletion((err as Error).message, Date.now() - started);
  }
}
