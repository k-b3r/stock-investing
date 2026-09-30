import { gradeFormat } from './format.ts';
import { gradeNaHandling } from './na-handling.ts';
import { gradeNumbers } from './numbers.ts';
import { gradeSanity } from './sanity.ts';
import { gradeTrap } from './trap.ts';
import { gradeVerdict } from './verdict.ts';
import type { RunGrades, ThesisCase } from '../types.ts';

// All per-run graders; ones that don't apply to the case are left out
export function gradeRun(output: string, testCase: ThesisCase): RunGrades {
  const grades: RunGrades = {
    format: gradeFormat(output, testCase),
    numbers: gradeNumbers(output, testCase),
    verdict: gradeVerdict(output, testCase),
    sanity: gradeSanity(output, testCase),
  };
  const naHandling = gradeNaHandling(output, testCase);
  const trap = gradeTrap(output, testCase);
  if (naHandling) grades.naHandling = naHandling;
  if (trap) grades.trap = trap;
  return grades;
}

// Which per-run graders apply (depends only on the case), so errored runs count as failures in the right columns
export const applicableGraders = (testCase: ThesisCase) => Object.keys(gradeRun('', testCase)) as (keyof RunGrades)[];
