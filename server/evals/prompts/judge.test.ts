import { describe, expect, it } from 'vitest';
import { completeClaudeCli } from '../adapters/claude-cli.ts';
import { areit, areitThesis, areitWeakThesis } from '../graders/fixtures.ts';
import { OPUS_JUDGE } from '../judge.ts';
import { buildJudgePrompt, JUDGE_SYSTEM, parseJudgeOutput } from './judge.ts';

const reply = (winner: string, extra = '') =>
  `${extra}{"meaning":"A","moat":"tie","management":"B","coherence":"A","winner":"${winner}","reason":"A grounds its moat in ROIC."}`;

describe('buildJudgePrompt', () => {
  it('gives the judge the data block and both theses under A/B labels', () => {
    const prompt = buildJudgePrompt(areit.dataBlock, areitThesis, areitWeakThesis);
    expect(prompt).toContain('Current Price: ₱37.50');
    expect(prompt.indexOf('=== THESIS A ===')).toBeLessThan(prompt.indexOf(areitThesis.slice(0, 40)));
    expect(prompt.indexOf('=== THESIS B ===')).toBeLessThan(prompt.indexOf(areitWeakThesis.slice(0, 40)));
    expect(prompt.indexOf(areitThesis.slice(0, 40))).toBeLessThan(prompt.indexOf('=== THESIS B ==='));
  });

  it('rubric covers the four criteria', () => {
    for (const c of ['meaning', 'moat', 'management', 'coherence']) expect(JUDGE_SYSTEM).toContain(`${c}:`);
  });
});

describe('parseJudgeOutput', () => {
  it('parses the verdict JSON', () => {
    expect(parseJudgeOutput(reply('A'))).toEqual({
      criteria: { meaning: 'A', moat: 'tie', management: 'B', coherence: 'A' },
      winner: 'A',
      reason: 'A grounds its moat in ROIC.',
    });
  });

  it('takes the last JSON object after any preamble, case-insensitive', () => {
    expect(parseJudgeOutput(reply('b', 'Thinking {"draft": true}\n'))?.winner).toBe('B');
    expect(parseJudgeOutput(reply('TIE'))?.winner).toBe('tie');
  });

  it('rejects missing JSON or invalid choices', () => {
    expect(parseJudgeOutput('A is better')).toBeNull();
    expect(parseJudgeOutput(reply('both'))).toBeNull();
    expect(parseJudgeOutput('{"winner":"A"}')).toBeNull();
  });
});

// Live Opus call (claude CLI subscription, 2 calls): JUDGE_LIVE=1 pnpm test prompts/judge
describe.runIf(process.env.JUDGE_LIVE)('judge rubric on a known-better vs known-worse pair', () => {
  it('prefers the grounded thesis in both orders', { timeout: 600_000 }, async () => {
    const [first, second] = await Promise.all([
      completeClaudeCli(OPUS_JUDGE, { system: JUDGE_SYSTEM, user: buildJudgePrompt(areit.dataBlock, areitThesis, areitWeakThesis) }),
      completeClaudeCli(OPUS_JUDGE, { system: JUDGE_SYSTEM, user: buildJudgePrompt(areit.dataBlock, areitWeakThesis, areitThesis) }),
    ]);
    const a = parseJudgeOutput(first.text);
    const b = parseJudgeOutput(second.text);
    console.log(a, b);
    expect(a?.winner).toBe('A');
    expect(b?.winner).toBe('B');
    expect(a?.criteria.management).toBe('A');
    expect(b?.criteria.management).toBe('B');
  });
});
