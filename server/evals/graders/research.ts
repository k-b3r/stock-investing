import type { AnswerKey, ResearchCase, ResearchGradeResult } from '../types.ts';

export interface ResearchOutput {
  found: boolean;
  answer: string | null;
  docId: string | null;
}

// Models are asked for bare JSON; tolerate code fences and prose around it.
export function parseResearchOutput(output: string): ResearchOutput | null {
  const start = output.indexOf('{');
  const end = output.lastIndexOf('}');
  if (start === -1 || end < start) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(output.slice(start, end + 1));
  } catch {
    return null;
  }
  if (typeof raw !== 'object' || raw === null) return null;
  const { found, answer, docId } = raw as Record<string, unknown>;
  if (typeof found !== 'boolean') return null;
  return {
    found,
    answer: typeof answer === 'string' && answer.trim() ? answer.trim() : null,
    docId: typeof docId === 'string' && docId.trim() ? docId.trim().toLowerCase() : null,
  };
}

const SCALES: Record<string, number> = {
  thousand: 1e3, k: 1e3, million: 1e6, mn: 1e6, m: 1e6, billion: 1e9, bn: 1e9, b: 1e9, trillion: 1e12,
};

// Every number in the text, scaled by a following "million"/"B"/etc. "P3.2 billion" → 3.2e9, "P1,000,000" → 1e6.
export function extractAmounts(text: string): number[] {
  const re = /(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?\s*(trillion|billion|million|thousand|bn|mn|[bmk])?(?![a-z])/gi;
  return [...text.matchAll(re)].map((m) => {
    const n = Number(m[1].replaceAll(',', '') + (m[2] ?? ''));
    return m[3] ? n * SCALES[m[3].toLowerCase()] : n;
  });
}

export function extractPercents(text: string): number[] {
  const re = /(\d+(?:\.\d+)?)\s*(?:%|percent\b|per cent\b)/gi;
  return [...text.matchAll(re)].map((m) => Number(m[1]));
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?';
const monthNum = (name: string) => MONTHS.indexOf(name.slice(0, 3).toLowerCase()) + 1;

const iso = (y: string, m: number, d: string) => `${y}-${String(m).padStart(2, '0')}-${d.padStart(2, '0')}`;

// Dates written as 2026-03-05, March 5, 2026 or 5 March 2026, as YYYY-MM-DD.
export function extractDates(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})(?!\d)/g)) out.push(iso(m[1], Number(m[2]), m[3]));
  for (const m of text.matchAll(new RegExp(`\\b${MONTH}\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})(?!\\d)`, 'gi'))) {
    out.push(iso(m[3], monthNum(m[1]), m[2]));
  }
  for (const m of text.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH},?\\s+(\\d{4})(?!\\d)`, 'gi'))) {
    out.push(iso(m[3], monthNum(m[2]), m[1]));
  }
  return out;
}

const normalize = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Whether the text states the key's answer. Used on both the model's answer and the cited doc.
export function containsAnswer(text: string, key: AnswerKey): boolean {
  switch (key.kind) {
    case 'amount': {
      const tol = key.tolerance ?? 0.005;
      return extractAmounts(text).some((n) => Math.abs(n - key.value) <= tol * Math.abs(key.value));
    }
    case 'percent': {
      const tol = key.tolerance ?? 0.05;
      return extractPercents(text).some((n) => Math.abs(n - key.value) <= tol);
    }
    case 'date':
      return extractDates(text).includes(key.value);
    case 'text': {
      const haystack = ` ${normalize(text)} `;
      return key.accept.some((a) => haystack.includes(` ${normalize(a)} `));
    }
    case 'not_found':
      return false;
  }
}

// Answer correctness, citation (exists, contains the answer, is a primary source) and not-found handling.
export function gradeResearch(output: string, testCase: ResearchCase): ResearchGradeResult {
  const parsed = parseResearchOutput(output);
  if (!parsed) {
    return { pass: false, checks: { parsed: false }, notes: ['output is not JSON with a boolean "found"'], found: null, citedSourceType: null };
  }

  const key = testCase.answer;
  const answerable = key.kind !== 'not_found';
  const results: Record<string, [boolean, string]> = {
    parsed: [true, ''],
    notFoundHandled: [
      parsed.found === answerable,
      answerable ? 'said not found, but the bundle has the answer' : 'answered, but the bundle has no answer',
    ],
  };

  const cited = testCase.docs.find((d) => d.id === parsed.docId) ?? null;
  if (answerable) {
    results.correct = [parsed.answer !== null && containsAnswer(parsed.answer, key), `answer "${parsed.answer ?? ''}" does not match key`];
    results.citedDocExists = [cited !== null, `cited doc "${parsed.docId ?? ''}" is not in the bundle`];
    results.citedHasAnswer = [cited !== null && containsAnswer(`${cited.title}\n${cited.text}`, key), 'cited doc does not contain the answer'];
    results.citedPrimary = [cited?.sourceType === 'primary', `cited a ${cited?.sourceType ?? 'missing'} source, not the primary filing`];
  }

  const checks = Object.fromEntries(Object.entries(results).map(([k, [ok]]) => [k, ok]));
  const notes = Object.values(results).filter(([ok]) => !ok).map(([, note]) => note);
  return {
    pass: notes.length === 0,
    checks,
    notes,
    found: parsed.found,
    citedSourceType: cited?.sourceType ?? null,
  };
}
