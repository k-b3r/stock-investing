import path from 'path';
import { fileURLToPath } from 'url';
import { casesDir } from '../paths.ts';

// Frozen bundles live with the other suites' cases; the hand-edited questions and review sheet live here
export const researchCasesDir = casesDir('research');
const RESEARCH_DIR = path.dirname(fileURLToPath(import.meta.url));
export const questionsFile = path.join(RESEARCH_DIR, 'questions.json');
export const reviewFile = path.join(RESEARCH_DIR, 'REVIEW.md');
