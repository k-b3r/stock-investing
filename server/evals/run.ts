import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { parseArgs } from 'util';
import { EVAL_THESIS_INSTRUCTIONS, RESEARCH_INSTRUCTIONS, buildResearchPrompt } from './prompts.ts';
import { complete } from './adapters/index.ts';
import { gradeFormat } from './graders/format.ts';
import { gradeResearch } from './graders/research.ts';
import { findModel } from './models.ts';
import { casesDir, resultFile } from './paths.ts';
import { printScorecard } from './scorecard.ts';
import { readJsonFiles } from './utils.ts';
import type { CompletionRequest, RunResult, ResearchCase, Suite, ThesisCase } from './types.ts';

const DEFAULT_MODELS = 'mimo-v2.6-flash,sonnet';

const { values } = parseArgs({
  options: {
    suite: { type: 'string', default: 'thesis' },
    models: { type: 'string', default: DEFAULT_MODELS },
    cases: { type: 'string' },
    runs: { type: 'string', default: '1' },
  },
});

const models = values.models.split(',').map((m) => findModel(m.trim()));
const runs = Number(values.runs);
if (!Number.isInteger(runs) || runs < 1) {
  console.error(`--runs must be a positive integer, got "${values.runs}"`);
  process.exit(1);
}

if (values.suite !== 'thesis' && values.suite !== 'research') {
  console.error(`--suite must be thesis or research, got "${values.suite}"`);
  process.exit(1);
}
const suite: Suite = values.suite;

// Per suite: how a case becomes a request, and how its output is graded and summarized
interface SuiteRunner<C> {
  request: (c: C) => CompletionRequest;
  grade: (text: string, c: C) => RunResult['grades'];
  summary: (grades: RunResult['grades']) => string;
}

const thesisRunner: SuiteRunner<ThesisCase> = {
  request: (c) => ({ system: EVAL_THESIS_INSTRUCTIONS, user: c.dataBlock }),
  grade: (text, c) => ({ format: gradeFormat(text, c) }),
  summary: ({ format }) =>
    !format ? '' : format.pass ? 'format perfect' : format.usable ? `format usable, style issues (${format.notes.join('; ')})` : `format UNUSABLE (${format.notes.join('; ')})`,
};

const researchRunner: SuiteRunner<ResearchCase> = {
  request: (c) => ({ system: RESEARCH_INSTRUCTIONS, user: buildResearchPrompt(c) }),
  grade: (text, c) => ({ research: gradeResearch(text, c) }),
  summary: ({ research }) => (!research ? '' : research.pass ? 'research pass' : `research FAIL (${research.notes.join('; ')})`),
};

const runner = (suite === 'thesis' ? thesisRunner : researchRunner) as SuiteRunner<ThesisCase | ResearchCase>;

const wanted = values.cases?.split(',').map((c) => c.trim().toLowerCase());
const cases = (await readJsonFiles<ThesisCase | ResearchCase>(casesDir(suite))).filter((c) => !wanted || wanted.includes(c.id));
if (cases.length === 0) {
  console.error(suite === 'thesis' ? 'No thesis cases found. Freeze one first: pnpm eval:freeze TICKER' : 'No research cases found. Build them: pnpm eval:fetch-research');
  process.exit(1);
}
const unverified = cases.filter((c) => c.suite === 'research' && !c.verified).length;
if (unverified) console.log(`Note: ${unverified} research case(s) have answer keys not yet verified (see research/REVIEW.md)\n`);

const idWidth = Math.max(8, ...cases.map((c) => c.id.length));
console.log(`Running ${cases.length} case(s) × ${models.length} model(s) × ${runs} run(s)\n`);

for (const spec of models) {
  for (const testCase of cases) {
    for (let runIndex = 1; runIndex <= runs; runIndex++) {
      process.stdout.write(`${spec.id.padEnd(20)} ${testCase.id.padEnd(idWidth)} r${runIndex}  `);
      const startedAt = new Date().toISOString();
      const completion = await complete(spec, runner.request(testCase));
      const grades: RunResult['grades'] = completion.error ? {} : runner.grade(completion.text, testCase);

      const result: RunResult = { suite, caseId: testCase.id, model: spec.id, runIndex, startedAt, completion, grades };
      const file = resultFile(suite, spec.id, testCase.id, runIndex);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(result, null, 2) + '\n');

      const cost = completion.costUsd === null ? 'N/A' : `$${completion.costUsd.toFixed(4)}`;
      if (completion.error) console.log(`→ ERROR ${completion.error}`);
      else console.log(`→ ${runner.summary(grades)}, ${(completion.latencyMs / 1000).toFixed(1)}s, ${cost}`);
    }
  }
}

await printScorecard(suite);
