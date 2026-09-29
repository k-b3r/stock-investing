import { parseThesisOutput } from '../../scripts/thesis-context.ts';
import type { FormatGradeResult, ThesisCase } from '../types.ts';

const LEGAL_SUFFIX = /[,.]?\s+(inc|incorporated|corporation|corp|company|co|holdings)\.?$/i;
// First words too generic to identify a company on their own ("San" Miguel, "Bank" of the Philippine Islands)
const GENERIC_FIRST_WORDS = new Set(['the', 'bank', 'first', 'san', 'philippine', 'philippines', 'manila', 'metro', 'global', 'united', 'asia', 'pacific', 'international']);

// Ticker, full legal name, name without legal suffix, and first word when distinctive ("Jollibee" for Jollibee Foods Corporation).
function companyNames({ ticker, companyName }: ThesisCase['context']): string[] {
  let base = companyName;
  while (LEGAL_SUFFIX.test(base)) base = base.replace(LEGAL_SUFFIX, '');
  const first = base.split(/\s+/)[0].replace(/[^\p{L}\p{N}&-]/gu, '');
  const names = [ticker, companyName, base];
  if (first.length >= 4 && !GENERIC_FIRST_WORDS.has(first.toLowerCase())) names.push(first);
  return names.map((n) => n.toLowerCase());
}

// Without these generate-thesis.ts stores the thesis minus its verdict/highlights; the rest are style rules.
const USABLE_CHECKS = ['verdictParsed', 'threeHighlights'] as const;

// Checks the output follows THESIS_INSTRUCTIONS' shape, using the same parser generate-thesis.ts stores with.
// `pass` = all checks (format-perfect); `usable` = verdict and highlights parse, so the app shows them.
export function gradeFormat(output: string, testCase: ThesisCase): FormatGradeResult {
  const { thesis, verdict, highlights } = parseThesisOutput(output);
  const lines = thesis.split('\n').map((l) => l.trim()).filter(Boolean);
  const paragraphs = thesis.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

  // Everything after the first marker, so a repeated marker counts as trailing text
  const after = (text: string, marker: string) => (text.includes(marker) ? text.slice(text.indexOf(marker) + marker.length) : '');
  const highlightsSection = after(after(output, '---VERDICT---'), '---HIGHLIGHTS---');
  const trailing = highlightsSection.split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('- '));

  const header = lines.find((l) => l.startsWith('#'));
  const bullet = lines.find((l) => /^([-*•]|\d+[.)])\s/.test(l));
  const lower = thesis.toLowerCase();
  const names = companyNames(testCase.context);

  // Each check: [passed, note shown when it fails]
  const results = {
    verdictParsed: [verdict !== null, 'no parseable ---VERDICT--- line (buy/watch/pass)'],
    threeHighlights: [highlights.length === 3, `expected 3 highlights, got ${highlights.length}`],
    nothingAfterBlock: [trailing.length === 0, `text after highlights: "${trailing[0]?.slice(0, 60)}"`],
    paragraphs3to5: [paragraphs.length >= 3 && paragraphs.length <= 5, `expected 3-5 paragraphs, got ${paragraphs.length}`],
    noHeaders: [!header, `header in thesis: "${header?.slice(0, 60)}"`],
    noBullets: [!bullet, `bullet in thesis: "${bullet?.slice(0, 60)}"`],
    minLength: [thesis.length >= 500, `thesis only ${thesis.length} chars`],
    namesCompany: [names.some((n) => lower.includes(n)), `company never named (looked for: ${[...new Set(names)].join(', ')})`],
  } satisfies Record<string, [boolean, string]>;

  const checks = Object.fromEntries(Object.entries(results).map(([k, [ok]]) => [k, ok]));
  const notes = Object.values(results).filter(([ok]) => !ok).map(([, note]) => note);
  return { pass: notes.length === 0, usable: USABLE_CHECKS.every((k) => checks[k]), checks, notes };
}
