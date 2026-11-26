'use strict';

const STOP_REASON = "Warden: budget reached. Do not call more tools. Reply now with a summary of what you found and what's left undone.";
const WARN_TEXT = 'Warden: ~25% of your budget left. Start wrapping up.';

// Fraction of budget used: the max over every dimension that has a limit.
function fractionUsed(record, limits, now) {
  const s = record.spent || {};
  const parts = [];
  if (limits.weekPct) parts.push((s.weekPct || 0) / limits.weekPct);
  if (limits.tokens) parts.push((s.tokens || 0) / limits.tokens);
  if (limits.usd) parts.push((s.usd || 0) / limits.usd);
  if (limits.toolCalls) parts.push((record.toolCalls || 0) / limits.toolCalls);
  if (limits.minutes && record.startedAt) parts.push((now - record.startedAt) / 60000 / limits.minutes);
  const used = parts.length ? Math.max(...parts) : 0;
  return used / (1 + (record.allowance || 0));
}

function evaluate(record, limits, cfg, now = Date.now()) {
  const f = fractionUsed(record, limits, now);
  if (f >= 1) {
    if ((record.denials || 0) >= cfg.ladder.hardStopDenials) return { action: 'hardstop', reason: STOP_REASON, fraction: f };
    return { action: 'deny', reason: STOP_REASON, fraction: f };
  }
  if (f >= cfg.ladder.warnFrac && !(record.warned || []).includes('warn75')) {
    return { action: 'warn', key: 'warn75', reason: WARN_TEXT, fraction: f };
  }
  return { action: 'allow', fraction: f };
}

module.exports = { evaluate, fractionUsed, STOP_REASON, WARN_TEXT };
