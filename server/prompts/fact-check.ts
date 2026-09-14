export function buildFactCheckPrompt(ticker: string, dataBlock: string, thesis: string): string {
  return `Here is the source financial data for ${ticker}:
${dataBlock}

Here is a generated investment thesis for ${ticker}:
${thesis}

List any specific numeric claim in the thesis (price, P/E, growth rate, sticker price,
etc.) that contradicts the source data above. Ignore trivial rounding differences (e.g.
"43%" vs "42.4%", "₱1.35" vs "₱1.352") — only flag claims that are substantively wrong
(wrong direction, wrong order of magnitude, or off by more than ~2 percentage points /
2% relative). Respond with JSON only:
{"contradictions": ["<claim> contradicts <source value>", ...]}
Empty array if none found.`;
}
