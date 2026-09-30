import { parseThesisOutput } from '../../scripts/thesis-context.ts';
import { NUMERIC_FIELDS, type NumericField } from '../thesis-dataset.ts';
import { extractFigures, labelFigures } from './figures.ts';
import type { GradeResult, ThesisCase } from '../types.ts';

// Applies when the case has missing fields: the thesis must not state a value for any of them.
export function gradeNaHandling(output: string, { expect }: ThesisCase): GradeResult | null {
  const nullFields = expect.missingFields.filter((f): f is NumericField => (NUMERIC_FIELDS as readonly string[]).includes(f));
  if (nullFields.length === 0) return null;

  const { thesis, highlights } = parseThesisOutput(output);
  const text = [thesis, ...highlights].join('\n');
  const figures = extractFigures(text);
  const labeled = labelFigures(text, figures);

  const checks = Object.fromEntries(nullFields.map((f) => [f, true]));
  const notes: string[] = [];
  for (const figure of figures) {
    const field = labeled.get(figure.index);
    if (field && nullFields.includes(field)) {
      checks[field] = false;
      notes.push(`states "${figure.raw}" for ${field}, which is N/A`);
    }
  }
  return { pass: notes.length === 0, checks, notes };
}
