import { readFile, writeFile } from 'fs/promises';
import { parseArgs } from 'util';
import { fetchPageText } from '../../scripts/research-fetcher.ts';
import { completeClaudeCli } from '../adapters/claude-cli.ts';
import { containsAnswer } from './grader.ts';
import { questionsFile } from './paths.ts';
import type { AnswerKey, ResearchCategory, ResearchQuestion } from './types.ts';

// Drafts an answer key for a non-DB fact: fetches the source page and asks Opus (claude CLI, subscription,
// isolated like the eval adapter) to extract the answer with a verbatim quote. The quote must appear in the
// page and the key must match the page, else nothing is written. Drafts land unverified; the user checks each.
//   pnpm eval:research:draft --id web-areit-float --ticker AREIT --company "AREIT, Inc." --domain areit.com.ph \
//     --category events --as-of 2026-09-30 --url https://www.areit.com.ph/about-us \
//     --question "What share of AREIT was publicly traded as of June 30, 2026?" [--write]

const QUESTIONS = questionsFile;
const CATEGORIES: ResearchCategory[] = ['dividends', 'financials', 'officers', 'stakes', 'events'];

const { values } = parseArgs({
  options: {
    id: { type: 'string' },
    ticker: { type: 'string' },
    company: { type: 'string' },
    domain: { type: 'string', multiple: true, default: [] },
    category: { type: 'string' },
    'as-of': { type: 'string' },
    url: { type: 'string' },
    question: { type: 'string' },
    write: { type: 'boolean', default: false },
  },
});

const { id, ticker, company, category, url, question } = values;
const asOf = values['as-of'];
if (!id || !ticker || !company || !category || !asOf || !url || !question) {
  console.error('required: --id --ticker --company --category --as-of --url --question');
  process.exit(1);
}
if (!CATEGORIES.includes(category as ResearchCategory)) throw new Error(`--category must be one of ${CATEGORIES.join(', ')}`);

const page = await fetchPageText(url);
if (!page) throw new Error(`could not fetch ${url}`);

const SYSTEM = `You extract answer keys for a research eval. Answer the question using only the document.
Reply with only a JSON object:
{"found": true, "kind": "amount" | "percent" | "date" | "text", "value": <number for amount/percent, "YYYY-MM-DD" for date, the name or phrase for text>, "aliases": [<other exact spellings for text answers>], "quote": "<verbatim sentence from the document that states the answer>"}
Amounts are in base units (3.2e9 for "P3.2 billion"). If the document does not state the answer: {"found": false}`;

const completion = await completeClaudeCli(
  { id: 'opus', provider: 'claude-cli', model: 'opus', price: null },
  { system: SYSTEM, user: `Question: ${question}\n\n<document url="${url}">\n${page.title}\n\n${page.text}\n</document>` }
);
if (completion.error) throw new Error(`opus failed: ${completion.error}`);

const json = completion.text.slice(completion.text.indexOf('{'), completion.text.lastIndexOf('}') + 1);
const draft = JSON.parse(json) as { found: boolean; kind?: string; value?: number | string; aliases?: string[]; quote?: string };
if (!draft.found) {
  console.log('Opus found no answer in the page. Nothing drafted.');
  process.exit(1);
}

// Models often straighten curly quotes when copying, so compare with quotes normalized
const squash = (s: string) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
if (!draft.quote || !squash(page.text).includes(squash(draft.quote))) throw new Error(`quote not found verbatim in page: "${draft.quote}"`);

let answer: AnswerKey;
if (draft.kind === 'amount' || draft.kind === 'percent') answer = { kind: draft.kind, value: Number(draft.value) };
else if (draft.kind === 'date') answer = { kind: 'date', value: String(draft.value) };
else answer = { kind: 'text', accept: [String(draft.value), ...(draft.aliases ?? [])] };
if (!containsAnswer(`${page.title}\n${page.text}`, answer)) throw new Error(`drafted key ${JSON.stringify(answer)} does not match the page text`);

const entry: ResearchQuestion = {
  id,
  ticker,
  company,
  companyDomains: values.domain,
  category: category as ResearchCategory,
  asOf,
  question,
  answer,
  answerDocs: [],
  staleDocs: [],
  answerUrls: [url],
  conflict: null,
  search: [company.split(',')[0]],
  exclude: [],
  noise: 3,
  notes: `Key drafted by Opus from the page. Quote: "${squash(draft.quote)}"`,
  source: url,
  verified: false,
  verification: { sources: [], issue: null },
};
console.log(JSON.stringify(entry, null, 2));

if (values.write) {
  const questions = JSON.parse(await readFile(QUESTIONS, 'utf8')) as ResearchQuestion[];
  if (questions.some((q) => q.id === id)) throw new Error(`question ${id} already exists`);
  await writeFile(QUESTIONS, JSON.stringify([...questions, entry], null, 2) + '\n');
  console.log(`\nAppended to research/questions.json (unverified). Add a conflict/search if useful, then: pnpm eval:research:fetch ${id}`);
}
