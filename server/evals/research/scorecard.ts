import { median } from '../../../shared/stats.ts';
import { loadResults, readJsonFiles } from '../utils.ts';
import type { RunResult } from '../types.ts';
import { gradeResearch } from './grader.ts';
import { researchCasesDir } from './paths.ts';
import type { ResearchCase, ResearchGradeResult } from './types.ts';

const pct = (n: number, d: number) => (d === 0 ? 'N/A' : `${Math.round((n / d) * 100)}%`);

// Regrades saved outputs against the current cases, so key fixes apply to old runs. Runs whose case
// no longer exists are dropped. Rates are over all runs of the relevant cases; errors count as failures.
export function buildResearchScorecard(results: RunResult[], cases: ResearchCase[]): Record<string, string>[] {
  const caseById = new Map(cases.map((c) => [c.id, c]));
  const byModel = new Map<string, RunResult[]>();
  for (const r of results) if (caseById.has(r.caseId)) byModel.set(r.model, [...(byModel.get(r.model) ?? []), r]);

  return [...byModel.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([model, runs]) => {
    const graded = runs.map((r) => {
      const testCase = caseById.get(r.caseId)!;
      const grade: ResearchGradeResult | null = r.completion.error ? null : gradeResearch(r.completion.text, testCase);
      return { testCase, grade };
    });
    const notFound = graded.filter((g) => g.testCase.answer.kind === 'not_found');
    const answerable = graded.filter((g) => g.testCase.answer.kind !== 'not_found');
    const rate = (gs: typeof graded, check: string) => pct(gs.filter((g) => g.grade?.checks[check]).length, gs.length);

    const ok = runs.filter((r) => !r.completion.error);
    const costs = runs.map((r) => r.completion.costUsd).filter((c): c is number => c !== null);
    const latency = ok.length ? median(ok.map((r) => r.completion.latencyMs)) : null;
    return {
      model,
      runs: String(runs.length),
      errors: String(runs.length - ok.length),
      'bad json': String(graded.filter((g) => g.grade && !g.grade.checks.parsed).length),
      pass: pct(graded.filter((g) => g.grade?.pass).length, graded.length),
      correct: rate(answerable, 'correct'),
      'cite has ans': rate(answerable, 'citedHasAnswer'),
      'cite primary': rate(answerable, 'citedPrimary'),
      // Said "not found" although the bundle had the answer
      'false NF': pct(answerable.filter((g) => g.grade?.found === false).length, answerable.length),
      'NF handled': rate(notFound, 'notFoundHandled'),
      'total $': costs.length ? costs.reduce((a, b) => a + b, 0).toFixed(4) : 'N/A',
      'p50 latency s': latency === null ? 'N/A' : (latency / 1000).toFixed(1),
    };
  });
}

export async function printResearchScorecard(): Promise<void> {
  const rows = buildResearchScorecard(await loadResults('research'), await readJsonFiles<ResearchCase>(researchCasesDir));
  if (rows.length === 0) {
    console.log('No results for suite "research".');
    return;
  }
  const headers = Object.keys(rows[0]);
  const widths = headers.map((h) => Math.max(h.length, ...rows.map((r) => r[h].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log('\nScorecard: research\n');
  console.log(line(headers));
  console.log(line(widths.map((w) => '-'.repeat(w))));
  for (const r of rows) console.log(line(headers.map((h) => r[h])));
}
