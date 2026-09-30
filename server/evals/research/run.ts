import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { parseArgs } from 'util';
import { complete } from '../adapters/index.ts';
import { findModel } from '../models.ts';
import { resultFile } from '../paths.ts';
import { readJsonFiles } from '../utils.ts';
import type { RunResult } from '../types.ts';
import { gradeResearch } from './grader.ts';
import { researchCasesDir } from './paths.ts';
import { RESEARCH_INSTRUCTIONS, buildResearchPrompt } from './prompts.ts';
import { printResearchScorecard } from './scorecard.ts';
import type { ResearchCase } from './types.ts';

const DEFAULT_MODELS = 'mimo-v2.6-flash,sonnet';

const { values } = parseArgs({
  options: {
    models: { type: 'string', default: DEFAULT_MODELS },
    cases: { type: 'string' },
    runs: { type: 'string', default: '1' },
    // Include cases whose answer key is not verified yet
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
const cases = (await readJsonFiles<ResearchCase>(researchCasesDir)).filter((c) => (values.all || c.verified) && (!wanted || wanted.includes(c.id)));
if (cases.length === 0) {
  console.error('No research cases found (unverified ones need --all). Build them: pnpm eval:research:fetch');
  process.exit(1);
}

const idWidth = Math.max(8, ...cases.map((c) => c.id.length));
console.log(`Running ${cases.length} research case(s) × ${models.length} model(s) × ${runs} run(s)\n`);

for (const spec of models) {
  for (const testCase of cases) {
    for (let runIndex = 1; runIndex <= runs; runIndex++) {
      process.stdout.write(`${spec.id.padEnd(20)} ${testCase.id.padEnd(idWidth)} r${runIndex}  `);
      const startedAt = new Date().toISOString();
      const completion = await complete(spec, { system: RESEARCH_INSTRUCTIONS, user: buildResearchPrompt(testCase) });
      const research = completion.error ? null : gradeResearch(completion.text, testCase);

      const result: RunResult = { suite: 'research', caseId: testCase.id, model: spec.id, runIndex, startedAt, completion, grades: research ? { research } : {} };
      const file = resultFile('research', spec.id, testCase.id, runIndex);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(result, null, 2) + '\n');

      const cost = completion.costUsd === null ? 'N/A' : `$${completion.costUsd.toFixed(4)}`;
      if (!research) console.log(`→ ERROR ${completion.error}`);
      else console.log(`→ ${research.pass ? 'pass' : `FAIL (${research.notes.join('; ')})`}, ${(completion.latencyMs / 1000).toFixed(1)}s, ${cost}`);
    }
  }
}

await printResearchScorecard();
