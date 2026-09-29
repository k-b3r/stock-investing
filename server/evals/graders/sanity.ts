import { parseThesisOutput, sanityCheck } from '../../scripts/thesis-context.ts';
import type { GradeResult, ThesisCase } from '../types.ts';

// The same gate generate-thesis.ts runs before storing, so an output that passes the eval isn't rejected in prod.
export function gradeSanity(output: string, { context }: ThesisCase): GradeResult {
  const issue = sanityCheck(parseThesisOutput(output).thesis, context);
  return { pass: issue === null, checks: { prodSanity: issue === null }, notes: issue ? [issue] : [] };
}
