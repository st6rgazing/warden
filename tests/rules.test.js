const test = require('node:test');
const assert = require('node:assert/strict');
const r = require('../src/rules');
const { DEFAULTS: cfg } = require('../src/config');
const M = 60000, NOW = 10_000_000_000;

test('spawn: depth limit', () => {
  assert.equal(r.checkSpawn([], 2, cfg).action, 'deny');
  assert.equal(r.checkSpawn([], 1, cfg).action, 'allow');
});
test('spawn: concurrency limit', () => {
  const four = [1, 2, 3, 4].map((i) => ({ id: String(i), depth: 1 }));
  assert.equal(r.checkSpawn(four, 0, cfg).action, 'deny');
  assert.equal(r.checkSpawn(four.slice(1), 0, cfg).action, 'allow');
});
test('loop: warn at 5, deny at 8, window respected', () => {
  const h = (n, gap = 1000) => Array.from({ length: n }, (_, i) => ({ hash: 'x', ts: NOW - i * gap }));
  assert.equal(r.checkLoop(h(3), 'x', NOW, cfg).action, 'allow');
  assert.equal(r.checkLoop(h(4), 'x', NOW, cfg).action, 'warn');
  assert.equal(r.checkLoop(h(7), 'x', NOW, cfg).action, 'deny');
  assert.equal(r.checkLoop(h(4, 3.7 * M), 'x', NOW, cfg).action, 'allow');
  assert.equal(r.checkLoop(h(7), 'y', NOW, cfg).action, 'allow');
});
test('weekly thresholds', () => {
  const rl = (p) => ({ seven_day: { used_percentage: p, resets_at: 1 } });
  assert.equal(r.checkWeekly(rl(79), cfg).action, 'allow');
  const w = r.checkWeekly(rl(80), cfg);
  assert.equal(w.action, 'warn'); assert.equal(w.key, 'weekly80');
  assert.equal(r.checkWeekly(rl(95), cfg).action, 'ask');
  assert.equal(r.checkWeekly(undefined, cfg).action, 'allow');
  assert.equal(r.checkWeekly({}, cfg).action, 'allow');
});
test('pace warns when 5h window runs out soon', () => {
  const s = [0, 5, 10].map((m) => ({ ts: NOW - (10 - m) * M, fiveHourPct: 60 + 2 * m }));
  const d = r.checkPace(s, cfg, NOW);
  assert.equal(d.action, 'warn'); assert.equal(d.key, 'pace');
  assert.equal(r.checkPace(s.map((x) => ({ ...x, fiveHourPct: 50 })), cfg, NOW).action, 'allow');
  assert.equal(r.checkPace(s.slice(0, 1), cfg, NOW).action, 'allow');
});
test('inputHash is stable across key order', () => {
  assert.equal(r.inputHash('Bash', { a: 1, b: 2 }), r.inputHash('Bash', { b: 2, a: 1 }));
  assert.notEqual(r.inputHash('Bash', { a: 1 }), r.inputHash('Read', { a: 1 }));
});
