import { describe, expect, it } from 'vitest';
import { containsAnswer, extractAmounts, extractDates, gradeResearch, parseResearchOutput } from './grader.ts';
import type { AnswerKey, ResearchCase, ResearchDoc } from './types.ts';

const doc = (id: string, sourceType: ResearchDoc['sourceType'], text: string): ResearchDoc => ({
  id, title: `Doc ${id}`, source: 'test', url: `https://example.com/${id}`, publishedAt: '2026-05-01', sourceType, role: 'search', synthetic: false, text,
});

const testCase = (answer: AnswerKey): ResearchCase => ({
  id: 'areit-record', suite: 'research', frozenAt: '2026-09-30T00:00:00Z', ticker: 'AREIT', company: 'AREIT, Inc.', category: 'dividends',
  asOf: '2026-06-01', question: 'Record date?', answer, verified: true,
  docs: [
    doc('d1', 'aggregator', 'AREIT record date: May 27, 2026'),
    doc('d2', 'primary', 'The record date is May 27, 2026 ... will be moved to May 28, 2026.'),
    doc('d3', 'news', 'AREIT posts higher revenue'),
  ],
});

const recordDate = testCase({ kind: 'date', value: '2026-05-28' });
const json = (o: object) => JSON.stringify(o);

describe('parseResearchOutput', () => {
  it('reads JSON inside code fences and prose', () => {
    expect(parseResearchOutput('Here you go:\n```json\n{"found": true, "answer": "May 28, 2026", "docId": "D2"}\n```')).toEqual({
      found: true, answer: 'May 28, 2026', docId: 'd2',
    });
  });

  it('rejects non-JSON and a missing found flag', () => {
    expect(parseResearchOutput('The record date is May 28.')).toBeNull();
    expect(parseResearchOutput('{"answer": "May 28"}')).toBeNull();
  });
});

describe('extractors', () => {
  it('scales amounts by unit words and suffixes', () => {
    expect(extractAmounts('net income of P3.2 billion')).toContain(3.2e9);
    expect(extractAmounts('₱4.40B, up from Php 473 million')).toEqual(expect.arrayContaining([4.4e9, 473e6]));
    expect(extractAmounts('Php1,147,513,560.00')).toContain(1147513560);
    expect(extractAmounts('Php0.62 per common share')).toContain(0.62);
  });

  it('does not read a month as a million suffix', () => {
    expect(extractAmounts('on 5 May 2026')).not.toContain(5e6);
  });

  it('parses common date formats, including text glued to the year', () => {
    expect(extractDates('Record Date – July 10, 2026Payment Date')).toEqual(['2026-07-10']);
    expect(extractDates('as of 08 July 2026')).toEqual(['2026-07-08']);
    expect(extractDates('on 2026-03-05')).toEqual(['2026-03-05']);
    expect(extractDates('Mar. 5 2026')).toEqual(['2026-03-05']);
    expect(extractDates('Marketing 5, 2026')).toEqual([]);
  });
});

describe('containsAnswer', () => {
  it('matches amounts within tolerance', () => {
    expect(containsAnswer('P0.0236 per share', { kind: 'amount', value: 0.023605 })).toBe(true);
    expect(containsAnswer('P0.03 per share', { kind: 'amount', value: 0.023605 })).toBe(false);
  });

  it('matches percents', () => {
    expect(containsAnswer('a 65.1% stake', { kind: 'percent', value: 65.1 })).toBe(true);
    expect(containsAnswer('34.9 percent', { kind: 'percent', value: 65.1 })).toBe(false);
  });

  it('matches text aliases as whole words, ignoring case and punctuation', () => {
    const key: AnswerKey = { kind: 'text', accept: ['Ping Chen'] };
    expect(containsAnswer('Mr. Ping Chen, President', key)).toBe(true);
    expect(containsAnswer('Mr. Ping Cheng', key)).toBe(false);
  });
});

describe('gradeResearch', () => {
  it('passes a correct answer citing the primary filing', () => {
    const r = gradeResearch(json({ found: true, answer: 'May 28, 2026', docId: 'd2' }), recordDate);
    expect(r.notes).toEqual([]);
    expect(r.pass).toBe(true);
    expect(r.citedSourceType).toBe('primary');
  });

  it('fails the stale value from the conflicting aggregator', () => {
    const r = gradeResearch(json({ found: true, answer: 'May 27, 2026', docId: 'd1' }), recordDate);
    expect(r.checks.correct).toBe(false);
    expect(r.checks.citedHasAnswer).toBe(false);
    expect(r.checks.citedPrimary).toBe(false);
  });

  it('fails a correct answer whose cited doc does not contain it', () => {
    const r = gradeResearch(json({ found: true, answer: 'May 28, 2026', docId: 'd3' }), recordDate);
    expect(r.checks.correct).toBe(true);
    expect(r.checks.citedHasAnswer).toBe(false);
    expect(r.pass).toBe(false);
  });

  it('fails a citation outside the bundle', () => {
    const r = gradeResearch(json({ found: true, answer: 'May 28, 2026', docId: 'd9' }), recordDate);
    expect(r.checks.citedDocExists).toBe(false);
  });

  it('fails "not found" when the answer is in the bundle', () => {
    const r = gradeResearch(json({ found: false, answer: null, docId: null }), recordDate);
    expect(r.checks.notFoundHandled).toBe(false);
    expect(r.checks.correct).toBe(false);
  });

  it('passes "not found" on a no-answer bundle and skips citation checks', () => {
    const r = gradeResearch(json({ found: false, answer: null, docId: null }), testCase({ kind: 'not_found' }));
    expect(r.pass).toBe(true);
    expect(Object.keys(r.checks)).toEqual(['parsed', 'notFoundHandled']);
  });

  it('fails an answer on a no-answer bundle', () => {
    const r = gradeResearch(json({ found: true, answer: 'P0.50', docId: 'd1' }), testCase({ kind: 'not_found' }));
    expect(r.pass).toBe(false);
    expect(r.checks.notFoundHandled).toBe(false);
  });

  it('fails unparseable output', () => {
    const r = gradeResearch('I think May 28.', recordDate);
    expect(r.pass).toBe(false);
    expect(r.found).toBeNull();
  });
});
