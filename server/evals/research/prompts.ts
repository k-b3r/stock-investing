import type { ResearchCase } from './types.ts';

export const RESEARCH_INSTRUCTIONS = `You answer factual questions about companies listed on the Philippine Stock Exchange
using only the documents provided in the user message. You have no tools and cannot browse.

The documents are search results: some are the company's own filings, some are news or data
aggregator pages, and some are outdated, superseded (a later amendment changes them) or unrelated.
When sources disagree, prefer the company's most recent official filing that is dated on or before
the as-of date. Do not use outside knowledge. If no document states the answer, say it is not found.

Reply with only a JSON object, no other text:
{"found": true, "answer": "<short answer with units, e.g. PHP 0.62 per share or May 28, 2026>", "docId": "<id of the one document that states the answer, e.g. d3>"}
or, when no document states the answer:
{"found": false, "answer": null, "docId": null}`;

export function buildResearchPrompt(testCase: ResearchCase): string {
  const docs = testCase.docs.map((d) =>
    [`<document id="${d.id}">`, `Title: ${d.title}`, `Source: ${d.source} (${d.url})`, `Date: ${d.publishedAt ?? 'unknown'}`, '', d.text, '</document>'].join('\n')
  );
  return [`As of: ${testCase.asOf}`, `Company: ${testCase.company} (PSE: ${testCase.ticker})`, `Question: ${testCase.question}`, '', ...docs].join('\n');
}
