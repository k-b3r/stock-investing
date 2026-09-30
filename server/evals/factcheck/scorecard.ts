import { median } from '../../../shared/stats.ts';
import { loadResults, readJsonFiles } from '../utils.ts';
import type { RunResult } from '../types.ts';
import { gradeFactCheck } from './grader.ts';
import { factCheckCasesDir } from './paths.ts';
import type { ErrorType, FactCheckCase, FactCheckGradeResult } from './types.ts';

const TYPES: ErrorType[] = ['size', 'direction', 'year', 'units', 'stake', 'currency'];
const pct = (n: number, d: number) => (d === 0 ? 'N/A' : `${Math.round((n / d) * 100)}%`);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// Regrades saved outputs against the current cases, so edits made during review apply to old runs.
// Errored or unparseable runs count their planted errors as missed and clean runs as failed.
// Runs whose case no longer exists are dropped.
export function buildFactCheckScorecard(results: RunResult[], cases: FactCheckCase[]): Record<string, string>[] {
  const caseById = new Map(cases.map((c) => [c.id, c]));
  const byModel = new Map<string, RunResult[]>();
  for (const r of results) if (caseById.has(r.caseId)) byModel.set(r.model, [...(byModel.get(r.model) ?? []), r]);

  return [...byModel.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([model, runs]) => {
    const graded = runs.map((r) => {
      const testCase = caseById.get(r.caseId)!;
      const grade: FactCheckGradeResult | null = r.completion.error ? null : gradeFactCheck(r.completion.text, testCase);
      return { run: r, testCase, grade };
    });
    const planted = graded.filter((g) => g.testCase.errors.length > 0);
    const clean = graded.filter((g) => g.testCase.errors.length === 0);
    const caught = sum(graded.map((g) => g.grade?.caught ?? 0));
    const falseAlarms = sum(graded.map((g) => g.grade?.falseAlarms.length ?? 0));
    const recallOf = (gs: typeof graded) => pct(sum(gs.map((g) => g.grade?.caught ?? 0)), sum(gs.map((g) => g.testCase.errors.length)));
    const ok = runs.filter((r) => !r.completion.error);
    const costs = runs.map((r) => r.completion.costUsd).filter((c): c is number => c !== null);
    const latency = ok.length ? median(ok.map((r) => r.completion.latencyMs)) : null;

    return {
      model,
      runs: String(runs.length),
      errors: String(runs.length - ok.length),
      'bad json': String(graded.filter((g) => g.grade && !g.grade.parsed).length),
      recall: recallOf(planted),
      precision: pct(caught, caught + falseAlarms),
      'clean-pass': pct(clean.filter((g) => g.grade?.pass).length, clean.length),
      'false alarms': String(falseAlarms),
      ...Object.fromEntries(TYPES.map((t) => [`r:${t}`, recallOf(planted.filter((g) => g.testCase.errors.some((e) => e.type === t)))])),
      'total $': costs.length ? sum(costs).toFixed(4) : 'N/A',
      'p50 latency s': latency === null ? 'N/A' : (latency / 1000).toFixed(1),
    };
  });
}

export async function printFactCheckScorecard(): Promise<void> {
  const rows = buildFactCheckScorecard(await loadResults('factcheck'), await readJsonFiles<FactCheckCase>(factCheckCasesDir));
  if (rows.length === 0) {
    console.log('No results for suite "factcheck".');
    return;
  }
  const headers = Object.keys(rows[0]);
  const widths = headers.map((h) => Math.max(h.length, ...rows.map((r) => r[h].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log('\nScorecard: factcheck\n');
  console.log(line(headers));
  console.log(line(widths.map((w) => '-'.repeat(w))));
  for (const r of rows) console.log(line(headers.map((h) => r[h])));
  console.log('\nrecall = planted errors caught; precision = flags that name a planted error; clean-pass = clean cases with no flags; r:<type> = recall per error type.');
}
