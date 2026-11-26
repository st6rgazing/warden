const test = require('node:test');
const assert = require('node:assert/strict');
const { report } = require('../src/report');

const agent = (id, agentType, o = {}) => ({ id, agentType, spent: { weekPct: 0, tokens: 0, usd: 0 }, toolCalls: 0, stoppedByWarden: false, ...o });
const sessions = [
  { sid: 'a', startedAt: 1, agents: {
    main: agent('main', null, { spent: { weekPct: 18.2, tokens: 6.1e6, usd: 0 }, toolCalls: 312 }),
    x1: agent('x1', 'Explore', { spent: { weekPct: 9, tokens: 3e6, usd: 0 }, toolCalls: 120, stoppedByWarden: true }),
    x2: agent('x2', 'Explore', { spent: { weekPct: 5.9, tokens: 2e6, usd: 0 }, toolCalls: 81 }),
    g1: agent('g1', 'general-purpose', { spent: { weekPct: 6.1, tokens: 2e6, usd: 0 }, toolCalls: 88, stoppedByWarden: true }),
  } },
];
const calls = [
  { type: 'call', source: 'mcp:github', tokens: 4e5 },
  { type: 'call', source: 'tool:Bash', tokens: 1e5 },
];
const latest = { seven_day: { used_percentage: 41, resets_at: 0 } };

test('rows grouped by source and sorted by tokens', () => {
  const out = report({ sessions, calls, latest, label: 'this week' });
  const lines = out.split('\n');
  assert.match(lines[0], /Warden · this week \(wk 41% used/);
  const rows = lines.filter((l) => /^(main thread|subagent:)/.test(l));
  assert.deepEqual(rows.map((r) => r.split(/\s{2,}/)[0]), ['main thread', 'subagent:Explore', 'subagent:general-purpose']);
  assert.match(rows[1], /14\.9%/);
  assert.match(rows[1], /5\.0M/);
  assert.match(rows[1], /2 runs, 1 stopped by Warden/);
  assert.match(out, /mcp:github\s+—\s+0\.4M/);
  assert.match(out, /Stopped by Warden: 2 runaway agents, est\. ≥15\.1% of week saved/);
});

test('dollar mode shows dollars, empty shows a friendly line', () => {
  const s = [{ sid: 'b', startedAt: 1, agents: { main: agent('main', null, { spent: { weekPct: 0, tokens: 1e6, usd: 2.5 }, toolCalls: 3 }) } }];
  assert.match(report({ sessions: s, calls: [], latest: undefined, label: 'today' }), /\$2\.50/);
  assert.match(report({ sessions: [], calls: [], latest: undefined, label: 'today' }), /No Warden data yet/);
});
