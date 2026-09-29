import { parseThesisOutput } from '../../scripts/thesis-context.ts';
import type { GradeResult, ThesisCase } from '../types.ts';

// Checks the output follows THESIS_INSTRUCTIONS' shape, using the same parser generate-thesis.ts stores with.
export function gradeFormat(output: string, testCase: ThesisCase): GradeResult {
  const notes: string[] = [];
  const { thesis, verdict, highlights } = parseThesisOutput(output);
  const lines = thesis.split('\n').map((l) => l.trim()).filter(Boolean);
  const paragraphs = thesis.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  const blockPart = output.split('---VERDICT---')[1] ?? '';
  const highlightsSection = blockPart.split('---HIGHLIGHTS---')[1] ?? '';
  const trailing = highlightsSection.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('- '));

  const lower = thesis.toLowerCase();
  const checks = {
    verdictParsed: verdict !== null,
    threeHighlights: highlights.length === 3,
    nothingAfterBlock: trailing.length === 0,
    paragraphs3to5: paragraphs.length >= 3 && paragraphs.length <= 5,
    noHeaders: !lines.some((l) => l.startsWith('#')),
    noBullets: !lines.some((l) => /^([-*•]|\d+[.)])\s/.test(l)),
    minLength: thesis.length >= 500,
    namesCompany: lower.includes(testCase.context.ticker.toLowerCase()) || lower.includes(testCase.context.companyName.toLowerCase()),
  };

  if (!checks.verdictParsed) notes.push('no parseable ---VERDICT--- line (buy/watch/pass)');
  if (!checks.threeHighlights) notes.push(`expected 3 highlights, got ${highlights.length}`);
  if (!checks.nothingAfterBlock) notes.push(`text after highlights: "${trailing[0].slice(0, 60)}"`);
  if (!checks.paragraphs3to5) notes.push(`expected 3-5 paragraphs, got ${paragraphs.length}`);
  if (!checks.minLength) notes.push(`thesis only ${thesis.length} chars`);

  return { pass: Object.values(checks).every(Boolean), checks, notes };
}
