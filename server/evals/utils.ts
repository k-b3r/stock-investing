import { readdir, readFile } from 'fs/promises';
import path from 'path';
import type { Completion } from './types.ts';

// Parses every .json file in dir; a missing dir yields [].
export async function readJsonFiles<T>(dir: string): Promise<T[]> {
  const files = (await readdir(dir).catch(() => [] as string[])).filter((f) => f.endsWith('.json'));
  return Promise.all(files.map(async (f) => JSON.parse(await readFile(path.join(dir, f), 'utf8')) as T));
}

export function failedCompletion(error: string, latencyMs: number): Completion {
  return { text: '', inputTokens: null, outputTokens: null, costUsd: null, latencyMs, error };
}
