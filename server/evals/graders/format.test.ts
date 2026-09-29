import { describe, expect, it } from 'vitest';
import { gradeFormat } from './format.ts';
import type { ThesisCase } from '../types.ts';

const testCase = { context: { ticker: 'AREIT', companyName: 'AREIT, Inc.' } } as ThesisCase;

const paragraph = (n: number) => `Paragraph ${n} about AREIT. ${'Solid recurring rental income backed by Ayala Land. '.repeat(3)}`;

const good = [
  paragraph(1),
  paragraph(2),
  paragraph(3),
  '---VERDICT---',
  'watch',
  '---HIGHLIGHTS---',
  '- Trades above MOS price',
  '- Steady dividend growth',
  '- Sponsor pipeline supports growth',
].join('\n\n');

describe('gradeFormat', () => {
  it('passes a well-formed thesis', () => {
    const result = gradeFormat(good, testCase);
    expect(result.notes).toEqual([]);
    expect(result.pass).toBe(true);
  });

  it('fails when the verdict block is missing', () => {
    const result = gradeFormat([paragraph(1), paragraph(2), paragraph(3)].join('\n\n'), testCase);
    expect(result.checks.verdictParsed).toBe(false);
    expect(result.pass).toBe(false);
  });

  it('fails on an invalid verdict word', () => {
    const result = gradeFormat(good.replace('\nwatch\n', '\nhold\n'), testCase);
    expect(result.checks.verdictParsed).toBe(false);
  });

  it('fails on headers and bullets in the thesis body', () => {
    const result = gradeFormat(`## Moat\n\n- point one\n\n${good}`, testCase);
    expect(result.checks.noHeaders).toBe(false);
    expect(result.checks.noBullets).toBe(false);
  });

  it('fails with too few paragraphs or highlights', () => {
    const result = gradeFormat(good.replace(`${paragraph(3)}\n\n`, '').replace('\n\n- Sponsor pipeline supports growth', ''), testCase);
    expect(result.checks.paragraphs3to5).toBe(false);
    expect(result.checks.threeHighlights).toBe(false);
  });

  it('fails when text follows the highlights', () => {
    const result = gradeFormat(`${good}\n\nLet me know if you want more detail.`, testCase);
    expect(result.checks.nothingAfterBlock).toBe(false);
  });

  it('fails when a marker is repeated after the highlights', () => {
    const result = gradeFormat(`${good}\n---HIGHLIGHTS---`, testCase);
    expect(result.checks.nothingAfterBlock).toBe(false);
  });

  it('fails when the company is never named', () => {
    const result = gradeFormat(good.replaceAll('AREIT', 'the REIT'), testCase);
    expect(result.checks.namesCompany).toBe(false);
  });

  it('accepts a short company name without the ticker or full legal name', () => {
    const jfc = { context: { ticker: 'JFC', companyName: 'Jollibee Foods Corporation' } } as ThesisCase;
    const result = gradeFormat(good.replaceAll('AREIT', 'Jollibee'), jfc);
    expect(result.checks.namesCompany).toBe(true);
  });

  it('accepts a multi-word name when the first word is generic', () => {
    const smc = { context: { ticker: 'SMC', companyName: 'San Miguel Corporation' } } as ThesisCase;
    expect(gradeFormat(good.replaceAll('AREIT', 'San Miguel'), smc).checks.namesCompany).toBe(true);
    expect(gradeFormat(good.replaceAll('AREIT', 'San'), smc).checks.namesCompany).toBe(false);
  });

  it('writes a note for every failed check', () => {
    const result = gradeFormat('## Moat\n\n- point one\n\nshort', testCase);
    const failed = Object.entries(result.checks).filter(([, ok]) => !ok);
    expect(failed.length).toBeGreaterThan(0);
    expect(result.notes).toHaveLength(failed.length);
  });

  it('marks a well-formed thesis usable and format-perfect', () => {
    const result = gradeFormat(good, testCase);
    expect(result.usable).toBe(true);
    expect(result.pass).toBe(true);
  });

  it('keeps a style-only failure usable', () => {
    const result = gradeFormat(`${good}\n---`, testCase);
    expect(result.pass).toBe(false);
    expect(result.usable).toBe(true);
  });

  it('marks output unusable when the verdict is missing or highlights are wrong', () => {
    expect(gradeFormat(good.replace('\nwatch\n', '\nhold\n'), testCase).usable).toBe(false);
    expect(gradeFormat(good.replace('\n\n- Sponsor pipeline supports growth', ''), testCase).usable).toBe(false);
  });
});

