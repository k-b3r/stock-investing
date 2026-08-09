# Claude Power User Guide

---

## Part 1 — How Claude 4.x Actually Works (Mental Model)

Understanding this changes how you prompt.

**Claude 4.x is literal.** Earlier versions inferred your intent and expanded vague requests. Claude 4.x does exactly what you ask — nothing more, nothing less. If you're vague, you get vague output. If you're specific, you get surgical output.

**Claude has no memory between conversations** (unless you use Projects or Memory). Every new chat is a blank slate. Build your context explicitly.

**Context window degrades at high fill.** Quality drops at ~70%, hallucinations increase at ~85%, responses become erratic at ~90%+. Manage this actively.

**Claude reasons before answering.** With Extended Thinking enabled, Claude internally reasons through problems before producing output — you don't need to tell it how to think. Without it, you can steer reasoning via prompting.

---

## Part 2 — Prompting Fundamentals

### The Golden Rule

Write prompts as if handing them to a brilliant new hire who has zero context on your norms, codebase, or expectations. If they'd be confused, Claude will be too.

### Structure: XML Tags

Claude is specifically trained to respect XML tag structure. Use them to separate context from instructions from examples from output format.

```
<context>
You're working on a Node.js/TypeScript backend. The system uses Drizzle ORM, BullMQ for queues, PostgreSQL.
</context>

<task>
Review the following service for: correctness, edge cases, missing error handling, type safety.
</task>

<code>
[paste code here]
</code>

<output_format>
Findings as a list. Each finding: what, why it matters, how to fix. Skip anything that's fine.
</output_format>
```

Useful tag names (you can invent your own):
- `<context>`, `<background>` — situational info
- `<task>`, `<instructions>` — what you want done
- `<code>`, `<input>`, `<document>` — the material to work on
- `<examples>` — few-shot examples
- `<constraints>` — rules and limits
- `<output_format>` — exactly what the response should look like
- `<thinking>`, `<answer>` — for steering CoT manually

### Few-Shot Examples (Highest Impact Technique)

Show Claude what good output looks like. One example is good. Two or three is better. Claude generalizes the pattern.

```
<examples>
<example>
Input: getUserById(id) - returns User | null
Review: Missing null check on line 12 — if user is null, `.email` access throws. Fix: add early return guard.
</example>

<example>
Input: createOrganization(data) - inserts org
Review: No transaction wrapping — if second insert fails, first is committed. Fix: wrap in db.transaction().
</example>
</examples>

Now review this:
<code>[your code]</code>
```

### Role Assignment

Give Claude a role when the task benefits from a specific perspective. Keep it minimal — no need for elaborate personas.

Good: `"You are a senior backend engineer focused on security. Review this for vulnerabilities."`  
Bad: `"You are an expert genius 10x engineer with 50 years of experience..."` — verbose roles add noise without value.

### Explicit Output Format

Always specify exactly what you want back. Claude won't assume.

- Format: prose, bullets, table, code only, JSON
- Length: "3 sentences max", "under 100 words", "as brief as possible"
- Structure: "one section per issue", "only the diff, no explanation"

### What NOT to Do (Claude 4.x Specific)

- **Don't use CAPS for emphasis** — `NEVER do X` — Claude 4.x interprets caps literally but doesn't give it special weight. Use plain conditional logic instead: "If verified data is available, use exact figures. If not, provide ranges labeled as estimates."
- **Don't add "think step by step"** when Extended Thinking is on — it's redundant and wastes tokens
- **Don't use negative prohibitions as the main instruction** — "don't talk about X" keeps X active in context. Redirect positively: tell it what TO do
- **Don't over-prompt Opus 4.6** — it's proactive by default. Remove blanket "always use tool X" instructions; they cause overtriggering

---

## Part 3 — Context Management

### Context Window Budget (Claude Code + API)

| Fill Level | State | Action |
|---|---|---|
| 0–50% | Free | Work normally |
| 50–70% | Attention | Wrap up current subtask |
| 70–90% | Degrading | `/compact` to summarize |
| 90%+ | Danger | `/clear` mandatory |

### How to Feed Context Efficiently

**Put the most important info last.** Claude weights the end of context more heavily than the middle. If you have a long document and a short question, the question at the end performs better than the question at the top.

**For long documents, use XML to scope:** 
```
<document>
[10,000 word spec]
</document>

Focus only on the authentication section. What are the security risks?
```

**Use `/compact` not `/clear` when you want to preserve working state.** Compact summarizes the conversation into an efficient snapshot. Clear wipes everything.

**Reference files by path, don't paste.** In Claude Code, `@src/services/auth.ts` is more context-efficient than pasting the file contents.

---

## Part 4 — Extended Thinking (Claude.ai)

Enable via the "Extended thinking" toggle (Sonnet 4.6 and Opus 4.6).

**Use for:**
- Architecture decisions with many trade-offs
- Complex debugging where the root cause is non-obvious
- Multi-constraint optimization (design a system that satisfies A, B, C, D)
- Math, logic, and reasoning-heavy tasks

**Prompting for thinking:**
- Ask for depth, not steps: `"Think thoroughly about this. Consider multiple approaches before deciding."`
- Don't prescribe the thinking process — Claude's approach often beats your prescription
- Ask it to self-verify: `"Before answering, verify your solution against these test cases: [cases]"`

**Don't use for:**
- Simple factual lookups
- Short code tasks
- Anything where latency matters

---

## Part 5 — Claude.ai Features Power Users Use

### Projects

Projects give Claude **persistent memory and a persistent system prompt** across all conversations within that project. This is the single most underused power feature in claude.ai.

How to use it well:
- Create a project per codebase, client, or domain
- Set a system prompt with your stack, preferences, constraints, and communication style
- Upload relevant docs, architecture diagrams, or specs as project knowledge
- Every conversation in the project has that context without re-pasting it

For your backend work: one project per service/repo. System prompt = condensed CLAUDE.md.

### Memory

Claude can store and recall facts across conversations. Edit via Settings → Memory, or just say "remember that..." in chat. Review and clean it periodically — stale memories can anchor wrong assumptions.

Use it for: your tech stack, your style preferences, recurring project context.

### Deep Research

Triggers a multi-step web research process. For engineering: use it for comparing technologies, investigating underdocumented library behavior, or gathering competitive context before architectural decisions. Much more thorough than a single search.

### Artifacts

Claude can produce live-rendered outputs (HTML apps, React components, SVGs, Mermaid diagrams) alongside the conversation. Power usage: iterate on the artifact in-place rather than re-pasting code.

---

## Part 6 — Prompt Patterns for Software Engineers

### Pattern: Diagnose Before Fix

```
Before suggesting any fix, diagnose the root cause. Explain why the bug happens. 
Then propose the minimal change that addresses the root cause without side effects.
```

### Pattern: Constrained Refactor

```
Refactor this function for readability. 
Constraints: same public API, no new dependencies, stay under 40 lines, keep error handling identical.
```

### Pattern: Review With Criteria

```
Review this PR diff for:
1. Correctness — does it do what it claims?
2. Edge cases — what inputs would break it?
3. Security — any injection, auth, or data exposure risk?
4. Performance — any obvious N+1, missing index, or cache thrash?

Skip praise. Only report findings. One line per issue + how to fix.
```

### Pattern: Spec → Plan → Verify

```
<spec>
[feature description]
</spec>

Step 1: Ask me any clarifying questions before planning.
Step 2: Once I answer, produce a detailed implementation plan with phases.
Step 3: End the plan with: "Unresolved questions (if any): [list]"
```

### Pattern: Rubber Duck Debugging

```
I have a bug I can't figure out. I'm going to explain what I expect vs. what I see.
Don't suggest fixes yet — just ask me questions to narrow down where the issue is.

Expected: [X]
Actual: [Y]
What I've tried: [Z]
```

### Pattern: Documentation Generation

```
Write JSDoc for this function. 
Include: description, each @param with type and description, @returns, one @example that shows a realistic use case. 
No obvious filler — only document what's non-obvious.
```

### Pattern: Migration Script Generation

```
<current_schema>[schema]</current_schema>
<target_schema>[schema]</target_schema>

Generate a PostgreSQL migration script. 
Requirements: non-destructive, idempotent, includes rollback statements, handles null constraints safely.
```

---

## Part 7 — Mindset Shifts

**Shift 1: Describe the outcome, not the steps.**  
Novice: "Write a function that loops through users, checks if they're active, and sends an email."  
Power user: "Send a welcome email to all active users. Here's the mailer API and the user schema."

**Shift 2: Treat conversation as iteration, not one-shot.**  
Don't try to get the perfect output in one prompt. Get a 70% output, then steer: "Good. Now make the error handling more specific — distinguish network errors from validation errors."

**Shift 3: Use Claude for thinking, not just execution.**  
Before writing any significant code: "I need to design a multi-tenant queue system using BullMQ and Redis. Here are my constraints: [X]. What are the 2–3 architectural approaches? What are the trade-offs?"

**Shift 4: Give Claude the exit condition.**  
Tell it when to stop and ask, not just when to proceed. "If you're more than 50% confident you'd need to change more than 3 files, stop and ask me before proceeding."

**Shift 5: Verify, don't trust.**  
Claude Code generates ~1.75x more logic errors than human-written code (ACM 2025). Run types, run tests, read the diff. Claude is a force multiplier for a skilled engineer, not a replacement for one.

---

## Part 8 — Quick Reference Cheatsheet

### Prompt Structure Template
```
[Role if relevant — brief]
<context>[stack/project/situation]</context>
<task>[what you want]</task>
<input>[the material]</input>
<constraints>[rules]</constraints>
<output_format>[exactly what to return]</output_format>
```

### Steering Responses Mid-Conversation
- "Too verbose — same answer in half the words"
- "Skip the explanation, just give me the code"
- "You're wrong about X because [reason]. Reconsider."
- "Good structure, wrong implementation. Keep the structure, redo the implementation."
- "Stop. Before continuing, ask me [these questions]."

### Context Window SOS
- Approaching limit: `/compact` → summarizes, preserves context
- Starting fresh task: `/clear` → blank slate
- Long-running task: save state to file → `/clear` → resume with: `@state-file.md Continue from where we left off.`

### Model Selection (Claude Code)
| Task | Model |
|---|---|
| Architecture, complex reasoning, hard bugs | Opus 4.6 |
| Most daily coding, refactors, reviews | Sonnet 4.6 |
| Quick lookups, summaries, simple fixes | Haiku 4.5 |

Default in Claude Code: Opus until 50% usage limit → auto-switches to Sonnet.
