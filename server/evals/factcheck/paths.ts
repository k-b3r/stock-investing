import path from 'path';
import { casesDir } from '../paths.ts';

// Cases are the top-level JSON files; bases (source + clean thesis per ticker) live one level down
export const factCheckCasesDir = casesDir('factcheck');
export const basesDir = path.join(factCheckCasesDir, 'bases');
export const reviewFile = path.join(factCheckCasesDir, 'REVIEW.md');
// Web verification of each case's facts (status, notes, source URLs), keyed by case id
export const verificationFile = path.join(factCheckCasesDir, 'review', 'verification.json');
