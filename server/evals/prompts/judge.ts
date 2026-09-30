// Pairwise rubric for thesis reasoning quality: what the script graders can't score.
// Valuation math, verdict band, figures and format are graded by script, so the judge ignores them.

export type JudgeChoice = 'A' | 'B' | 'tie';

export const JUDGE_CRITERIA = ['meaning', 'moat', 'management', 'coherence'] as const;
export type JudgeCriterion = (typeof JUDGE_CRITERIA)[number];

export interface JudgeVerdict {
  criteria: Record<JudgeCriterion, JudgeChoice>;
  winner: JudgeChoice;
  reason: string;
}

export const JUDGE_SYSTEM = `You are a senior equity analyst reviewing two investment theses (A and B) written
for the same Philippine Stock Exchange company from the same source data. Both follow
Rule #1 (Phil Town) investing: Meaning, Moat, Management, Margin of Safety.

Judge only the quality of the investment reasoning, on four criteria:

1. meaning: Does the thesis show a correct, specific understanding of what the business
   does and how it makes money, grounded in the source data? Generic filler that could
   describe any company scores worse.
2. moat: Is the moat claim backed by evidence from the data (ROIC, margins, growth
   consistency, market position named in the description or disclosures), or merely
   asserted? A thesis that correctly says the moat is weak or unproven beats one that
   asserts a moat the numbers do not support.
3. management: Are management claims grounded in the disclosures and news in the source
   data? Inventing events, people, buybacks, insider buying or track records not in the
   data is a serious fault. Saying there is little evidence either way is acceptable.
4. coherence: Does the bottom line (buy, watch or pass) follow from the argument made in
   the thesis? A thesis that praises the business and the price but says pass, or lists
   red flags and still says buy without addressing them, is incoherent.

Ignore: writing style, length, formatting, whether the verdict matches a price band,
and whether individual figures are exactly right (those are checked separately). Do not
reward confidence or length for their own sake. Do not favor a thesis because of its
position (A or B).

For each criterion pick "A", "B" or "tie" (tie when neither is clearly better). Then pick
an overall winner weighing all four criteria, with invented facts weighing heavily.

Reply with only this JSON object, nothing before or after it:
{"meaning":"A|B|tie","moat":"A|B|tie","management":"A|B|tie","coherence":"A|B|tie","winner":"A|B|tie","reason":"<one or two sentences>"}`;

export function buildJudgePrompt(dataBlock: string, thesisA: string, thesisB: string): string {
  return `SOURCE DATA:
${dataBlock.trim()}

=== THESIS A ===
${thesisA.trim()}
=== END THESIS A ===

=== THESIS B ===
${thesisB.trim()}
=== END THESIS B ===`;
}

const isChoice = (v: unknown): v is JudgeChoice => v === 'A' || v === 'B' || v === 'tie';

// Last JSON object in the reply (models sometimes think out loud before it); null when malformed
export function parseJudgeOutput(text: string): JudgeVerdict | null {
  const matches = text.match(/\{[^{}]*\}/g);
  if (!matches) return null;
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(matches[matches.length - 1]) as Record<string, unknown>;
  } catch {
    return null;
  }
  const norm = (v: unknown) => (typeof v === 'string' ? (v.toLowerCase() === 'tie' ? 'tie' : v.toUpperCase()) : v);
  const winner = norm(raw.winner);
  const criteria = Object.fromEntries(JUDGE_CRITERIA.map((c) => [c, norm(raw[c])]));
  if (!isChoice(winner) || !Object.values(criteria).every(isChoice)) return null;
  return { criteria: criteria as Record<JudgeCriterion, JudgeChoice>, winner, reason: typeof raw.reason === 'string' ? raw.reason : '' };
}
