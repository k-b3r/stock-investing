import { parseThesisOutput } from '../../scripts/thesis-context.ts';
import { extractFigures, isHypothetical, isLowerBound, knownNumbers, labelFigures, matches } from './figures.ts';
import type { NumbersGradeResult, ThesisCase } from '../types.ts';

// Every figure in the thesis (body and highlights) must match the frozen data. A figure right after a
// field label must match that field; any other figure must match some number in the data block.
// Proposed entry prices, scenarios and ranges are skipped (see isHypothetical).
export function gradeNumbers(output: string, { context, dataBlock }: ThesisCase): NumbersGradeResult {
  const { thesis, highlights } = parseThesisOutput(output);
  const text = [thesis, ...highlights].join('\n');
  const figures = extractFigures(text);
  const labeled = labelFigures(text, figures);
  const known = knownNumbers(context, dataBlock);

  const notes: string[] = [];
  let wrong = 0;
  let invented = 0;
  for (const figure of figures) {
    const field = labeled.get(figure.index);
    if (!field && isHypothetical(text, figure)) continue;
    const expected = field ? context[field] : null;
    const atLeast = isLowerBound(text, figure);
    if (field && expected === null) {
      invented++;
      notes.push(`"${figure.raw}" stated for ${field}, which is N/A`);
    } else if (field && expected !== null) {
      if (!matches(figure, expected, atLeast)) {
        wrong++;
        notes.push(`"${figure.raw}" for ${field}, data says ${+expected.toFixed(2)}`);
      }
    } else if (!known.some((k) => matches(figure, k, atLeast))) {
      invented++;
      notes.push(`"${figure.raw}" not in data`);
    }
  }

  return {
    pass: wrong + invented === 0,
    checks: { noWrongFigures: wrong === 0, noInventedFigures: invented === 0 },
    notes,
    figures: figures.length,
    wrong,
    invented,
  };
}
