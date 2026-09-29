import { fileURLToPath } from 'url';
import path from 'path';
import type { Suite } from './types.ts';

const EVALS_DIR = path.dirname(fileURLToPath(import.meta.url));

export const casesDir = (suite: Suite) => path.join(EVALS_DIR, 'cases', suite);
export const resultsDir = (suite: Suite) => path.join(EVALS_DIR, 'results', suite);
export const resultFile = (suite: Suite, model: string, caseId: string, runIndex: number) =>
  path.join(resultsDir(suite), model, `${caseId}.r${runIndex}.json`);
