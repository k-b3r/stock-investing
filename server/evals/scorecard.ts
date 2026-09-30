import { fileURLToPath } from 'url';
import { median } from '../../shared/stats.ts';
import { parseThesisOutput } from '../scripts/thesis-context.ts';
import { printFactCheckScorecard } from './factcheck/scorecard.ts';
import { applicableGraders, gradeRun } from './graders/index.ts';
import { gradeConsistency, gradePriceShift, modalVerdict } from './graders/verdict.ts';
import { casesDir } from './paths.ts';
import { loadResults, readJsonFiles } from './utils.ts';
import type { GradeResult, RunGrades, RunResult, Suite, ThesisCase } from './types.ts';

const pct = (n: number, d: number) => (d === 0 ? 'N/A' : `${Math.round((n / d) * 100)}%`);
const p50 = (xs: number[]) => (xs.length === 0 ? null : median(xs));

// Scorecard column per per-run grader
const RUN_COLUMNS: [keyof RunGrades, string][] = [
  ['numbers', 'numbers'],
  ['verdict', 'verdict'],
  ['naHandling', 'n/a'],
  ['trap', 'trap'],
  ['sanity', 'prod-sanity'],
];

const passRate = (grades: (GradeResult | undefined)[]) => pct(grades.filter((g) => g?.pass).length, grades.length);

// Regrades each run's saved text with the current graders (falls back to stored grades if its case is gone).
// Per-run columns count errored runs as failures; consistency and pair-shift are graded per case.
export function buildScorecard(results: RunResult[], cases: ThesisCase[]): Record<string, string>[] {
  const caseById = new Map(cases.map((c) => [c.id, c]));
  const byModel = new Map<string, RunResult[]>();
  for (const r of results) byModel.set(r.model, [...(byModel.get(r.model) ?? []), r]);

  return [...byModel.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([model, runs]) => {
    const graded = runs.map((r) => {
      const testCase = caseById.get(r.caseId);
      const grades = r.completion.error ? {} : testCase ? gradeRun(r.completion.text, testCase) : r.grades;
      const applicable = testCase ? applicableGraders(testCase) : (Object.keys(r.grades) as (keyof RunGrades)[]);
      const verdict = r.completion.error ? null : parseThesisOutput(r.completion.text).verdict;
      return { run: r, grades, applicable, verdict };
    });
    const column = <K extends keyof RunGrades>(key: K) => graded.filter((g) => g.applicable.includes(key)).map((g) => g.grades[key] as RunGrades[K]);

    const verdictsByCase = new Map<string, ReturnType<typeof modalVerdict>[]>();
    for (const g of graded) verdictsByCase.set(g.run.caseId, [...(verdictsByCase.get(g.run.caseId) ?? []), g.verdict]);
    const consistency = [...verdictsByCase.values()].map(gradeConsistency).filter((g) => g !== null);
    const pairs = [...verdictsByCase.keys()].flatMap((id) => {
      const shifted = caseById.get(id);
      const base = shifted?.expect.pair ? caseById.get(shifted.expect.pair) : undefined;
      if (!shifted || !base || !verdictsByCase.has(base.id)) return [];
      return [gradePriceShift(
        { price: base.context.lastPrice, verdict: modalVerdict(verdictsByCase.get(base.id)!) },
        { price: shifted.context.lastPrice, verdict: modalVerdict(verdictsByCase.get(id)!) }
      )];
    });

    const ok = runs.filter((r) => !r.completion.error);
    const costs = runs.map((r) => r.completion.costUsd).filter((c): c is number => c !== null);
    const latency = p50(ok.map((r) => r.completion.latencyMs));
    const outTokens = p50(ok.map((r) => r.completion.outputTokens).filter((t): t is number => t !== null));
    const format = column('format');
    const numbers = column('numbers');
    return {
      model,
      runs: String(runs.length),
      errors: String(runs.length - ok.length),
      usable: pct(format.filter((g) => g?.usable).length, format.length),
      'format-perfect': passRate(format),
      ...Object.fromEntries(RUN_COLUMNS.map(([key, name]) => [name, passRate(column(key))])),
      'bad figs': String(numbers.reduce((n, g) => n + (g ? g.wrong + g.invented : 0), 0)),
      consistent: passRate(consistency),
      'pair-shift': passRate(pairs),
      'total $': costs.length ? costs.reduce((a, b) => a + b, 0).toFixed(4) : 'N/A',
      'p50 latency s': latency === null ? 'N/A' : (latency / 1000).toFixed(1),
      'p50 out tok': outTokens === null ? 'N/A' : String(outTokens),
    };
  });
}

export async function printScorecard(suite: Suite): Promise<void> {
  const results = await loadResults(suite);
  if (results.length === 0) {
    console.log(`No results for suite "${suite}".`);
    return;
  }
  const rows = buildScorecard(results, await readJsonFiles<ThesisCase>(casesDir(suite)));

  const headers = Object.keys(rows[0]);
  const widths = headers.map((h) => Math.max(h.length, ...rows.map((r) => r[h].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log(`\nScorecard: ${suite}\n`);
  console.log(line(headers));
  console.log(line(widths.map((w) => '-'.repeat(w))));
  for (const r of rows) console.log(line(headers.map((h) => r[h])));
  console.log('\nN/A = no applicable runs (n/a: no null fields, trap: no trap cases, consistent: <2 runs, pair-shift: no pairs).');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'factcheck') await printFactCheckScorecard();
  else await printScorecard('thesis');
}
