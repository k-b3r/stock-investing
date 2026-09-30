import { describe, expect, it } from 'vitest';
import { gradeFactCheck } from './grader.ts';
import type { PlantedError } from './types.ts';

const error: PlantedError = {
  type: 'size',
  original: 'ROIC of 5.9%',
  claim: 'ROIC of 11.8%',
  trueValue: 'ROIC: 5.9%',
  sourceQuote: '- ROIC: 5.9%',
  match: ['11.8'],
};
const planted = { errors: [error] };
const clean = { errors: [] };
const reply = (...contradictions: string[]) => JSON.stringify({ contradictions });

describe('gradeFactCheck', () => {
  it('passes when the planted error is caught and nothing else is flagged', () => {
    const result = gradeFactCheck(reply('ROIC of 11.8% contradicts source ROIC 5.9%'), planted);
    expect(result).toMatchObject({ pass: true, parsed: true, planted: 1, caught: 1, falseAlarms: [] });
  });

  it('counts a miss when no contradiction names the planted claim', () => {
    const result = gradeFactCheck(reply(), planted);
    expect(result).toMatchObject({ pass: false, caught: 0, falseAlarms: [] });
    expect(result.notes[0]).toContain('missed size error');
  });

  it('counts contradictions matching no planted error as false alarms', () => {
    const result = gradeFactCheck(reply('ROIC 11.8% vs 5.9%', 'P/E of 13x contradicts 13.4x'), planted);
    expect(result.caught).toBe(1);
    expect(result.falseAlarms).toEqual(['P/E of 13x contradicts 13.4x']);
    expect(result.pass).toBe(false);
  });

  it('does not count repeat mentions of the same planted error as false alarms', () => {
    const result = gradeFactCheck(reply('ROIC 11.8% is wrong', 'claimed 11.8% ROIC vs 5.9%'), planted);
    expect(result).toMatchObject({ pass: true, caught: 1, falseAlarms: [] });
  });

  it('passes a clean case with an empty array and fails it on any flag', () => {
    expect(gradeFactCheck(reply(), clean)).toMatchObject({ pass: true, planted: 0, caught: 0 });
    expect(gradeFactCheck(reply('price ₱36.80 contradicts ₱36.8'), clean)).toMatchObject({ pass: false, falseAlarms: ['price ₱36.80 contradicts ₱36.8'] });
  });

  it('matches case-insensitively and ignores thousands separators and spacing', () => {
    const units = { errors: [{ ...error, type: 'units' as const, match: ['₱17.3 million', '1234.5  Billion'] }] };
    expect(gradeFactCheck(reply('the ₱17.3 MILLION swap contradicts P17.3-B'), units).caught).toBe(1);
    expect(gradeFactCheck(reply('₱1,234.5 billion contradicts source'), units).caught).toBe(1);
  });

  it('grades each of several planted errors separately', () => {
    const two = { errors: [error, { ...error, type: 'year' as const, claim: 'incorporated in 1953', match: ['1953'] }] };
    const result = gradeFactCheck(reply('incorporated 1953 contradicts 1943'), two);
    expect(result).toMatchObject({ planted: 2, caught: 1, pass: false });
  });

  it('extracts JSON wrapped in prose or code fences, like production', () => {
    const wrapped = `Here is my check:\n\`\`\`json\n${reply('ROIC 11.8% vs 5.9%')}\n\`\`\``;
    expect(gradeFactCheck(wrapped, planted)).toMatchObject({ parsed: true, caught: 1 });
  });

  it('fails unparseable output without counting catches or false alarms', () => {
    for (const bad of ['no json here', '{"contradictions": "none"}', '{not json}']) {
      expect(gradeFactCheck(bad, planted)).toMatchObject({ pass: false, parsed: false, caught: 0, falseAlarms: [] });
    }
  });

  it('treats a missing contradictions key as an empty list, like production', () => {
    expect(gradeFactCheck('{}', clean)).toMatchObject({ pass: true, parsed: true });
  });
});
