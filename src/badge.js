'use strict';
const pct = (w) => (w && typeof w.used_percentage === 'number' ? `${Math.round(w.used_percentage)}%` : null);

function badge(p) {
  const rl = (p && p.rate_limits) || {};
  const wk = pct(rl.seven_day), fh = pct(rl.five_hour);
  if (wk || fh) return `⛨ ${[wk && `wk ${wk}`, fh && `5h ${fh}`].filter(Boolean).join(' · ')}`;
  const usd = p && p.cost && p.cost.total_cost_usd;
  if (typeof usd === 'number') return `⛨ $${usd.toFixed(2)}`;
  return '⛨';
}

module.exports = { badge };
