import { describe, expect, it } from 'vitest';
import { buildScorecard } from './scorecard.ts';
import { areit, areitThesis, withContext } from './graders/fixtures.ts';
import type { RunResult } from './types.ts';

const cheap = withContext(areit, { lastPrice: 20 }, { id: 'areit-cheap', kind: 'price-shift', pair: 'areit' });
const buyThesis = areitThesis.replace('---VERDICT---\n\nwatch', '---VERDICT---\n\nbuy');

const run = (caseId: string, runIndex: number, text: string, error: string | null = null): RunResult => ({
  suite: 'thesis',
  caseId,
  model: 'm',
  runIndex,
  startedAt: '2026-09-30T00:00:00Z',
  completion: { text, inputTokens: 100, outputTokens: 50, costUsd: 0.01, latencyMs: 1000, error },
  grades: {},
});

describe('buildScorecard', () => {
  it('shows one column per grader', () => {
    const [row] = buildScorecard([run('areit', 1, areitThesis)], [areit]);
    expect(Object.keys(row)).toEqual(expect.arrayContaining(['usable', 'format-perfect', 'numbers', 'bad figs', 'verdict', 'n/a', 'trap', 'consistent', 'pair-shift', 'prod-sanity']));
  });

  it('grades runs from their saved text, marking inapplicable graders N/A', () => {
    const [row] = buildScorecard([run('areit', 1, areitThesis)], [areit]);
    expect(row).toMatchObject({ usable: '100%', numbers: '100%', 'bad figs': '0', verdict: '100%', 'prod-sanity': '100%', 'n/a': 'N/A', trap: 'N/A', consistent: 'N/A', 'pair-shift': 'N/A' });
  });

  it('counts errored runs as failures', () => {
    const [row] = buildScorecard([run('areit', 1, areitThesis), run('areit', 2, '', 'timeout')], [areit]);
    expect(row).toMatchObject({ errors: '1', numbers: '50%', verdict: '50%' });
  });

  it('grades consistency across runs and price-shift pairs across cases', () => {
    const results = [run('areit', 1, areitThesis), run('areit', 2, areitThesis), run('areit-cheap', 1, buyThesis), run('areit-cheap', 2, areitThesis)];
    const [row] = buildScorecard(results, [areit, cheap]);
    // areit consistent, areit-cheap split buy/watch (no modal verdict, so the pair fails)
    expect(row).toMatchObject({ consistent: '50%', 'pair-shift': '0%' });

    const [moved] = buildScorecard([run('areit', 1, areitThesis), run('areit-cheap', 1, buyThesis)], [areit, cheap]);
    expect(moved['pair-shift']).toBe('100%');
  });
});
