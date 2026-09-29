import { describe, expect, it } from 'vitest';
import { buildGoRequest, parseGoResponse } from './go.ts';

const req = { system: 'Be terse.', user: 'Reply with just OK' };

describe('Go adapter', () => {
  it('builds a chat-completions body with system and user messages', () => {
    const { path, body } = buildGoRequest('chat', 'mimo-v2.6-flash', req);
    expect(path).toBe('/chat/completions');
    expect(body).toEqual({
      model: 'mimo-v2.6-flash',
      messages: [
        { role: 'system', content: 'Be terse.' },
        { role: 'user', content: 'Reply with just OK' },
      ],
    });
  });

  it('builds a responses body with instructions and input', () => {
    const { path, body } = buildGoRequest('responses', 'gpt-6-luna', req);
    expect(path).toBe('/responses');
    expect(body).toEqual({ model: 'gpt-6-luna', instructions: 'Be terse.', input: 'Reply with just OK' });
  });

  it('parses a chat-completions reply, ignoring reasoning_content', () => {
    const parsed = parseGoResponse('chat', {
      choices: [{ message: { content: 'OK', reasoning_content: 'thinking...' } }],
      usage: { prompt_tokens: 18, completion_tokens: 5 },
    });
    expect(parsed).toEqual({ text: 'OK', inputTokens: 18, outputTokens: 5 });
  });

  it('parses a responses reply, joining output_text parts and skipping reasoning items', () => {
    const parsed = parseGoResponse('responses', {
      output: [
        { type: 'reasoning', summary: [] },
        { type: 'message', content: [{ type: 'output_text', text: 'Hello ' }, { type: 'output_text', text: 'world' }] },
      ],
      usage: { input_tokens: 18, output_tokens: 5 },
    });
    expect(parsed).toEqual({ text: 'Hello world', inputTokens: 18, outputTokens: 5 });
  });

  it('returns nulls for a reply missing usage', () => {
    expect(parseGoResponse('responses', { output: [] })).toEqual({ text: '', inputTokens: null, outputTokens: null });
  });
});
