import { fileURLToPath } from 'url';
import path from 'path';
import type { Suite } from './types.ts';

const EVALS_DIR = path.dirname(fileURLToPath(import.meta.url));

export const casesDir = (suite: Suite) => path.join(EVALS_DIR, 'cases', suite);
export const resultsDir = (suite: Suite) => path.join(EVALS_DIR, 'results', suite);
export const resultFile = (suite: Suite, model: string, caseId: string, runIndex: number) =>
  path.join(resultsDir(suite), model, `${caseId}.r${runIndex}.json`);
// Pairwise judge verdicts: judge/ for the Opus judge, judge-<id>/ for a bias-check judge
export const judgeDir = (suite: Suite, judge: string) => path.join(resultsDir(suite), judge === 'opus' ? 'judge' : `judge-${judge}`);
export const judgeFile = (suite: Suite, judge: string, [a, b]: [string, string], caseId: string) =>
  path.join(judgeDir(suite, judge), `${a}-vs-${b}`, `${caseId}.json`);
