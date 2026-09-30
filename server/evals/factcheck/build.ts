import { readdir, readFile, unlink, writeFile } from 'fs/promises';
import path from 'path';
import { readJsonFiles } from '../utils.ts';
import { findFigureMentions, plantCurrencyError, plantSizeError, roundingNonError } from './mutations.ts';
import { basesDir, factCheckCasesDir, reviewFile, verificationFile } from './paths.ts';
import { validatePlanted } from './validate.ts';
import type { ErrorType, FactCheckBase, FactCheckCase, NonError, PlantedError, Verification } from './types.ts';

// Turns drafted bases into the committed case set: ~40 planted-error cases balanced across error
// types (max 2 per ticker, LLM drafts first, script mutations only to fill a short type) and
// ~15 clean cases (plain, rounding-only, founding-year). Keeps `approved` on cases whose content is unchanged.

const TYPES: ErrorType[] = ['size', 'direction', 'year', 'units', 'stake', 'currency'];
const PLANTED_TARGET = 40;
const MAX_PLANTED_PER_TICKER = 2;
const CLEAN_PLAIN = 9;
const CLEAN_ROUNDING = 5;

type Candidate = { base: FactCheckBase; error: PlantedError; origin: FactCheckCase['origin']; thesis: string };

// Past production failures (see REAL_FAILURES in draft.ts), recognised by their planted values
const isRealFailure = (ticker: string, e: PlantedError) =>
  (ticker === 'KEEPR' && e.type === 'stake' && /30%/.test(e.claim) && /pernod/i.test(e.claim)) || (ticker === 'PPC' && /3\.72/.test(e.claim));

function draftedCandidates(base: FactCheckBase): Candidate[] {
  return (base.candidates ?? [])
    .filter((e) => validatePlanted(e, base.thesis!, base.dataBlock).length === 0)
    .map((error) => ({ base, error, origin: isRealFailure(base.ticker, error) ? 'real' : 'drafted', thesis: base.thesis!.replace(error.original, () => error.claim) }));
}

function scriptCandidates(base: FactCheckBase): Candidate[] {
  const thesis = base.thesis!;
  const out: Candidate[] = [];
  for (const m of findFigureMentions(thesis, base.context)) {
    const muts = [plantSizeError(thesis, base.dataBlock, m), m.unit === '₱' ? plantCurrencyError(thesis, base.dataBlock, m) : null];
    for (const mut of muts) {
      if (mut && validatePlanted(mut.record, thesis, base.dataBlock).length === 0) out.push({ base, error: mut.record, origin: 'script', thesis: mut.thesis });
    }
  }
  return out;
}

export function selectPlanted(bases: FactCheckBase[]): Candidate[] {
  const drafted = bases.flatMap(draftedCandidates);
  const script = bases.flatMap(scriptCandidates);
  const picked: Candidate[] = [];
  const perTicker = new Map<string, number>();
  const used = (c: Candidate) => perTicker.get(c.base.ticker) ?? 0;
  const take = (c: Candidate) => {
    picked.push(c);
    perTicker.set(c.base.ticker, used(c) + 1);
  };

  // One reproduction per past failure
  for (const c of drafted.filter((c) => c.origin === 'real')) if (!picked.some((p) => p.base === c.base && p.origin === 'real')) take(c);

  // Round-robin over types; within a type, least-used ticker first, then alphabetical for stable output
  const pool = { drafted: drafted.filter((c) => c.origin !== 'real'), script };
  const next = (type: ErrorType, from: Candidate[]) =>
    from
      .filter((c) => c.error.type === type && used(c) < MAX_PLANTED_PER_TICKER && !picked.some((p) => p.base === c.base && p.error.type === type))
      .sort((a, b) => used(a) - used(b) || a.base.ticker.localeCompare(b.base.ticker))[0];
  while (picked.length < PLANTED_TARGET) {
    let progressed = false;
    const counts = (t: ErrorType) => picked.filter((p) => p.error.type === t).length;
    for (const type of [...TYPES].sort((a, b) => counts(a) - counts(b) || TYPES.indexOf(a) - TYPES.indexOf(b))) {
      if (picked.length >= PLANTED_TARGET) break;
      const c = next(type, pool.drafted) ?? next(type, pool.script);
      if (!c) continue;
      take(c);
      progressed = true;
      break;
    }
    if (!progressed) break;
  }
  return picked;
}

function cleanCases(bases: FactCheckBase[], planted: Candidate[]): FactCheckCase[] {
  const plantedCount = (b: FactCheckBase) => planted.filter((p) => p.base === b).length;
  const byLeastPlanted = [...bases].sort((a, b) => plantedCount(a) - plantedCount(b) || a.ticker.localeCompare(b.ticker));
  const cases: FactCheckCase[] = [];
  const mk = (base: FactCheckBase, suffix: string, thesis: string, nonErrors: NonError[]): FactCheckCase => ({
    id: `${base.ticker.toLowerCase()}-${suffix}`, suite: 'factcheck', ticker: base.ticker, origin: 'clean', draftedBy: base.drafted?.model ?? null, dataBlock: base.dataBlock, thesis, errors: [], nonErrors, approved: false, verification: null,
  });

  for (const base of bases) {
    for (const ne of base.nonErrorCandidates ?? []) cases.push(mk(base, ne.type, base.thesis!.replace(ne.original, () => ne.text), [ne]));
  }

  let rounding = 0;
  for (const base of byLeastPlanted) {
    if (rounding >= CLEAN_ROUNDING) break;
    // Up to 2 rounding changes, applied last-first so earlier indexes stay valid
    const mentions = findFigureMentions(base.thesis!, base.context).filter((m) => roundingNonError(base.thesis!, m)).slice(0, 2).reverse();
    if (mentions.length === 0) continue;
    let thesis = base.thesis!;
    const nonErrors: NonError[] = [];
    for (const m of mentions) {
      const r = roundingNonError(thesis, m)!;
      thesis = r.thesis;
      nonErrors.unshift(r.record);
    }
    cases.push(mk(base, 'rounding', thesis, nonErrors));
    rounding++;
  }

  const taken = new Set(cases.map((c) => c.ticker));
  for (const base of byLeastPlanted.filter((b) => !taken.has(b.ticker)).slice(0, CLEAN_PLAIN)) cases.push(mk(base, 'clean', base.thesis!, []));
  return cases;
}

const sameContent = (a: FactCheckCase, b: FactCheckCase) =>
  JSON.stringify({ ...a, approved: null, verification: null }) === JSON.stringify({ ...b, approved: null, verification: null });

function renderReview(cases: FactCheckCase[], bases: FactCheckBase[]): string {
  const q = (s: string) => s.replace(/\n+/g, ' ').replace(/\|/g, '\\|');
  const lines = [
    '# Fact-check eval: case review',
    '',
    'Generated by `pnpm eval:factcheck:build`. Approve by reviewing each row; rejected ids get fixed or dropped, then `approved: true` is set in the case files.',
    '',
    `${cases.filter((c) => c.errors.length).length} planted-error cases, ${cases.filter((c) => !c.errors.length).length} clean cases, ${cases.filter((c) => c.approved).length} approved.`,
    `Web verification (\`review/verification.json\`): ${(['verified', 'source-only', 'conflict'] as const).map((s) => `${cases.filter((c) => c.verification?.status === s).length} ${s}`).join(', ')}, ${cases.filter((c) => !c.verification).length} unchecked.`,
    '',
    '## Conflicts for user',
    '',
    'Source data vs web disagree, sources disagree, or fewer than 2 independent sources. Decide per case: keep, fix, or drop.',
    '',
    ...cases.filter((c) => c.verification?.status === 'conflict').flatMap((c) => [
      `- **${c.id}** (checked ${c.verification!.checkedAt}): ${c.verification!.notes}${c.verification!.resolution ? ` **Decision:** ${c.verification!.resolution}` : ''}`,
      ...c.verification!.sources.map((u) => `  - ${u}`),
    ]),
    '',
    '## Planted errors',
    '',
    '| id | web check | origin | type | thesis before | thesis after (planted) | source says | grader matches |',
    '|---|---|---|---|---|---|---|---|',
    ...cases.flatMap((c) => c.errors.map((e) => `| ${c.approved ? '✅ ' : ''}${c.id} | ${c.verification?.status ?? 'unchecked'} | ${c.origin} | ${e.type} | ${q(e.original)} | ${q(e.claim)} | ${q(e.trueValue)} (\`${q(e.sourceQuote)}\`) | ${e.match.map((m) => `\`${q(m)}\``).join(', ')} |`)),
    '',
    '## Clean cases (must get an empty list)',
    '',
    '| id | web check | non-errors planted |',
    '|---|---|---|',
    ...cases.filter((c) => !c.errors.length).map((c) => `| ${c.approved ? '✅ ' : ''}${c.id} | ${c.verification?.status ?? 'unchecked'} | ${c.nonErrors.map((n) => `${n.type}: "${q(n.text.length > 160 ? '…' + n.text.slice(-160) : n.text)}" (${q(n.note)})`).join('<br>') || 'none'} |`),
    '',
    '## Clean copies: edits to the stored theses',
    '',
    'Each base thesis was edited to agree with its frozen source (`cases/factcheck/bases/<ticker>.json`: `storedThesis` → `thesis`). Every case above builds on the edited thesis.',
    '',
    ...bases.flatMap((b) => [
      `### ${b.ticker}${b.reconcileEdits.length ? '' : ' (no edits)'}`,
      '',
      ...b.reconcileEdits.map((e) => `- "${q(e.find)}" → "${q(e.replace)}": ${q(e.reason)}`),
      '',
    ]),
  ];
  return lines.join('\n');
}

async function main() {
  const bases = (await readJsonFiles<FactCheckBase>(basesDir)).filter((b) => b.thesis !== null).sort((a, b) => a.ticker.localeCompare(b.ticker));
  const planted = selectPlanted(bases);
  const idCount = new Map<string, number>();
  const plantedCases: FactCheckCase[] = planted.map((c) => {
    const key = `${c.base.ticker.toLowerCase()}-${c.error.type}`;
    idCount.set(key, (idCount.get(key) ?? 0) + 1);
    const n = idCount.get(key)!;
    return { id: n === 1 ? key : `${key}-${n}`, suite: 'factcheck', ticker: c.base.ticker, origin: c.origin, draftedBy: c.base.drafted?.model ?? null, dataBlock: c.base.dataBlock, thesis: c.thesis, errors: [c.error], nonErrors: [], approved: false, verification: null };
  });
  const cases = [...plantedCases, ...cleanCases(bases, planted)];

  const verification = JSON.parse(await readFile(verificationFile, 'utf8').catch(() => '{}')) as Record<string, Verification>;
  for (const c of cases) c.verification = verification[c.id] ?? null;

  const existing = new Map((await readJsonFiles<FactCheckCase>(factCheckCasesDir)).map((c) => [c.id, c]));
  for (const c of cases) {
    const old = existing.get(c.id);
    if (old && sameContent(old, c)) c.approved = old.approved;
  }

  for (const f of (await readdir(factCheckCasesDir)).filter((f) => f.endsWith('.json'))) await unlink(path.join(factCheckCasesDir, f));
  for (const c of cases) await writeFile(path.join(factCheckCasesDir, `${c.id}.json`), JSON.stringify(c, null, 2) + '\n');
  await writeFile(reviewFile, renderReview(cases, bases));

  const byType = TYPES.map((t) => `${t} ${plantedCases.filter((c) => c.errors[0].type === t).length}`).join(', ');
  const byOrigin = ['real', 'drafted', 'script'].map((o) => `${o} ${plantedCases.filter((c) => c.origin === o).length}`).join(', ');
  console.log(`${plantedCases.length} planted (${byType}; ${byOrigin}), ${cases.length - plantedCases.length} clean. Review: ${path.relative(process.cwd(), reviewFile)}`);
}

if (process.argv[1] === new URL(import.meta.url).pathname) await main();
