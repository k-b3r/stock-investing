import { THESIS_INSTRUCTIONS } from '../prompts/thesis-instructions.ts';

const RESEARCH_SENTENCE = `Using the company data provided via stdin AND your own research (use
WebSearch/WebFetch to check for recent news, competitive developments,
regulatory risk, or analyst sentiment not captured in the provided data),
write`;

// Eval inputs are frozen and models get no tools, so the production prompt's research
// instruction is swapped for a data-only one. Models otherwise emit tool calls as text.
if (!THESIS_INSTRUCTIONS.includes(RESEARCH_SENTENCE)) {
  throw new Error('THESIS_INSTRUCTIONS changed: update the research sentence in evals/prompts.ts');
}

export const EVAL_THESIS_INSTRUCTIONS = THESIS_INSTRUCTIONS.replace(
  RESEARCH_SENTENCE,
  `Using only the company data provided in the user message (you have no tools
and cannot browse), write`
);
