import { mkdir, readdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { parseArgs } from 'util';
import { complete } from './adapters/index.ts';
import { gradeFormat } from './graders/format.ts';
import { findModel } from './models.ts';
import { casesDir, judgeDir, judgeFile } from './paths.ts';
import { buildJudgePrompt, JUDGE_SYSTEM, parseJudgeOutput, type JudgeChoice, type JudgeVerdict } from './prompts/judge.ts';
import { loadResults, readJsonFiles } from './utils.ts';
import type { Completion, ModelSpec, RunResult, ThesisCase } from './types.ts';

// Opus 5.5 via the claude CLI (subscription). Any models.ts id can judge instead, for the bias check.
export const OPUS_JUDGE: ModelSpec = { id: 'opus', provider: 'claude-cli', model: 'claude-opus-5-5', price: null };

// Below this share of matching outcomes, the bias-check judge disagrees enough with Opus to need a user review
export const MIN_AGREEMENT = 0.7;

export interface JudgeCall {
  // Models shown as thesis A and B, in that order (the judge never sees these names)
  shown: [string, string];
  completion: Completion;
  verdict: JudgeVerdict | null;
}

export interface PairCaseResult {
  suite: 'thesis';
  caseId: string;
  // Sorted, so each pair has one directory
  models: [string, string];
  judge: string;
  // Run judged per model; startedAt tells a re-run apart from the judged one
  runs: Record<string, { runIndex: number; startedAt: string }>;
  judgedAt: string;
  // Same pair judged twice with A/B swapped
  calls: [JudgeCall, JudgeCall];
  // Winning model id, 'tie', or null when a call failed or was unparseable
  outcome: string | null;
}

// Every unordered pair of models, each sorted
export function roundRobin(models: string[]): [string, string][] {
  const sorted = [...new Set(models)].sort();
  return sorted.flatMap((a, i) => sorted.slice(i + 1).map((b): [string, string] => [a, b]));
}

// First run (lowest runIndex) of the model on the case that ran without error and is usable (verdict + highlights parse)
export function pickUsableRun(results: RunResult[], model: string, testCase: ThesisCase): RunResult | null {
  const runs = results
    .filter((r) => r.model === model && r.caseId === testCase.id && !r.completion.error)
    .sort((a, b) => a.runIndex - b.runIndex);
  return runs.find((r) => gradeFormat(r.completion.text, testCase).usable) ?? null;
}

// Maps each call's A/B choice back to a model. Both orders must pick the same model to win; disagreement is a tie
// (cancels position bias).
export function reconcileOrders(first: JudgeCall, second: JudgeCall): string | null {
  const pick = (call: JudgeCall): string | null => {
    if (!call.verdict) return null;
    const choice: JudgeChoice = call.verdict.winner;
    return choice === 'tie' ? 'tie' : call.shown[choice === 'A' ? 0 : 1];
  };
  const [x, y] = [pick(first), pick(second)];
  if (x === null || y === null) return null;
  return x === y ? x : 'tie';
}

async function judgeOnce(judge: ModelSpec, dataBlock: string, shown: [string, string], texts: Record<string, string>): Promise<JudgeCall> {
  const completion = await complete(judge, { system: JUDGE_SYSTEM, user: buildJudgePrompt(dataBlock, texts[shown[0]], texts[shown[1]]) });
  return { shown, completion, verdict: completion.error ? null : parseJudgeOutput(completion.text) };
}

export async function judgePairCase(judge: ModelSpec, testCase: ThesisCase, pair: [string, string], runs: [RunResult, RunResult]): Promise<PairCaseResult> {
  const texts = { [pair[0]]: runs[0].completion.text, [pair[1]]: runs[1].completion.text };
  const [a, b] = pair;
  const first = await judgeOnce(judge, testCase.dataBlock, [a, b], texts);
  const second = await judgeOnce(judge, testCase.dataBlock, [b, a], texts);
  return {
    suite: 'thesis',
    caseId: testCase.id,
    models: pair,
    judge: judge.id,
    runs: Object.fromEntries(runs.map((r) => [r.model, { runIndex: r.runIndex, startedAt: r.startedAt }])),
    judgedAt: new Date().toISOString(),
    calls: [first, second],
    outcome: reconcileOrders(first, second),
  };
}

export interface ScoreRow {
  rank: number;
  model: string;
  judged: number;
  wins: number;
  ties: number;
  losses: number;
  // (wins + ties/2) / judged
  score: number | null;
}

// Win/tie/loss per model against the other models, ranked by score. Failed judgments don't count.
export function buildJudgeScorecard(results: PairCaseResult[], models: string[]): ScoreRow[] {
  const rows = [...new Set(models)].map((model) => {
    const mine = results.filter((r) => r.outcome !== null && r.models.includes(model));
    const wins = mine.filter((r) => r.outcome === model).length;
    const ties = mine.filter((r) => r.outcome === 'tie').length;
    const judged = mine.length;
    return { rank: 0, model, judged, wins, ties, losses: judged - wins - ties, score: judged ? (wins + ties / 2) / judged : null };
  });
  rows.sort((x, y) => (y.score ?? -1) - (x.score ?? -1) || x.model.localeCompare(y.model));
  // Equal scores share a rank
  rows.forEach((r, i) => (r.rank = i > 0 && rows[i - 1].score === r.score ? rows[i - 1].rank : i + 1));
  return rows;
}

const pairKey = (r: Pick<PairCaseResult, 'models' | 'caseId'>) => `${r.models.join('-vs-')}/${r.caseId}`;

export interface Agreement {
  compared: number;
  agreed: number;
  disagreements: { key: string; opus: string; other: string }[];
}

// Same outcome (winning model or tie) from Opus and the bias-check judge, on pair-cases both judged
export function agreement(opus: PairCaseResult[], other: PairCaseResult[]): Agreement {
  const byKey = new Map(opus.filter((r) => r.outcome !== null).map((r) => [pairKey(r), r.outcome!]));
  const both = other.filter((r) => r.outcome !== null && byKey.has(pairKey(r)));
  const disagreements = both
    .filter((r) => byKey.get(pairKey(r)) !== r.outcome)
    .map((r) => ({ key: pairKey(r), opus: byKey.get(pairKey(r))!, other: r.outcome! }));
  return { compared: both.length, agreed: both.length - disagreements.length, disagreements };
}

// n pair-cases Opus judged, evenly spread, skipping pairs that include the bias-check judge (it would judge itself)
export function biasSample(opus: PairCaseResult[], judge: string, n: number): PairCaseResult[] {
  // Sorted by case first, so the sample spreads across cases before pairs
  const key = (r: PairCaseResult) => `${r.caseId}/${r.models.join('-vs-')}`;
  const pool = opus.filter((r) => r.outcome !== null && !r.models.includes(judge)).sort((x, y) => key(x).localeCompare(key(y)));
  if (pool.length <= n) return pool;
  return Array.from({ length: n }, (_, i) => pool[Math.floor((i * pool.length) / n)]);
}

export async function loadJudgeResults(judge: string): Promise<PairCaseResult[]> {
  const root = judgeDir('thesis', judge);
  const pairs = await readdir(root).catch(() => [] as string[]);
  return (await Promise.all(pairs.map((p) => readJsonFiles<PairCaseResult>(path.join(root, p))))).flat();
}

const pct = (x: number | null) => (x === null ? 'N/A' : `${Math.round(x * 100)}%`);

function printTable(rows: Record<string, string>[]): void {
  const headers = Object.keys(rows[0]);
  const widths = headers.map((h) => Math.max(h.length, ...rows.map((r) => r[h].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log(line(headers));
  console.log(line(widths.map((w) => '-'.repeat(w))));
  for (const r of rows) console.log(line(headers.map((h) => r[h])));
}

export function printJudgeScorecard(results: PairCaseResult[], models: string[], judge: string): void {
  const inScope = results.filter((r) => r.models.every((m) => models.includes(m)));
  if (inScope.length === 0) {
    console.log(`\nNo ${judge} judgments for these models.`);
    return;
  }
  console.log(`\nJudge scorecard: thesis reasoning (${judge}, round-robin, both orders must agree to win)\n`);
  printTable(
    buildJudgeScorecard(inScope, models).map((r) => ({
      rank: String(r.rank),
      model: r.model,
      judged: String(r.judged),
      win: `${r.wins} (${pct(r.judged ? r.wins / r.judged : null)})`,
      tie: `${r.ties} (${pct(r.judged ? r.ties / r.judged : null)})`,
      loss: `${r.losses} (${pct(r.judged ? r.losses / r.judged : null)})`,
      score: pct(r.score),
    }))
  );
  console.log('\nHead to head:');
  for (const [a, b] of roundRobin(models)) {
    const rs = inScope.filter((r) => r.models[0] === a && r.models[1] === b);
    const count = (o: string | null) => rs.filter((r) => r.outcome === o).length;
    console.log(`  ${a} ${count(a)}, tie ${count('tie')}, ${b} ${count(b)}${count(null) ? `, failed ${count(null)}` : ''}`);
  }
  console.log('\nscore = (wins + ties/2) / judged. Failed judgments (judge error or unparseable reply) are excluded.');
}

function printAgreement(a: Agreement, judge: string): void {
  if (a.compared === 0) {
    console.log(`\nBias check: no pair-cases judged by both opus and ${judge}.`);
    return;
  }
  const share = a.agreed / a.compared;
  console.log(`\nBias check: ${judge} agrees with opus on ${a.agreed}/${a.compared} (${pct(share)})`);
  for (const d of a.disagreements) console.log(`  ${d.key}: opus ${d.opus}, ${judge} ${d.other}`);
  if (share < MIN_AGREEMENT) console.log(`LOW AGREEMENT (< ${pct(MIN_AGREEMENT)}): review the disagreements above before trusting the Opus ranking.`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      models: { type: 'string' },
      cases: { type: 'string' },
      // opus (default) or a models.ts id for the bias check
      judge: { type: 'string', default: 'opus' },
      // Bias check: judge this many pair-cases already judged by Opus, then report agreement
      sample: { type: 'string' },
      concurrency: { type: 'string', default: '3' },
      redo: { type: 'boolean', default: false },
    },
  });
  const models = values.models?.split(',').map((m) => m.trim()).filter(Boolean) ?? [];
  if (models.length < 2) {
    console.error('Usage: pnpm eval:judge --models a,b[,c...] [--cases x,y] [--judge opus|<model>] [--sample N] [--concurrency 3] [--redo]');
    process.exit(1);
  }
  models.forEach(findModel);
  const judge = values.judge === 'opus' ? OPUS_JUDGE : findModel(values.judge);
  if (judge.id !== 'opus' && !values.sample) {
    console.error('A non-Opus judge is only for the bias check: pass --sample N');
    process.exit(1);
  }

  const wanted = values.cases?.split(',').map((c) => c.trim().toLowerCase());
  const cases = (await readJsonFiles<ThesisCase>(casesDir('thesis'))).filter((c) => !wanted || wanted.includes(c.id));
  const caseById = new Map(cases.map((c) => [c.id, c]));
  const results = await loadResults('thesis');
  const opusResults = await loadJudgeResults('opus');

  let todo: { testCase: ThesisCase; pair: [string, string] }[] = roundRobin(models).flatMap((pair) => cases.map((testCase) => ({ testCase, pair })));
  if (values.sample) {
    const keys = new Set(biasSample(opusResults.filter((r) => caseById.has(r.caseId) && r.models.every((m) => models.includes(m))), judge.id, Number(values.sample)).map(pairKey));
    todo = todo.filter((t) => keys.has(pairKey({ models: t.pair, caseId: t.testCase.id })));
  }

  let unusable = 0;
  let missing = 0;
  const jobs: { testCase: ThesisCase; pair: [string, string]; runs: [RunResult, RunResult]; file: string }[] = [];
  for (const { testCase, pair } of todo) {
    const runs = pair.map((m) => pickUsableRun(results, m, testCase));
    if (!runs[0] || !runs[1]) {
      if (pair.every((m) => results.some((r) => r.model === m && r.caseId === testCase.id))) unusable++;
      else missing++;
      continue;
    }
    const file = judgeFile('thesis', judge.id, pair, testCase.id);
    const existing = await readFile(file, 'utf8').then((s) => JSON.parse(s) as PairCaseResult, () => null);
    const sameRuns = existing && pair.every((m, i) => existing.runs[m]?.runIndex === runs[i]!.runIndex && existing.runs[m]?.startedAt === runs[i]!.startedAt);
    if (!values.redo && existing && existing.outcome !== null && sameRuns) continue;
    jobs.push({ testCase, pair, runs: runs as [RunResult, RunResult], file });
  }

  console.log(
    `Judge ${judge.id}: ${jobs.length} pair-case(s) to judge (2 calls each), ${todo.length - jobs.length - unusable - missing} already judged, ` +
      `${unusable} skipped (a model has no usable run), ${missing} not run by both models\n`
  );

  const queue = [...jobs];
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const r = await judgePairCase(judge, job.testCase, job.pair, job.runs);
      await mkdir(path.dirname(job.file), { recursive: true });
      await writeFile(job.file, JSON.stringify(r, null, 2) + '\n');
      const failed = r.calls.find((c) => !c.verdict);
      const note = failed ? `FAILED: ${failed.completion.error ?? `unparseable reply: ${failed.completion.text.slice(0, 120)}`}` : r.outcome;
      console.log(`${job.pair.join(' vs ').padEnd(40)} ${job.testCase.id.padEnd(20)} → ${note}`);
    }
  };
  await Promise.all(Array.from({ length: Number(values.concurrency) }, worker));

  const inCases = (rs: PairCaseResult[]) => rs.filter((r) => caseById.has(r.caseId));
  if (judge.id === 'opus') printJudgeScorecard(inCases(await loadJudgeResults('opus')), models, 'opus');
  else printAgreement(agreement(inCases(opusResults), inCases(await loadJudgeResults(judge.id))), judge.id);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
