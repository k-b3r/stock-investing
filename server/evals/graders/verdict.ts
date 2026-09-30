import { parseThesisOutput, type Verdict } from '../../scripts/thesis-context.ts';
import type { GradeResult, ThesisCase } from '../types.ts';

// Verdict must be in the case's allowedVerdicts (band default from bands.ts, or a per-case override)
export function gradeVerdict(output: string, { expect }: ThesisCase): GradeResult {
  const { verdict } = parseThesisOutput(output);
  const ok = verdict !== null && expect.allowedVerdicts.includes(verdict);
  const note = `verdict ${verdict ?? 'missing'}, ${expect.band} allows ${expect.allowedVerdicts.join('/')}`;
  return { pass: ok, checks: { verdictAllowed: ok }, notes: ok ? [] : [note] };
}

const RANK: Record<Verdict, number> = { pass: 0, watch: 1, buy: 2 };

// Most common verdict across runs; null when none parsed or tied
export function modalVerdict(verdicts: (Verdict | null)[]): Verdict | null {
  const counts = new Map<Verdict, number>();
  for (const v of verdicts) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  return sorted.length === 0 || sorted[1]?.[1] === sorted[0][1] ? null : sorted[0][0];
}

// Price-shift pair: same company, only the price changed. A lower price must move the verdict
// toward buy, a higher one toward pass.
export function gradePriceShift(base: { price: number | null; verdict: Verdict | null }, shifted: { price: number | null; verdict: Verdict | null }): GradeResult {
  if (base.price === null || shifted.price === null || base.price === shifted.price) {
    return { pass: false, checks: { moved: false }, notes: ['pair has no price difference'] };
  }
  if (!base.verdict || !shifted.verdict) return { pass: false, checks: { moved: false }, notes: ['verdict missing in base or shifted case'] };
  const cheaper = shifted.price < base.price;
  const delta = RANK[shifted.verdict] - RANK[base.verdict];
  const moved = cheaper ? delta > 0 : delta < 0;
  const note = `price ${base.price} → ${shifted.price}, verdict ${base.verdict} → ${shifted.verdict} (expected toward ${cheaper ? 'buy' : 'pass'})`;
  return { pass: moved, checks: { moved }, notes: moved ? [] : [note] };
}

// Same verdict on every run of a case; needs 2+ runs
export function gradeConsistency(verdicts: (Verdict | null)[]): GradeResult | null {
  if (verdicts.length < 2) return null;
  const consistent = verdicts[0] !== null && verdicts.every((v) => v === verdicts[0]);
  return { pass: consistent, checks: { consistent }, notes: consistent ? [] : [`verdicts: ${verdicts.map((v) => v ?? 'missing').join(', ')}`] };
}
