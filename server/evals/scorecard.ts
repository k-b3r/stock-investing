import { readdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { median } from '../../shared/stats.ts';
import { casesDir, resultsDir } from './paths.ts';
import { readJsonFiles } from './utils.ts';
import type { ResearchCase, RunResult, Suite } from './types.ts';

async function loadResults(suite: Suite): Promise<RunResult[]> {
  const root = resultsDir(suite);
  const models = await readdir(root).catch(() => [] as string[]);
  const perModel = await Promise.all(models.map((model) => readJsonFiles<RunResult>(path.join(root, model))));
  return perModel.flat();
}

// Result files saved before `usable` existed: derive it from the stored checks
const isUsable = (r: RunResult) => {
  const format = r.grades.format;
  if (!format) return false;
  return format.usable ?? (format.checks.verdictParsed && format.checks.threeHighlights);
};

const pct = (n: number, d: number) => (d === 0 ? 'N/A' : `${Math.round((n / d) * 100)}%`);
const p50 = (xs: number[]) => (xs.length === 0 ? null : median(xs));

function thesisColumns(runs: RunResult[]): Record<string, string> {
  const ok = runs.filter((r) => !r.completion.error);
  return {
    usable: pct(ok.filter(isUsable).length, runs.length),
    'format-perfect': pct(ok.filter((r) => r.grades.format?.pass).length, runs.length),
  };
}

// Rates over all runs of the relevant cases; errors and unparseable output count as failures.
function researchColumns(runs: RunResult[], notFoundCases: Set<string>): Record<string, string> {
  const notFound = runs.filter((r) => notFoundCases.has(r.caseId));
  const answerable = runs.filter((r) => !notFoundCases.has(r.caseId));
  const rate = (rs: RunResult[], check: string) => pct(rs.filter((r) => r.grades.research?.checks[check]).length, rs.length);
  return {
    pass: pct(runs.filter((r) => r.grades.research?.pass).length, runs.length),
    correct: rate(answerable, 'correct'),
    'cite has ans': rate(answerable, 'citedHasAnswer'),
    'cite primary': rate(answerable, 'citedPrimary'),
    'false NF': pct(answerable.filter((r) => r.grades.research?.found === false).length, answerable.length),
    'NF handled': rate(notFound, 'notFoundHandled'),
  };
}

export async function printScorecard(suite: Suite): Promise<void> {
  const results = await loadResults(suite);
  if (results.length === 0) {
    console.log(`No results for suite "${suite}".`);
    return;
  }

  const researchCases = suite === 'research' ? await readJsonFiles<ResearchCase>(casesDir('research')) : [];
  const notFoundCases = new Set(researchCases.filter((c) => c.answer.kind === 'not_found').map((c) => c.id));

  const byModel = new Map<string, RunResult[]>();
  for (const r of results) byModel.set(r.model, [...(byModel.get(r.model) ?? []), r]);

  const rows = [...byModel.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([model, runs]): Record<string, string> => {
    const ok = runs.filter((r) => !r.completion.error);
    const costs = runs.map((r) => r.completion.costUsd).filter((c): c is number => c !== null);
    const latency = p50(ok.map((r) => r.completion.latencyMs));
    const outTokens = p50(ok.map((r) => r.completion.outputTokens).filter((t): t is number => t !== null));
    return {
      model,
      runs: String(runs.length),
      errors: String(runs.length - ok.length),
      ...(suite === 'research' ? researchColumns(runs, notFoundCases) : thesisColumns(runs)),
      'total $': costs.length ? costs.reduce((a, b) => a + b, 0).toFixed(4) : 'N/A',
      'p50 latency s': latency === null ? 'N/A' : (latency / 1000).toFixed(1),
      'p50 out tok': outTokens === null ? 'N/A' : String(outTokens),
    };
  });

  const headers = Object.keys(rows[0]);
  const widths = headers.map((h) => Math.max(h.length, ...rows.map((r) => r[h].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log(`\nScorecard: ${suite}\n`);
  console.log(line(headers));
  console.log(line(widths.map((w) => '-'.repeat(w))));
  for (const r of rows) console.log(line(headers.map((h) => r[h])));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const suite = process.argv[2] ?? 'thesis';
  if (suite !== 'thesis' && suite !== 'research') throw new Error(`unknown suite "${suite}" (thesis or research)`);
  await printScorecard(suite);
}
