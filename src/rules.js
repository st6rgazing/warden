'use strict';
const crypto = require('crypto');

const ALLOW = { action: 'allow' };
const M = 60000;

function checkSpawn(active, parentDepth, cfg) {
  if (parentDepth + 1 > cfg.spawn.maxDepth) {
    return { action: 'deny', reason: `Warden: subagents may only nest ${cfg.spawn.maxDepth} levels deep. Do this work yourself instead of spawning another agent.` };
  }
  if (active.length >= cfg.spawn.maxConcurrent) {
    return { action: 'deny', reason: `Warden: ${active.length} subagents are already running (limit ${cfg.spawn.maxConcurrent}). Wait for one to finish before spawning another.` };
  }
  return ALLOW;
}

// history holds earlier calls by the same agent; the current call counts as one more.
function checkLoop(history, hash, now, cfg) {
  const since = now - cfg.loop.windowMin * M;
  const n = history.filter((h) => h.hash === hash && h.ts >= since).length + 1;
  if (n >= cfg.loop.stop) return { action: 'deny', reason: `Warden: this exact tool call has run ${n} times in ${cfg.loop.windowMin} minutes. Stop repeating it; change approach or report what you have.` };
  if (n >= cfg.loop.warn) return { action: 'warn', key: 'loop', reason: `Warden: you have made this exact tool call ${n} times in ${cfg.loop.windowMin} minutes. If it isn't working, change approach.` };
  return ALLOW;
}

function fmtReset(epochSec) {
  if (!epochSec) return '';
  return ` (resets ${new Date(epochSec * 1000).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })})`;
}

function checkWeekly(rl, cfg) {
  const w = rl && rl.seven_day;
  if (!w || typeof w.used_percentage !== 'number') return ALLOW;
  const p = w.used_percentage;
  if (p >= cfg.weekly.askPct) return { action: 'ask', reason: `Warden: ${p.toFixed(0)}% of your weekly limit is used${fmtReset(w.resets_at)}. Starting another subagent needs your OK.` };
  if (p >= cfg.weekly.warnPct) return { action: 'warn', key: 'weekly80', reason: `Warden: ${p.toFixed(0)}% of your weekly limit is used${fmtReset(w.resets_at)}. Prefer doing work directly over spawning subagents.` };
  return ALLOW;
}

// Linear rate over the last 15 minutes of samples.
function checkPace(samples, cfg, now = Date.now()) {
  const recent = samples.filter((s) => s.ts >= now - 15 * M && typeof s.fiveHourPct === 'number').sort((a, b) => a.ts - b.ts);
  if (recent.length < 2) return ALLOW;
  const a = recent[0], b = recent[recent.length - 1];
  const mins = (b.ts - a.ts) / M;
  const rate = mins > 0 ? (b.fiveHourPct - a.fiveHourPct) / mins : 0;
  if (rate <= 0) return ALLOW;
  const left = (100 - b.fiveHourPct) / rate;
  if (left < cfg.pace.warnMin) return { action: 'warn', key: 'pace', reason: `Warden: at this pace your 5-hour limit runs out in about ${Math.max(1, Math.round(left))} minutes. Keep remaining work small.` };
  return ALLOW;
}

function stable(v) {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

function inputHash(toolName, toolInput) {
  return crypto.createHash('sha1').update(`${toolName}\0${stable(toolInput)}`).digest('hex');
}

module.exports = { checkSpawn, checkLoop, checkWeekly, checkPace, inputHash };
