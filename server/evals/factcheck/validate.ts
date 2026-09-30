import { normalize } from './grader.ts';
import type { PlantedError, TextEdit } from './types.ts';

const count = (haystack: string, needle: string) => (needle ? haystack.split(needle).length - 1 : 0);

// Applies find/replace edits in order; throws unless each find occurs exactly once.
export function applyEdits(text: string, edits: TextEdit[]): string {
  let out = text;
  for (const e of edits) {
    const n = count(out, e.find);
    if (n !== 1) throw new Error(`edit find occurs ${n} times: "${e.find.slice(0, 80)}"`);
    out = out.replace(e.find, () => e.replace);
  }
  return out;
}

// Problems that make a planted error ungradeable or ambiguous; empty = usable.
export function validatePlanted(e: PlantedError, thesis: string, dataBlock: string): string[] {
  const problems: string[] = [];
  const has = (hay: string, s: string) => normalize(hay).includes(normalize(s));
  if (count(thesis, e.original) !== 1) problems.push(`original occurs ${count(thesis, e.original)} times in thesis`);
  if (e.claim === e.original) problems.push('claim equals original');
  if (!e.sourceQuote || !dataBlock.includes(e.sourceQuote)) problems.push(`sourceQuote not verbatim in source: "${e.sourceQuote}"`);
  if (!Array.isArray(e.match) || e.match.length === 0) problems.push('no match strings');
  for (const m of e.match ?? []) {
    if (!m.trim()) problems.push('empty match string');
    else if (!has(e.claim, m)) problems.push(`match "${m}" not in claim`);
    else if (has(dataBlock, m)) problems.push(`match "${m}" appears in source`);
    else if (has(thesis, m)) problems.push(`match "${m}" appears in clean thesis`);
  }
  return problems;
}
