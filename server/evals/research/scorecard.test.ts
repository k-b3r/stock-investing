import { describe, expect, it } from 'vitest';
import { buildResearchScorecard } from './scorecard.ts';
import type { RunResult } from '../types.ts';
import type { AnswerKey, ResearchCase } from './types.ts';

const testCase = (id: string, answer: AnswerKey): ResearchCase => ({
  id, suite: 'research', frozenAt: '2026-09-30T00:00:00Z', ticker: 'AREIT', company: 'AREIT, Inc.', category: 'dividends',
  asOf: '2026-06-01', question: 'Record date?', answer, verified: true,
  docs: [{ id: 'd1', title: 'AREIT dividend', source: 'PSE Edge', url: 'https://edge.pse.com.ph/x', publishedAt: '2026-05-22', sourceType: 'primary', role: 'answer', synthetic: false, text: 'The record date is May 28, 2026.' }],
});

const run = (caseId: string, text: string, error: string | null = null): RunResult => ({
  suite: 'research', caseId, model: 'm', runIndex: 1, startedAt: '', grades: {},
  completion: { text, inputTokens: 1, outputTokens: 1, costUsd: 0.001, latencyMs: 1000, error },
});

const cases = [testCase('answerable', { kind: 'date', value: '2026-05-28' }), testCase('nf', { kind: 'not_found' })];
const answer = JSON.stringify({ found: true, answer: 'May 28, 2026', docId: 'd1' });
const notFound = JSON.stringify({ found: false, answer: null, docId: null });

describe('buildResearchScorecard', () => {
  it('regrades runs and splits answerable from not-found cases', () => {
    const [row] = buildResearchScorecard([run('answerable', answer), run('nf', notFound)], cases);
    expect(row).toMatchObject({ runs: '2', errors: '0', pass: '100%', correct: '100%', 'cite primary': '100%', 'false NF': '0%', 'NF handled': '100%' });
  });

  it('counts errors and false not-found as failures', () => {
    const [row] = buildResearchScorecard([run('answerable', notFound), run('nf', '', 'timeout')], cases);
    expect(row).toMatchObject({ errors: '1', pass: '0%', correct: '0%', 'false NF': '100%', 'NF handled': '0%' });
  });

  it('drops runs whose case no longer exists', () => {
    expect(buildResearchScorecard([run('gone', answer)], cases)).toEqual([]);
  });
});
