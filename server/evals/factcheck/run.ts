import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { parseArgs } from 'util';
import { buildFactCheckPrompt } from '../../prompts/fact-check.ts';
import { complete } from '../adapters/index.ts';
import { findModel } from '../models.ts';
import { resultFile } from '../paths.ts';
import { readJsonFiles } from '../utils.ts';
import type { RunResult } from '../types.ts';
import { gradeFactCheck } from './grader.ts';
import { factCheckCasesDir } from './paths.ts';
import { printFactCheckScorecard } from './scorecard.ts';
import type { FactCheckCase } from './types.ts';

// Production sends the prompt alone (claude -p); adapters need a system prompt, so keep it neutral
export const FACT_CHECK_SYSTEM = 'You check investment theses against source financial data.';

// Haiku is the production fact-checker
const DEFAULT_MODELS = 'mimo-v2.6-flash,haiku';

const { values } = parseArgs({
  options: {
    models: { type: 'string', default: DEFAULT_MODELS },
    cases: { type: 'string' },
    runs: { type: 'string', default: '1' },
    // Include cases the user has not approved yet
    all: { type: 'boolean', default: false },
  },
});

const models = values.models.split(',').map((m) => findModel(m.trim()));
const runs = Number(values.runs);
if (!Number.isInteger(runs) || runs < 1) {
  console.error(`--runs must be a positive integer, got "${values.runs}"`);
  process.exit(1);
}

const wanted = values.cases?.split(',').map((c) => c.trim().toLowerCase());
const cases = (await readJsonFiles<FactCheckCase>(factCheckCasesDir)).filter((c) => (values.all || c.approved) && (!wanted || wanted.includes(c.id)));
if (cases.length === 0) {
  console.error('No fact-check cases found (unapproved ones need --all). Build them: pnpm eval:factcheck:build');
  process.exit(1);
}

console.log(`Running ${cases.length} fact-check case(s) × ${models.length} model(s) × ${runs} run(s)\n`);

for (const spec of models) {
  for (const testCase of cases) {
    for (let runIndex = 1; runIndex <= runs; runIndex++) {
      process.stdout.write(`${spec.id.padEnd(20)} ${testCase.id.padEnd(22)} r${runIndex}  `);
      const startedAt = new Date().toISOString();
      const user = buildFactCheckPrompt(testCase.ticker, testCase.dataBlock, testCase.thesis);
      const completion = await complete(spec, { system: FACT_CHECK_SYSTEM, user });
      const factCheck = completion.error ? null : gradeFactCheck(completion.text, testCase);

      const result: RunResult = { suite: 'factcheck', caseId: testCase.id, model: spec.id, runIndex, startedAt, completion, grades: factCheck ? { factCheck } : {} };
      const file = resultFile('factcheck', spec.id, testCase.id, runIndex);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(result, null, 2) + '\n');

      if (!factCheck) console.log(`→ ERROR ${completion.error}`);
      else console.log(`→ ${factCheck.pass ? 'pass' : `FAIL (${factCheck.notes.join('; ')})`}, ${(completion.latencyMs / 1000).toFixed(1)}s`);
    }
  }
}

await printFactCheckScorecard();
