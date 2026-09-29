import { describe, expect, it } from 'vitest';
import { gradeSanity } from './sanity.ts';
import { areit, areitThesis, withContext } from './fixtures.ts';

describe('gradeSanity', () => {
  it('passes a thesis prod would store', () => {
    expect(gradeSanity(areitThesis, areit).pass).toBe(true);
  });

  it('fails a short thesis', () => {
    const result = gradeSanity('AREIT is a watch.\n---VERDICT---\nwatch', areit);
    expect(result.pass).toBe(false);
    expect(result.notes[0]).toMatch(/too short/);
  });

  it('fails when the company is never named', () => {
    expect(gradeSanity(areitThesis.replaceAll('AREIT', 'the REIT'), areit).notes).toEqual(['does not mention ticker or company name']);
  });

  it('fails with no buy/watch/pass word in the body, even if the verdict block has one', () => {
    const text = areitThesis.replace('Bottom line: watch.', 'Bottom line: wait.').replace('before it is a buy', 'before it is attractive');
    expect(gradeSanity(text, areit).notes).toEqual(['no clear buy/watch/pass verdict found']);
  });

  it('accepts a distinctive short name, like the format grader', () => {
    const jfc = withContext(areit, { ticker: 'JFC', companyName: 'Jollibee Foods Corporation' }, { id: 'jfc' });
    expect(gradeSanity(areitThesis.replaceAll('AREIT, Inc.', 'Jollibee').replaceAll('AREIT', 'Jollibee'), jfc).pass).toBe(true);
  });
});
