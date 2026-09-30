import { parseFactCheckResponse } from '../../prompts/fact-check.ts';
import type { FactCheckCase, FactCheckGradeResult, PlantedError } from './types.ts';

// Lowercase, drop thousands separators, collapse whitespace, so "₱1,234.5 Billion" matches "₱1234.5 billion"
export const normalize = (s: string) => s.toLowerCase().replace(/(\d),(?=\d{3}\b)/g, '$1').replace(/\s+/g, ' ');

const catches = (contradiction: string, error: PlantedError) => {
  const text = normalize(contradiction);
  return error.match.some((m) => text.includes(normalize(m)));
};

// Recall: each planted error counts as caught when any contradiction matches it.
// Precision: a contradiction matching no planted error is a false alarm (the base thesis is clean).
// Several contradictions naming the same planted error are not false alarms.
export function gradeFactCheck(output: string, testCase: Pick<FactCheckCase, 'errors'>): FactCheckGradeResult {
  const planted = testCase.errors.length;
  const contradictions = parseFactCheckResponse(output);
  if (!contradictions) {
    return { pass: false, parsed: false, planted, caught: 0, falseAlarms: [], checks: { parsed: false }, notes: ['response had no parseable {"contradictions": [...]} JSON'] };
  }

  const missed = testCase.errors.filter((e) => !contradictions.some((c) => catches(c, e)));
  const falseAlarms = contradictions.filter((c) => !testCase.errors.some((e) => catches(c, e)));
  const notes = [
    ...missed.map((e) => `missed ${e.type} error: "${e.claim}" (source: ${e.trueValue})`),
    ...falseAlarms.map((c) => `false alarm: "${c.slice(0, 120)}"`),
  ];
  return {
    pass: missed.length === 0 && falseAlarms.length === 0,
    parsed: true,
    planted,
    caught: planted - missed.length,
    falseAlarms,
    checks: { parsed: true, allCaught: missed.length === 0, noFalseAlarms: falseAlarms.length === 0 },
    notes,
  };
}
