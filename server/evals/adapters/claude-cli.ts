import { spawn } from 'child_process';
import { tmpdir } from 'os';
import type { Completion, CompletionRequest, ModelSpec } from '../types.ts';
import { failedCompletion } from '../utils.ts';

interface ClaudeJsonOutput {
  result?: string;
  is_error?: boolean;
  total_cost_usd?: number;
  usage?: { input_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number; output_tokens?: number };
}

// Isolated from Claude Code's own context: replaced system prompt, no tools, no user/project
// settings (hooks, plugins), no MCP, no skills, run outside any repo so no CLAUDE.md is found.
// Keeps subscription billing (unlike --bare, which requires ANTHROPIC_API_KEY).
export function completeClaudeCli(spec: ModelSpec, req: CompletionRequest): Promise<Completion> {
  const started = Date.now();
  return new Promise((resolve) => {
    const proc = spawn(
      'claude',
      [
        '-p', req.user,
        '--model', spec.model,
        '--system-prompt', req.system,
        '--tools', '',
        '--setting-sources=',
        '--strict-mcp-config',
        '--disable-slash-commands',
        '--output-format', 'json',
        '--no-session-persistence',
      ],
      { cwd: tmpdir(), stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    proc.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));

    const fail = (error: string) => failedCompletion(error, Date.now() - started);

    proc.on('error', (err) => resolve(fail(`claude invocation error: ${err.message}`)));
    proc.on('close', (code) => {
      let out: ClaudeJsonOutput;
      try {
        out = JSON.parse(stdout) as ClaudeJsonOutput;
      } catch {
        resolve(fail(`claude exited ${code} with non-JSON output: ${(stderr || stdout).slice(0, 300)}`));
        return;
      }
      const u = out.usage ?? {};
      const inputTokens = (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0);
      resolve({
        text: out.result ?? '',
        inputTokens: out.usage ? inputTokens : null,
        outputTokens: u.output_tokens ?? null,
        costUsd: out.total_cost_usd ?? null,
        latencyMs: Date.now() - started,
        error: out.is_error ? `claude reported error: ${(out.result ?? '').slice(0, 300)}` : null,
      });
    });
  });
}
