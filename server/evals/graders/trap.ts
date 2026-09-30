import { parseThesisOutput } from '../../scripts/thesis-context.ts';
import { NUMERIC_FIELDS, type NumericField } from '../thesis-dataset.ts';
import { FIELD_LABELS, extractFigures, matches } from './figures.ts';
import type { GradeResult, ThesisCase } from '../types.ts';

const DOUBT = /implausib|impossib|unrealistic|suspicious|anomal|erroneous|\berror\b|glitch|questionable|doubtful|unreliable|mistake|nonsensical|cannot be (?:right|correct|accurate)|can't be (?:right|correct|accurate)|data (?:issue|problem|quality)|likely (?:wrong|incorrect|a typo)|typo|verify|distort|artifact|bogus|meaningless|not meaningful|garbled|corrupt|misprint|(?:shouldn't|should not|can't|cannot) be (?:relied|trusted|taken at face)|(?:doesn't|does not) make sense/i;

// Applies to trap cases: some sentence must refer to any trap field (by label or its value) and cast doubt on it.
export function gradeTrap(output: string, { context, expect }: ThesisCase): GradeResult | null {
  const trap = expect.trap;
  if (!trap) return null;

  const { thesis, highlights } = parseThesisOutput(output);
  const fields = trap.fields.filter((f): f is NumericField => (NUMERIC_FIELDS as readonly string[]).includes(f));
  const sentences = [thesis, ...highlights].join('\n').split(/(?<=[.!?])\s+|\n+/).filter((s) => DOUBT.test(s));
  const refersTo = (s: string, field: NumericField) => {
    const value = context[field];
    return FIELD_LABELS[field].test(s.toLowerCase()) || (value !== null && extractFigures(s).some((f) => matches(f, value)));
  };
  const checks = Object.fromEntries(fields.map((f) => [f, sentences.some((s) => refersTo(s, f))]));
  const flagged = Object.values(checks).some(Boolean);

  return { pass: flagged, checks, notes: flagged ? [] : [`did not flag ${fields.join('/')}: ${trap.description}`] };
}
