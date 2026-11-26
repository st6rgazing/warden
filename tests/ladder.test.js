const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, STOP_REASON } = require('../src/ladder');
const { DEFAULTS: cfg } = require('../src/config');

const NOW = 1_000_000_000;
const limits = { weekPct: 2, minutes: 45, toolCalls: 250 };
const rec = (o = {}) => ({ spent: { weekPct: 0, tokens: 0, usd: 0 }, startedAt: NOW, toolCalls: 0, denials: 0, warned: [], allowance: 0, ...o });
const at = (pct, o) => rec({ spent: { weekPct: 2 * pct, tokens: 0, usd: 0 }, ...o });

test('74% allows', () => assert.equal(evaluate(at(0.74), limits, cfg, NOW).action, 'allow'));
test('75% warns once', () => {
  const d = evaluate(at(0.75), limits, cfg, NOW);
  assert.equal(d.action, 'warn'); assert.equal(d.key, 'warn75');
  assert.equal(evaluate(at(0.75, { warned: ['warn75'] }), limits, cfg, NOW).action, 'allow');
});
test('100% denies with exact reason', () => {
  const d = evaluate(at(1), limits, cfg, NOW);
  assert.equal(d.action, 'deny');
  assert.equal(d.reason, "Warden: budget reached. Do not call more tools. Reply now with a summary of what you found and what's left undone.");
  assert.equal(STOP_REASON, d.reason);
});
test('100% after 5 denials is hardstop', () => assert.equal(evaluate(at(1, { denials: 5 }), limits, cfg, NOW).action, 'hardstop'));
test('tool calls alone deny', () => assert.equal(evaluate(rec({ toolCalls: 250 }), limits, cfg, NOW).action, 'deny'));
test('minutes alone deny', () => assert.equal(evaluate(rec({ startedAt: NOW - 46 * 60000 }), limits, cfg, NOW).action, 'deny'));
test('allowance raises the cap', () => assert.equal(evaluate(at(1.2, { allowance: 0.5 }), limits, cfg, NOW).action, 'allow'));
test('missing limits are ignored', () => assert.equal(evaluate(at(5), { toolCalls: 250 }, cfg, NOW).action, 'allow'));
