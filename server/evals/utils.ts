import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { resultsDir } from './paths.ts';
import type { Completion, RunResult, Suite } from './types.ts';

// Parses every .json file in dir; a missing dir yields [].
export async function readJsonFiles<T>(dir: string): Promise<T[]> {
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.json'));
  return Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(dir, f), 'utf8')) as T));
}

export function failedCompletion(error: string, latencyMs: number): Completion {
  return { text: '', inputTokens: null, outputTokens: null, costUsd: null, latencyMs, error };
}

// Every saved run of a suite, across models (judge verdict dirs skipped)
export async function loadResults(suite: Suite): Promise<RunResult[]> {
  const root = resultsDir(suite);
  const models = (await readdir(root).catch(() => [] as string[])).filter((d) => !d.startsWith('judge'));
  const perModel = await Promise.all(models.map((model) => readJsonFiles<RunResult>(path.join(root, model))));
  return perModel.flat();
}
