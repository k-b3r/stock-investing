import { readFile, writeFile } from 'fs/promises';
import path from 'path';
import { parseArgs } from 'util';
import { buildFactCheckPrompt } from '../../prompts/fact-check.ts';
import { complete } from '../adapters/index.ts';
import { readJsonFiles } from '../utils.ts';
import type { ModelSpec } from '../types.ts';
import { basesDir } from './paths.ts';
import { applyEdits, validatePlanted } from './validate.ts';
import type { ErrorType, FactCheckBase, NonError, PlantedError, TextEdit } from './types.ts';

// Drafts, per base: (1) edits that make the stored thesis agree with its source (the clean copy),
// (2) candidate planted errors on the clean copy. Everything drafted here is reviewed by the user.

const TOLERANCE = `The fact-checker ignores trivial rounding ("43%" vs "42.4%", "₱1.35" vs "₱1.352") and flags only
substantive contradictions: wrong direction, wrong order of magnitude, or off by more than ~2
percentage points / 2% relative.`;

const RECONCILE_SYSTEM = `You prepare clean inputs for an evaluation of an LLM fact-checker. The fact-checker receives
SOURCE DATA and a THESIS and lists claims in the thesis that contradict the source. ${TOLERANCE}

Your job: minimally edit the thesis so a careful fact-checker would find NOTHING to flag.
- Fix every claim that restates a quantity, date, stake or fact given in the source and disagrees
  with it beyond the tolerance. Also fix borderline ones (up to ~2x the tolerance) to the source value.
- If a thesis figure names the same metric as the source but measures it differently (e.g. a
  year-over-year figure where the source gives a 10-year average under the same name), add the
  minimal wording that makes the difference explicit (e.g. "year-over-year") instead of changing it.
- Leave figures and facts that the source does not mention (outside research) untouched.
- Keep edits as small as possible: a few words each, same tone, no rewrites.
- "find" must be an exact substring occurring exactly once in the thesis.

Respond with JSON only: {"edits": [{"find": "...", "replace": "...", "reason": "..."}]}
Empty array if the thesis already agrees with the source.`;

const TYPE_GUIDE: Record<ErrorType, string> = {
  size: 'a figure the source gives, restated with the wrong magnitude (e.g. ROIC 5.9% -> 9.5%, P/E 13.4x -> 21.4x)',
  direction: 'reversed direction or comparison the source states (above/below MOS, growth vs decline, net cash vs debt)',
  year: 'wrong year for a dated source fact (incorporation, listing, a disclosure date, "as of December 31, 2024")',
  units: 'unit/scale slip on a source amount (₱ million vs ₱ billion, thousands vs millions)',
  stake: 'wrong ownership stake or relationship the source states (wholly owned vs a minority stake, wrong %)',
  currency: 'a peso (₱) figure from the source restated in US dollars, or vice versa',
};

const PLANT_SYSTEM = `You write test cases for an evaluation of an LLM fact-checker. The fact-checker receives SOURCE
DATA and a THESIS and must list claims in the thesis that contradict the source. ${TOLERANCE}

The THESIS you are given is clean: it agrees with the source. Draft candidate planted errors,
each a small edit that makes one claim clearly contradict the source (well past the tolerance),
the kind of slip a hurried analyst makes. Error types:
${Object.entries(TYPE_GUIDE).map(([t, g]) => `- ${t}: ${g}`).join('\n')}

Draft up to 2 candidates per type, skipping a type when no thesis claim maps to a source fact of
that kind. Each candidate:
- "original": exact substring of the thesis, occurring once, a short clause (5-25 words).
- "claim": "original" with the minimal change that plants the error.
- "trueValue": what the source says, e.g. "ROIC 5.9%".
- "sourceQuote": verbatim substring of the SOURCE DATA the claim contradicts.
- "match": 1-4 short strings that appear in "claim" but nowhere in the source or the clean thesis.
  A fact-checker's flag counts as catching the error if it contains ANY of them, so cover the ways
  a checker might name it: the bare wrong value ("9.5", "1953", "3.56 million", "$1.93") plus, for
  wording errors, the key word alone and in a phrase ("below", "below MOS"; "minority", "heavy").
Never plant an error in a figure the source does not contain.

Respond with JSON only: {"errors": [{"type": "...", "original": "...", "claim": "...", "trueValue": "...", "sourceQuote": "...", "match": ["..."]}]}`;

// Past production failures to reproduce, from the thesis batch log
const REAL_FAILURES: Record<string, string> = {
  KEEPR: `Also include one "stake" candidate reproducing a real past failure: the thesis claimed KEEPR holds
"a 30% stake in Pernod Ricard Philippines", while the source lists Pernod Ricard Philippines among its
subsidiaries (the company owns 100% of its subsidiaries). Work that claim into an existing sentence.`,
  PPC: `Also include one "size" candidate reproducing a real past failure: the thesis stated net income as
₱3.72 billion while the source's news headline gives record profits of P1.32 billion. Plant it where
the thesis discusses profit or net income.`,
};

// BPI once failed fact-check on "founded in 1851" vs "incorporated 1943": both true, not a contradiction
const FOUNDING_YEAR: Record<string, { sentence: string; note: string }> = {
  BPI: {
    sentence: 'Founded in 1851 as Banco Español-Filipino, BPI is the oldest bank in Southeast Asia.',
    note: 'True historical fact; the source gives the 1943 incorporation of the current entity. A real past false alarm.',
  },
};

const parseJson = <T>(text: string): T | null => {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]) as T;
  } catch {
    return null;
  }
};

async function reconcile(spec: ModelSpec, base: FactCheckBase): Promise<{ thesis: string; edits: TextEdit[] } | string> {
  const user = buildFactCheckPrompt(base.ticker, base.dataBlock, base.storedThesis).split('\n\nList any specific')[0];
  const res = await complete(spec, { system: RECONCILE_SYSTEM, user });
  if (res.error) return res.error;
  const parsed = parseJson<{ edits: TextEdit[] }>(res.text);
  if (!parsed) return `unparseable reconcile reply: ${res.text.slice(0, 200)}`;
  try {
    return { thesis: applyEdits(base.storedThesis, parsed.edits), edits: parsed.edits };
  } catch (err) {
    return (err as Error).message;
  }
}

async function plant(spec: ModelSpec, base: FactCheckBase, thesis: string): Promise<PlantedError[] | string> {
  const extra = REAL_FAILURES[base.ticker] ? `\n\n${REAL_FAILURES[base.ticker]}` : '';
  const user = `SOURCE DATA for ${base.ticker}:\n${base.dataBlock}\n\nTHESIS (clean):\n${thesis}${extra}`;
  const res = await complete(spec, { system: PLANT_SYSTEM, user });
  if (res.error) return res.error;
  const parsed = parseJson<{ errors: PlantedError[] }>(res.text);
  return parsed ? parsed.errors : `unparseable plant reply: ${res.text.slice(0, 200)}`;
}

function foundingYearNonError(base: FactCheckBase, thesis: string): NonError | null {
  const f = FOUNDING_YEAR[base.ticker];
  if (!f) return null;
  const firstBreak = thesis.indexOf('\n\n');
  const original = thesis.slice(0, firstBreak === -1 ? thesis.length : firstBreak);
  return { type: 'founding-year', original, text: `${original} ${f.sentence}`, note: f.note };
}

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { model: { type: 'string', default: 'opus' }, redo: { type: 'boolean', default: false }, concurrency: { type: 'string', default: '3' } },
  });
  const spec: ModelSpec = { id: values.model, provider: 'claude-cli', model: values.model, price: null };
  const wanted = positionals.map((t) => t.toUpperCase());
  const bases = (await readJsonFiles<FactCheckBase>(basesDir)).filter((b) => (wanted.length ? wanted.includes(b.ticker) : values.redo || !b.drafted));

  const queue = [...bases];
  const worker = async () => {
    for (let base = queue.shift(); base; base = queue.shift()) {
      const file = path.join(basesDir, `${base.ticker.toLowerCase()}.json`);
      const r = await reconcile(spec, base);
      if (typeof r === 'string') {
        console.log(`${base.ticker.padEnd(8)} reconcile FAILED: ${r}`);
        continue;
      }
      const p = await plant(spec, base, r.thesis);
      if (typeof p === 'string') {
        console.log(`${base.ticker.padEnd(8)} plant FAILED: ${p}`);
        continue;
      }
      const valid = p.filter((e) => validatePlanted(e, r.thesis, base.dataBlock).length === 0);
      const founding = foundingYearNonError(base, r.thesis);
      const updated: FactCheckBase = {
        ...(JSON.parse(await readFile(file, 'utf8')) as FactCheckBase),
        thesis: r.thesis,
        reconcileEdits: r.edits,
        candidates: valid,
        nonErrorCandidates: founding ? [founding] : [],
        drafted: { model: values.model, at: new Date().toISOString() },
      };
      await writeFile(file, JSON.stringify(updated, null, 2) + '\n');
      const rejected = p.length - valid.length;
      console.log(`${base.ticker.padEnd(8)} ${r.edits.length} reconcile edit(s), ${valid.length} candidate(s)${rejected ? `, ${rejected} rejected by validation` : ''}`);
    }
  };
  await Promise.all(Array.from({ length: Number(values.concurrency) }, worker));
}

if (process.argv[1] === new URL(import.meta.url).pathname) await main();
