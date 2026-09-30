import path from 'path';
import { casesDir } from '../paths.ts';

// Cases are the top-level JSON files; bases (source + clean thesis per ticker) live one level down
export const factCheckCasesDir = casesDir('factcheck');
export const basesDir = path.join(factCheckCasesDir, 'bases');
export const reviewFile = path.join(factCheckCasesDir, 'REVIEW.md');
