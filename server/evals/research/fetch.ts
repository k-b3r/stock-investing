import { createHash } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { getPool } from '../../src/db.ts';
import { getDisclosuresByIds, sampleOtherDisclosures } from '../../src/repositories/disclosures.ts';
import { classifySource, disclosureToDoc, fetchPageText, searchWeb, type FetchedDoc } from '../../scripts/research-fetcher.ts';
import { readJsonFiles } from '../utils.ts';
import { containsAnswer } from './grader.ts';
import { questionsFile, researchCasesDir, reviewFile } from './paths.ts';
import type { DocRole, ResearchCase, ResearchDoc, ResearchQuestion } from './types.ts';

// Builds frozen research bundles from research/questions.json: PSE Edge filings (answer + stale) from the DB, answer web pages,
// Google News hits dated <= asOf, a synthetic conflicting aggregator page and unrelated filings as noise.
// Then rewrites research/REVIEW.md, the sheet the user verifies answer keys against.
//   pnpm eval:research:fetch                 # all questions missing a bundle
//   pnpm eval:research:fetch div-areit-q1 …  # (re)build these
//   pnpm eval:research:fetch --all           # rebuild everything
//   pnpm eval:research:fetch --review        # only rewrite REVIEW.md

const MAX_WEB_DOCS = 4;
const MIN_DOCS = 5;
const MAX_DOCS = 10;

function seededShuffle<T>(items: T[], seed: string): T[] {
  let state = createHash('sha256').update(seed).digest().readUInt32LE(0);
  const rand = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Fictional aggregator (no real site impersonated) repeating a wrong or outdated value.
function conflictDoc(q: ResearchQuestion, conflict: NonNullable<ResearchQuestion['conflict']>): FetchedDoc {
  return {
    title: `${q.ticker} stock: ${conflict.label}`,
    source: 'Stock data aggregator',
    url: `https://aggregator.example/stocks/${q.ticker.toLowerCase()}`,
    publishedAt: q.asOf,
    sourceType: 'aggregator',
    text: [
      `${q.company} (PSE: ${q.ticker}), company snapshot.`,
      `${conflict.label}: ${conflict.value}.`,
      'Figures are compiled automatically from exchange announcements and third-party feeds and may not reflect later amendments. Not investment advice.',
    ].join('\n'),
  };
}

async function buildCase(q: ResearchQuestion): Promise<{ testCase: ResearchCase; warnings: string[] }> {
  const warnings: string[] = [];
  const tagged: { doc: FetchedDoc; role: DocRole; synthetic: boolean }[] = [];

  const filings = await getDisclosuresByIds([...q.answerDocs, ...q.staleDocs]);
  for (const [ids, role] of [[q.answerDocs, 'answer'], [q.staleDocs, 'stale']] as const) {
    for (const id of ids) {
      const row = filings.find((r) => r.disclosure_id === id);
      if (!row) {
        warnings.push(`disclosure ${id} not in DB`);
        continue;
      }
      if (row.filed_at > q.asOf) warnings.push(`${role} disclosure ${id} filed ${row.filed_at}, after asOf`);
      if (!row.content) warnings.push(`${role} disclosure ${id} has no content`);
      const doc = disclosureToDoc(row);
      if (role === 'answer' && q.answer.kind !== 'not_found' && !containsAnswer(`${doc.title}\n${doc.text}`, q.answer)) warnings.push(`answer disclosure ${id} does not contain the key`);
      tagged.push({ doc, role, synthetic: false });
    }
  }

  for (const url of q.answerUrls) {
    const page = await fetchPageText(url);
    if (!page) {
      warnings.push(`answer page ${url} could not be fetched`);
      continue;
    }
    const doc: FetchedDoc = { title: page.title || url, source: new URL(url).hostname.replace(/^www\./, ''), url, publishedAt: null, sourceType: classifySource(url, q.companyDomains), text: page.text };
    if (q.answer.kind !== 'not_found' && !containsAnswer(`${doc.title}\n${doc.text}`, q.answer)) warnings.push(`answer page ${url} does not contain the key`);
    tagged.push({ doc, role: 'answer', synthetic: false });
  }

  if (q.conflict) tagged.push({ doc: conflictDoc(q, q.conflict), role: 'conflict', synthetic: true });

  const exclude = q.exclude.map((p) => new RegExp(p, 'i'));
  const seen = new Set(tagged.map((t) => t.doc.url));
  let webDocs = 0;
  for (const query of q.search) {
    for (const doc of await searchWeb(query, { before: q.asOf, limit: 3, companyDomains: q.companyDomains })) {
      if (webDocs >= MAX_WEB_DOCS || seen.has(doc.url)) continue;
      if (exclude.some((re) => re.test(`${doc.title}\n${doc.text}`))) continue;
      seen.add(doc.url);
      tagged.push({ doc, role: 'search', synthetic: false });
      webDocs++;
    }
  }

  const room = MAX_DOCS - tagged.length;
  const noise = await sampleOtherDisclosures(q.ticker, q.asOf, Math.max(0, Math.min(q.noise, room)), q.id);
  for (const row of noise) tagged.push({ doc: disclosureToDoc(row), role: 'noise', synthetic: false });

  if (tagged.length < MIN_DOCS) warnings.push(`only ${tagged.length} docs`);
  if (q.answer.kind === 'not_found') {
    const hits = tagged.filter((t) => t.role !== 'noise' && t.role !== 'conflict').map((t) => t.doc.title);
    if (hits.length) warnings.push(`not-found bundle: check these docs lack the answer → ${hits.join(' | ')}`);
  } else if (!tagged.some((t) => t.role === 'answer' || containsAnswer(`${t.doc.title}\n${t.doc.text}`, q.answer))) {
    warnings.push('no doc contains the answer');
  }

  const docs: ResearchDoc[] = seededShuffle(tagged, q.id).map(({ doc, role, synthetic }, i) => ({ id: `d${i + 1}`, ...doc, role, synthetic }));
  const testCase: ResearchCase = {
    id: q.id,
    suite: 'research',
    frozenAt: new Date().toISOString(),
    ticker: q.ticker,
    company: q.company,
    category: q.category,
    asOf: q.asOf,
    question: q.question,
    answer: q.answer,
    verified: q.verified,
    docs,
  };
  return { testCase, warnings };
}

const formatKey = (k: ResearchQuestion['answer']) => {
  switch (k.kind) {
    case 'amount': return `${k.value}${k.tolerance ? ` (±${k.tolerance * 100}%)` : ''}`;
    case 'percent': return `${k.value}%`;
    case 'date': return k.value;
    case 'text': return k.accept.join(' / ');
    case 'not_found': return 'NOT FOUND';
  }
};

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, '');

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\s+/g, ' ');

async function writeReview(questions: ResearchQuestion[]): Promise<void> {
  const cases = new Map((await readJsonFiles<ResearchCase>(researchCasesDir)).map((c) => [c.id, c]));
  const verified = questions.filter((q) => q.verified).length;
  const lines = [
    '# Research eval: answer key review',
    '',
    '<!-- Generated by `pnpm eval:research:fetch`. DO NOT EDIT: change research/questions.json and rerun. -->',
    '',
    `Verified: ${verified}/${questions.length}. A key is verified when 2+ independent sources agree (aggregators do not count); not-found keys when the bundle is confirmed to lack the answer. Sources are in each question's \`verification\` in questions.json.`,
    '',
    '"has key" = the doc text matches the answer key (grader\'s matcher). Roles are hidden from models.',
    '',
  ];
  const issues = questions.filter((q) => q.verification.issue);
  if (issues.length) {
    lines.push(`## Conflicts for user (${issues.length})`, '', 'Unverified: sources disagree or only one independent source was found. Judge each, then set `verified` in questions.json.', '');
    for (const q of issues) lines.push(`- **${q.id}** (key: ${formatKey(q.answer)}): ${q.verification.issue}`);
    lines.push('');
  }
  for (const q of questions) {
    const c = cases.get(q.id);
    lines.push(`## ${q.verified ? '[x]' : '[ ]'} ${q.id}`, '');
    lines.push(`- **Q** (as of ${q.asOf}): ${q.question}`);
    lines.push(`- **Key**: ${formatKey(q.answer)}`);
    lines.push(`- **Source**: ${q.source}`);
    if (q.notes) lines.push(`- **Notes**: ${q.notes}`);
    for (const src of q.verification.sources) lines.push(`- **Checked**: [${hostOf(src.url)}](${src.url})${src.date ? ` (${src.date})` : ''}: "${cell(src.quote)}"`);
    lines.push('');
    if (!c) {
      lines.push('_No bundle yet._', '');
      continue;
    }
    lines.push('| doc | role | type | date | title | has key |', '|---|---|---|---|---|---|');
    for (const d of c.docs) {
      const hasKey = q.answer.kind === 'not_found' ? '' : containsAnswer(`${d.title}\n${d.text}`, q.answer) ? 'yes' : '';
      lines.push(`| ${d.id} | ${d.role}${d.synthetic ? ' (synthetic)' : ''} | ${d.sourceType} | ${d.publishedAt ?? ''} | [${cell(d.title).slice(0, 90)}](${d.url}) | ${hasKey} |`);
    }
    lines.push('');
  }
  await writeFile(reviewFile, lines.join('\n'));
}

const args = process.argv.slice(2);
const questions = JSON.parse(await readFile(questionsFile, 'utf8')) as ResearchQuestion[];
const duplicate = questions.find((q, i) => questions.findIndex((o) => o.id === q.id) !== i);
if (duplicate) throw new Error(`duplicate question id ${duplicate.id}`);

if (!args.includes('--review')) {
  const existing = new Set((await readJsonFiles<ResearchCase>(researchCasesDir)).map((c) => c.id));
  const ids = args.filter((a) => !a.startsWith('--'));
  const unknown = ids.filter((id) => !questions.some((q) => q.id === id));
  if (unknown.length) throw new Error(`unknown question id(s): ${unknown.join(', ')}`);
  const todo = questions.filter((q) => (ids.length ? ids.includes(q.id) : args.includes('--all') || !existing.has(q.id)));

  await mkdir(researchCasesDir, { recursive: true });
  for (const q of todo) {
    const { testCase, warnings } = await buildCase(q);
    await writeFile(path.join(researchCasesDir, `${q.id}.json`), JSON.stringify(testCase, null, 2) + '\n');
    const roles = testCase.docs.map((d) => d.role[0]).join('');
    console.log(`${q.id.padEnd(34)} → ${testCase.docs.length} docs [${roles}]`);
    for (const w of warnings) console.log(`    ! ${w}`);
  }
}

await writeReview(questions);
console.log(`\nWrote research/REVIEW.md (${questions.filter((q) => q.verified).length}/${questions.length} keys verified)`);
await getPool().end();
