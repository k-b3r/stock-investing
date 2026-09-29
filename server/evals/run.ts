import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { parseArgs } from 'util';
import { EVAL_THESIS_INSTRUCTIONS } from './prompts.ts';
import { complete } from './adapters/index.ts';
import { gradeFormat } from './graders/format.ts';
import { findModel } from './models.ts';
import { casesDir, resultFile } from './paths.ts';
import { printScorecard } from './scorecard.ts';
import { readJsonFiles } from './utils.ts';
import type { GradeResult, RunResult, ThesisCase } from './types.ts';

const DEFAULT_MODELS = 'mimo-v2.6-flash,sonnet';

const { values } = parseArgs({
  options: {
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

const wanted = values.cases?.split(',').map((c) => c.trim().toLowerCase());
const cases = (await readJsonFiles<ThesisCase>(casesDir('thesis'))).filter((c) => !wanted || wanted.includes(c.id));
if (cases.length === 0) {
  console.error('No thesis cases found. Freeze one first: pnpm eval:freeze TICKER');
  process.exit(1);
}

console.log(`Running ${cases.length} case(s) × ${models.length} model(s) × ${runs} run(s)\n`);

for (const spec of models) {
  for (const testCase of cases) {
    for (let runIndex = 1; runIndex <= runs; runIndex++) {
      process.stdout.write(`${spec.id.padEnd(20)} ${testCase.id.padEnd(8)} r${runIndex}  `);
      const startedAt = new Date().toISOString();
      const completion = await complete(spec, { system: EVAL_THESIS_INSTRUCTIONS, user: testCase.dataBlock });
      const format = completion.error ? null : gradeFormat(completion.text, testCase);
      const grades: Record<string, GradeResult> = format ? { format } : {};

      const result: RunResult = { suite: 'thesis', caseId: testCase.id, model: spec.id, runIndex, startedAt, completion, grades };
      const file = resultFile('thesis', spec.id, testCase.id, runIndex);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(result, null, 2) + '\n');

      const cost = completion.costUsd === null ? 'N/A' : `$${completion.costUsd.toFixed(4)}`;
      if (!format) console.log(`→ ERROR ${completion.error}`);
      else console.log(`→ format ${format.pass ? 'pass' : `FAIL (${format.notes.join('; ')})`}, ${(completion.latencyMs / 1000).toFixed(1)}s, ${cost}`);
    }
  }
}

await printScorecard('thesis');
