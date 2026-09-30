import { beforeEach, describe, expect, it, vi } from 'vitest';
import { areit, areitThesis, areitWeakThesis, withContext } from './graders/fixtures.ts';
import { agreement, biasSample, buildJudgeScorecard, judgePairCase, OPUS_JUDGE, pickUsableRun, reconcileOrders, roundRobin, type JudgeCall, type PairCaseResult } from './judge.ts';
import type { CompletionRequest, RunResult } from './types.ts';

const { complete } = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock('./adapters/index.ts', () => ({ complete }));

const run = (model: string, runIndex: number, text: string, error: string | null = null, caseId = 'areit'): RunResult => ({
  suite: 'thesis',
  caseId,
  model,
  runIndex,
  startedAt: '2026-09-30T00:00:00Z',
  completion: { text, inputTokens: 100, outputTokens: 50, costUsd: 0.01, latencyMs: 1000, error },
  grades: {},
});

const verdictJson = (winner: string) => `{"meaning":"${winner}","moat":"${winner}","management":"${winner}","coherence":"${winner}","winner":"${winner}","reason":"r"}`;
const call = (shown: [string, string], winner: 'A' | 'B' | 'tie' | null): JudgeCall => ({
  shown,
  completion: { text: '', inputTokens: null, outputTokens: null, costUsd: null, latencyMs: 0, error: null },
  verdict: winner ? { criteria: { meaning: winner, moat: winner, management: winner, coherence: winner }, winner, reason: '' } : null,
});
const pc = (models: [string, string], caseId: string, outcome: string | null, judge = 'opus'): PairCaseResult => ({
  suite: 'thesis',
  caseId,
  models,
  judge,
  runs: {},
  judgedAt: '',
  calls: [call(models, null), call([models[1], models[0]], null)],
  outcome,
});

describe('roundRobin', () => {
  it('lists every unordered pair once, sorted', () => {
    expect(roundRobin(['glm', 'kimi', 'deepseek', 'glm'])).toEqual([
      ['deepseek', 'glm'],
      ['deepseek', 'kimi'],
      ['glm', 'kimi'],
    ]);
  });
});

describe('pickUsableRun', () => {
  it('takes the lowest usable run, skipping errors and unusable output', () => {
    const results = [run('m', 3, areitThesis), run('m', 1, '', 'timeout'), run('m', 2, 'no verdict block'), run('other', 1, areitThesis)];
    expect(pickUsableRun(results, 'm', areit)?.runIndex).toBe(3);
    expect(pickUsableRun([run('m', 1, 'no verdict block')], 'm', areit)).toBeNull();
    expect(pickUsableRun([run('m', 1, areitThesis, null, 'bdo')], 'm', areit)).toBeNull();
  });
});

describe('reconcileOrders', () => {
  it('awards the win only when both orders pick the same model', () => {
    expect(reconcileOrders(call(['x', 'y'], 'A'), call(['y', 'x'], 'B'))).toBe('x');
    expect(reconcileOrders(call(['x', 'y'], 'B'), call(['y', 'x'], 'A'))).toBe('y');
  });

  it('calls position-biased disagreement or any tie a tie', () => {
    expect(reconcileOrders(call(['x', 'y'], 'A'), call(['y', 'x'], 'A'))).toBe('tie');
    expect(reconcileOrders(call(['x', 'y'], 'A'), call(['y', 'x'], 'tie'))).toBe('tie');
  });

  it('is null when a call failed', () => {
    expect(reconcileOrders(call(['x', 'y'], 'A'), call(['y', 'x'], null))).toBeNull();
  });
});

describe('judgePairCase', () => {
  beforeEach(() => {
    complete.mockReset();
  });

  it('judges blind, twice with the order swapped', async () => {
    // Judge always prefers the grounded thesis, wherever it is shown
    complete.mockImplementation(async (_spec: unknown, req: CompletionRequest) => ({
      text: verdictJson(req.user.indexOf(areitThesis) < req.user.indexOf(areitWeakThesis) ? 'A' : 'B'),
      inputTokens: null, outputTokens: null, costUsd: null, latencyMs: 0, error: null,
    }));
    const r = await judgePairCase(OPUS_JUDGE, areit, ['good-model', 'weak-model'], [run('good-model', 2, areitThesis), run('weak-model', 1, areitWeakThesis)]);

    const prompts = complete.mock.calls.map(([, req]) => (req as CompletionRequest).user);
    expect(prompts).toHaveLength(2);
    for (const p of prompts) expect(p).not.toMatch(/good-model|weak-model/);
    expect(prompts[0].indexOf(areitThesis)).toBeLessThan(prompts[0].indexOf(areitWeakThesis));
    expect(prompts[1].indexOf(areitWeakThesis)).toBeLessThan(prompts[1].indexOf(areitThesis));
    expect(r.calls.map((c) => c.shown)).toEqual([['good-model', 'weak-model'], ['weak-model', 'good-model']]);
    expect(r).toMatchObject({ outcome: 'good-model', runs: { 'good-model': { runIndex: 2 }, 'weak-model': { runIndex: 1 } }, judge: 'opus' });
  });

  it('records a failed call as a null outcome', async () => {
    complete.mockResolvedValue({ text: '', inputTokens: null, outputTokens: null, costUsd: null, latencyMs: 0, error: 'rate limited' });
    const r = await judgePairCase(OPUS_JUDGE, areit, ['a', 'b'], [run('a', 1, areitThesis), run('b', 1, areitThesis)]);
    expect(r.outcome).toBeNull();
  });
});

describe('buildJudgeScorecard', () => {
  it('counts win/tie/loss per model and ranks by score, excluding failed judgments', () => {
    const results = [
      pc(['a', 'b'], 'c1', 'a'),
      pc(['a', 'b'], 'c2', 'tie'),
      pc(['a', 'c'], 'c1', 'a'),
      pc(['b', 'c'], 'c1', 'c'),
      pc(['b', 'c'], 'c2', null),
    ];
    expect(buildJudgeScorecard(results, ['a', 'b', 'c'])).toEqual([
      { rank: 1, model: 'a', judged: 3, wins: 2, ties: 1, losses: 0, score: 2.5 / 3 },
      { rank: 2, model: 'c', judged: 2, wins: 1, ties: 0, losses: 1, score: 0.5 },
      { rank: 3, model: 'b', judged: 3, wins: 0, ties: 1, losses: 2, score: 0.5 / 3 },
    ]);
  });

  it('gives equal scores the same rank', () => {
    const rows = buildJudgeScorecard([pc(['a', 'b'], 'c1', 'tie')], ['a', 'b']);
    expect(rows.map((r) => r.rank)).toEqual([1, 1]);
  });
});

describe('bias check', () => {
  const opus = [pc(['a', 'b'], 'c1', 'a'), pc(['a', 'b'], 'c2', 'tie'), pc(['a', 'k'], 'c1', 'k'), pc(['a', 'b'], 'c3', null)];

  it('samples Opus-judged pairs without the bias judge', () => {
    expect(biasSample(opus, 'k', 5).map((r) => r.caseId)).toEqual(['c1', 'c2']);
    expect(biasSample(opus, 'k', 1)).toHaveLength(1);
    const spread = [pc(['a', 'b'], 'c1', 'a'), pc(['a', 'c'], 'c1', 'a'), pc(['a', 'b'], 'c2', 'a'), pc(['a', 'c'], 'c2', 'a')];
    expect(biasSample(spread, 'k', 2).map((r) => r.caseId)).toEqual(['c1', 'c2']);
  });

  it('reports agreement on pair-cases both judges scored', () => {
    const kimi = [pc(['a', 'b'], 'c1', 'a', 'k'), pc(['a', 'b'], 'c2', 'b', 'k'), pc(['a', 'b'], 'c3', 'a', 'k')];
    expect(agreement(opus, kimi)).toEqual({ compared: 2, agreed: 1, disagreements: [{ key: 'a-vs-b/c2', opus: 'tie', other: 'b' }] });
  });
});

// Price-shift copies are separate cases: a run on one case never stands in for another
it('pickUsableRun matches runs by case id', () => {
  const cheap = withContext(areit, { lastPrice: 20 }, { id: 'areit-cheap', kind: 'price-shift', pair: 'areit' });
  expect(pickUsableRun([run('m', 1, areitThesis)], 'm', cheap)).toBeNull();
});
