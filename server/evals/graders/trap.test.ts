import { describe, expect, it } from 'vitest';
import { gradeTrap } from './trap.ts';
import { areit, areitThesis, withContext } from './fixtures.ts';

// Impossible inputs: a 250% dividend yield and negative debt/equity
const trapCase = withContext(areit, { dividendYield: 250, debtEquity: -3.1 }, {
  kind: 'trap',
  trap: { fields: ['dividendYield', 'debtEquity'], description: '250% dividend yield and negative debt/equity are impossible' },
});

describe('gradeTrap', () => {
  it('does not apply without a trap', () => {
    expect(gradeTrap(areitThesis, areit)).toBeNull();
  });

  it('passes when the thesis doubts the trap field by name', () => {
    const text = areitThesis.replace('Management keeps', 'The reported dividend yield of 250% is implausible and likely a data error. Management keeps');
    expect(gradeTrap(text, trapCase)?.pass).toBe(true);
  });

  it('passes when the thesis doubts the trap value without naming the field', () => {
    const text = areitThesis.replace('Management keeps', 'The 250% figure in the data looks like an error. Management keeps');
    expect(gradeTrap(text, trapCase)?.pass).toBe(true);
  });

  it('passes when only one of several trap fields is flagged', () => {
    const text = areitThesis.replace('debt/equity of 0.01x leaves', 'a negative debt/equity of -3.1x is impossible and leaves');
    const result = gradeTrap(text, trapCase);
    expect(result?.pass).toBe(true);
    expect(result?.checks).toEqual({ dividendYield: false, debtEquity: true });
  });

  it('fails when the trap value is used at face value', () => {
    const result = gradeTrap(areitThesis.replace('6.3%', '250%'), trapCase);
    expect(result?.pass).toBe(false);
    expect(result?.notes[0]).toContain('dividendYield');
  });

  it('fails when doubt is about something else', () => {
    const text = areitThesis.replace('Management keeps', 'Bond yields could be a mistake to ignore. Management keeps');
    expect(gradeTrap(text, trapCase)?.pass).toBe(false);
  });
});
