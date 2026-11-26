'use strict';
// List prices in USD per million tokens, by model family. Estimates only;
// dollar mode prefers Claude Code's own cost.total_cost_usd when available.
const FAMILIES = {
  opus: { input: 5, output: 25 },
  sonnet: { input: 3, output: 15 },
  haiku: { input: 1, output: 5 },
  fable: { input: 15, output: 75 },
};
const FALLBACK = FAMILIES.sonnet;
const CACHE_WRITE = 1.25;
const CACHE_READ = 0.1;

function priceFor(model) {
  const m = String(model || '').toLowerCase();
  for (const [k, v] of Object.entries(FAMILIES)) if (m.includes(k)) return v;
  return FALLBACK;
}

module.exports = { priceFor, CACHE_WRITE, CACHE_READ };
