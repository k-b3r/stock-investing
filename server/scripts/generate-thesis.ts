import { getPool } from '../src/db.ts';
import { upsertInvestmentThesis } from '../src/repositories/investment-theses.ts';
import { spawn } from 'child_process';
import { THESIS_INSTRUCTIONS } from '../prompts/thesis-instructions.ts';
import { buildFactCheckPrompt } from '../prompts/fact-check.ts';
import { buildDataBlock, buildTickerContext, parseThesisOutput, sanityCheck } from './thesis-context.ts';

interface ClaudeJsonResult {
  result: string;
  total_cost_usd?: number;
  is_error?: boolean;
}

interface StreamEvent {
  type: string;
  message?: { content?: { type: string; name?: string; input?: unknown; text?: string }[] };
  result?: string;
  total_cost_usd?: number;
  is_error?: boolean;
  num_turns?: number;
}

function logStreamEvent(event: StreamEvent): void {
  if (event.type === 'assistant' && event.message?.content) {
    for (const block of event.message.content) {
      if (block.type === 'tool_use') {
        console.log(`\n    [tool] ${block.name}: ${JSON.stringify(block.input).slice(0, 120)}`);
      } else if (block.type === 'text' && block.text?.trim()) {
        console.log(`\n    [writing] ${block.text.slice(0, 150).replace(/\s+/g, ' ')}...`);
      }
    }
  } else if (event.type === 'result') {
    console.log(`\n    [done] turns: ${event.num_turns ?? '?'}, est. cost: $${(event.total_cost_usd ?? 0).toFixed(4)}`);
  }
}

function runClaude(stdinData: string, promptArg: string, model: string, tools: string, maxBudget: string): Promise<ClaudeJsonResult | null> {
  return new Promise((resolve) => {
    const proc = spawn(
      'claude',
      ['-p', promptArg, '--model', model, '--tools', tools, '--permission-mode', 'bypassPermissions', '--max-budget-usd', maxBudget, '--output-format', 'stream-json', '--verbose', '--no-session-persistence'],
      { stdio: ['pipe', 'pipe', 'inherit'] }
    );

    let buffer = '';
    let finalResult: ClaudeJsonResult | null = null;

    proc.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line) as StreamEvent;
          logStreamEvent(event);
          if (event.type === 'result') {
            finalResult = { result: event.result ?? '', total_cost_usd: event.total_cost_usd, is_error: event.is_error };
          }
        } catch {
          // partial/non-JSON line — ignore, next chunk will complete it
        }
      }
    });

    proc.stdin.write(stdinData);
    proc.stdin.end();

    proc.on('close', (code) => {
      if (code !== 0 && !finalResult) {
        console.error(`\nclaude exited with status ${code}`);
      }
      resolve(finalResult);
    });

    proc.on('error', (err) => {
      console.error(`\nclaude invocation error: ${err.message}`);
      resolve(null);
    });
  });
}

async function generateForTicker(ticker: string): Promise<{ ok: boolean; cost: number; reason?: string }> {
  const ctx = await buildTickerContext(ticker);
  if (!ctx) return { ok: false, cost: 0, reason: 'no financials row for ticker' };

  const dataBlock = buildDataBlock(ctx);

  const genResult = await runClaude(dataBlock, THESIS_INSTRUCTIONS, 'sonnet', 'WebSearch,WebFetch', '0.50');
  if (!genResult || !genResult.result) {
    return { ok: false, cost: genResult?.total_cost_usd ?? 0, reason: 'generation failed or empty result' };
  }
  const genCost = genResult.total_cost_usd ?? 0;

  const { thesis, verdict, highlights } = parseThesisOutput(genResult.result);
  if (!verdict || highlights.length === 0) {
    console.log(`\n    [warn] could not parse verdict/highlights block for ${ctx.ticker} — storing thesis without them`);
  }

  const factCheckPrompt = buildFactCheckPrompt(ctx.ticker, dataBlock, thesis);

  const factCheckResult = await runClaude('', factCheckPrompt, 'haiku', '', '0.10');
  const factCheckCost = factCheckResult?.total_cost_usd ?? 0;
  const totalCost = genCost + factCheckCost;

  if (!factCheckResult || !factCheckResult.result) {
    return { ok: false, cost: totalCost, reason: 'fact-check call failed' };
  }

  let contradictions: string[] = [];
  try {
    const jsonMatch = factCheckResult.result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no JSON object found in response');
    const parsed = JSON.parse(jsonMatch[0]) as { contradictions: string[] };
    contradictions = parsed.contradictions ?? [];
  } catch {
    return { ok: false, cost: totalCost, reason: 'fact-check response was not valid JSON' };
  }

  if (contradictions.length > 0) {
    return { ok: false, cost: totalCost, reason: `contradictions found: ${contradictions.join('; ')}` };
  }

  const sanityIssue = sanityCheck(thesis, ctx);
  if (sanityIssue) {
    return { ok: false, cost: totalCost, reason: `sanity check failed: ${sanityIssue}` };
  }

  await upsertInvestmentThesis(ctx.ticker, thesis, verdict, highlights, ctx.lastPrice, ctx.stickerPrice, ctx.mosPrice, ctx.pe);
  return { ok: true, cost: totalCost };
}

const PSEI30 = [
  'AC', 'ACEN', 'AEV', 'AGI', 'ALI', 'AREIT', 'BDO', 'BPI', 'CNPF', 'CNVRG',
  'DMC', 'EMI', 'GLO', 'GTCAP', 'ICT', 'JFC', 'JGS', 'LTG', 'MBT', 'MER',
  'MONDE', 'PGOLD', 'PLUS', 'SCC', 'SM', 'SMC', 'SMPH', 'TEL', 'URC',
];

const TICKER_ARG = process.argv[2];
const tickers = TICKER_ARG ? [TICKER_ARG.toUpperCase()] : PSEI30;

console.log(`Generating investment theses for ${tickers.length} ticker(s)...\n`);

let succeeded = 0;
let failed = 0;
let totalCost = 0;

for (const [i, ticker] of tickers.entries()) {
  process.stdout.write(`[${String(i + 1).padStart(2)}/${tickers.length}] ${ticker.padEnd(8)}`);
  const result = await generateForTicker(ticker);
  totalCost += result.cost;
  if (result.ok) {
    console.log(`→ stored (est. cost: $${result.cost.toFixed(4)})`);
    succeeded++;
  } else {
    console.log(`→ FAILED: ${result.reason} (est. cost: $${result.cost.toFixed(4)})`);
    failed++;
  }
}

await getPool().end();
console.log(`\nDone. ${succeeded} succeeded, ${failed} failed. Estimated total cost: $${totalCost.toFixed(4)} (informational — billed against your Claude Code subscription, not per-call).`);
