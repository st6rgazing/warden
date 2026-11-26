#!/usr/bin/env node
'use strict';
// Status line wrapper: records usage numbers for Warden's hooks, runs the
// user's original status line, and appends a small badge. Never fails.
const { spawnSync } = require('child_process');
const PACE_KEEP = 60;

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  let payload = {};
  let line = '';
  try { payload = JSON.parse(input); } catch { payload = {}; }
  try {
    const store = require('../src/store');
    const sid = payload.session_id;
    if (sid) {
      store.writeJSON(`state/${sid}.json`, { rate_limits: payload.rate_limits, cost: payload.cost, cache: payload.cache, ts: Date.now() });
      const fh = payload.rate_limits && payload.rate_limits.five_hour;
      if (fh && typeof fh.used_percentage === 'number') {
        store.update(`pace/${sid}.json`, [], (s) => s.concat({ ts: Date.now(), fiveHourPct: fh.used_percentage }).slice(-PACE_KEEP));
      }
    }
    const orig = store.readJSON('statusline.json', null);
    if (orig && orig.command) {
      const r = spawnSync(orig.command, { shell: true, input, timeout: 1000, encoding: 'utf8' });
      if (r.stdout && r.stdout.trim()) line = r.stdout.trim();
    }
  } catch (e) {
    try { require('../src/store').logError(e); } catch { /* ignore */ }
  }
  let b = '⛨';
  try { b = require('../src/badge').badge(payload); } catch { /* keep plain badge */ }
  process.stdout.write(`${line ? `${line} ` : ''}${b}\n`);
  process.exit(0);
});
