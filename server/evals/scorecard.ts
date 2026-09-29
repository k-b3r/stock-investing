import { readdir, readFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { resultsDir } from './paths.ts';
import type { RunResult, Suite } from './types.ts';

async function loadResults(suite: Suite): Promise<RunResult[]> {
  const root = resultsDir(suite);
  const models = await readdir(root).catch(() => [] as string[]);
  const results: RunResult[] = [];
  for (const model of models) {
    for (const file of await readdir(path.join(root, model))) {
      if (file.endsWith('.json')) results.push(JSON.parse(await readFile(path.join(root, model, file), 'utf8')) as RunResult);
    }
  }
  return results;
}

// Result files saved before `usable` existed: derive it from the stored checks
const isUsable = (r: RunResult) => {
  const format = r.grades.format;
  if (!format) return false;
  return format.usable ?? (format.checks.verdictParsed && format.checks.threeHighlights);
};

const pct = (n: number, d: number) => (d === 0 ? 'N/A' : `${Math.round((n / d) * 100)}%`);
const median = (xs: number[]) => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

export async function printScorecard(suite: Suite): Promise<void> {
  const results = await loadResults(suite);
  if (results.length === 0) {
    console.log(`No results for suite "${suite}".`);
    return;
  }

  const byModel = new Map<string, RunResult[]>();
  for (const r of results) byModel.set(r.model, [...(byModel.get(r.model) ?? []), r]);

  const rows = [...byModel.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([model, runs]) => {
    const ok = runs.filter((r) => !r.completion.error);
    const costs = runs.map((r) => r.completion.costUsd).filter((c): c is number => c !== null);
    const latency = median(ok.map((r) => r.completion.latencyMs));
    const outTokens = median(ok.map((r) => r.completion.outputTokens).filter((t): t is number => t !== null));
    return {
      model,
      runs: String(runs.length),
      errors: String(runs.length - ok.length),
      usable: pct(ok.filter(isUsable).length, runs.length),
      'format-perfect': pct(ok.filter((r) => r.grades.format?.pass).length, runs.length),
      'total $': costs.length ? costs.reduce((a, b) => a + b, 0).toFixed(4) : 'N/A',
      'p50 latency s': latency === null ? 'N/A' : (latency / 1000).toFixed(1),
      'p50 out tok': outTokens === null ? 'N/A' : String(outTokens),
    };
  });

  const headers = Object.keys(rows[0]) as (keyof (typeof rows)[number])[];
  const widths = headers.map((h) => Math.max(h.length, ...rows.map((r) => r[h].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log(`\nScorecard: ${suite}\n`);
  console.log(line(headers));
  console.log(line(widths.map((w) => '-'.repeat(w))));
  for (const r of rows) console.log(line(headers.map((h) => r[h])));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await printScorecard('thesis');
}
