import { describe, expect, it } from 'vitest';
import { buildFactCheckScorecard } from './scorecard.ts';
import type { RunResult } from '../types.ts';
import type { FactCheckCase, PlantedError } from './types.ts';

const error = (type: PlantedError['type'], m: string): PlantedError => ({ type, original: '', claim: m, trueValue: '', sourceQuote: '', match: [m] });
const mkCase = (id: string, errors: PlantedError[]) => ({ id, errors }) as FactCheckCase;
const cases = [mkCase('a-size', [error('size', '11.8')]), mkCase('b-year', [error('year', '1953')]), mkCase('c-clean', [])];

const run = (model: string, caseId: string, flags: string[] | null, error: string | null = null): RunResult => ({
  suite: 'factcheck', caseId, model, runIndex: 1, startedAt: '',
  completion: { text: flags ? JSON.stringify({ contradictions: flags }) : 'not json', inputTokens: null, outputTokens: null, costUsd: 0.01, latencyMs: 2000, error },
  grades: {},
});

describe('buildFactCheckScorecard', () => {
  it('scores recall, precision, clean-pass and per-type recall', () => {
    const [row] = buildFactCheckScorecard([
      run('m', 'a-size', ['ROIC 11.8% vs 5.9%']),
      run('m', 'b-year', ['P/E 13x vs 13.4x']),
      run('m', 'c-clean', []),
    ], cases);
    expect(row).toMatchObject({ runs: '3', errors: '0', recall: '50%', precision: '50%', 'clean-pass': '100%', 'false alarms': '1', 'r:size': '100%', 'r:year': '0%', 'r:units': 'N/A' });
  });

  it('counts errored and unparseable runs as misses and failed clean runs', () => {
    const [row] = buildFactCheckScorecard([
      run('m', 'a-size', null, 'timeout'),
      run('m', 'b-year', null),
      run('m', 'c-clean', null),
    ], cases);
    expect(row).toMatchObject({ errors: '1', 'bad json': '2', recall: '0%', precision: 'N/A', 'clean-pass': '0%' });
  });

  it('drops runs whose case was removed and splits rows by model', () => {
    const rows = buildFactCheckScorecard([run('x', 'gone', []), run('y', 'c-clean', ['anything'])], cases);
    expect(rows.map((r) => [r.model, r['clean-pass']])).toEqual([['y', '0%']]);
  });
});
