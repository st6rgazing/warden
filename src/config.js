'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULTS = {
  enabled: true,
  quiet: false,
  mode: 'auto', // auto | limits | dollars
  subagent: { weekPct: 2, tokens: 1500000, minutes: 45, toolCalls: 250, usd: 3 },
  session: { usd: 20 },
  spawn: { maxDepth: 2, maxConcurrent: 4 },
  loop: { warn: 5, stop: 8, windowMin: 10 },
  weekly: { warnPct: 80, askPct: 95 },
  pace: { warnMin: 30 },
  ladder: { warnFrac: 0.75, hardStopDenials: 5 },
};

function wardenHome() {
  return process.env.WARDEN_HOME || path.join(os.homedir(), '.claude', 'warden');
}

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Deep merge; a value whose type doesn't match the default is ignored with a warning.
function merge(base, over, where = '') {
  const out = { ...base };
  if (!isObj(over)) return out;
  for (const [k, v] of Object.entries(over)) {
    const key = where ? `${where}.${k}` : k;
    if (!(k in base)) { out[k] = v; continue; }
    if (isObj(base[k])) {
      if (isObj(v)) out[k] = merge(base[k], v, key);
      else loadConfig.lastWarning = `Warden: ignoring config "${key}" (expected an object)`;
    } else if (typeof v === typeof base[k]) out[k] = v;
    else loadConfig.lastWarning = `Warden: ignoring config "${key}" (expected a ${typeof base[k]})`;
  }
  return out;
}

function readOptional(file) {
  if (!fs.existsSync(file)) return {};
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) {
    loadConfig.lastWarning = `Warden: ignoring bad config ${file}: ${e.message}`;
    return {};
  }
}

function loadConfig(cwd) {
  loadConfig.lastWarning = null;
  const user = readOptional(path.join(wardenHome(), 'config.json'));
  const proj = cwd ? readOptional(path.join(cwd, '.claude', 'warden.json')) : {};
  return merge(merge(DEFAULTS, user), proj);
}
loadConfig.lastWarning = null;

module.exports = { loadConfig, DEFAULTS, wardenHome };
