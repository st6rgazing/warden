const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');

process.env.WARDEN_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'warden-cli-'));
const store = require('../src/store');
const { allow, status } = require('../src/cli');

test('allow raises the most recently denied agent and resets denials', () => {
  store.writeJSON('sessions/s1.json', { sid: 's1', startedAt: 1, agents: {
    main: { id: 'main', spent: {}, toolCalls: 0 },
    a: { id: 'a', agentType: 'Explore', allowance: 0, denials: 3, lastDeniedAt: 10, spent: {}, toolCalls: 0 },
    b: { id: 'b', agentType: 'Plan', allowance: 0, denials: 1, lastDeniedAt: 5, spent: {}, toolCalls: 0 },
  } });
  assert.match(allow('+50%'), /Explore/);
  const s = store.readJSON('sessions/s1.json');
  assert.equal(s.agents.a.allowance, 0.5);
  assert.equal(s.agents.a.denials, 0);
  assert.equal(s.agents.b.allowance, 0);
});

test('allow with nothing denied explains', () => {
  store.writeJSON('sessions/s1.json', { sid: 's1', startedAt: 1, agents: { main: { id: 'main' } } });
  assert.match(allow('+50%'), /Nothing/);
});

test('allow rejects bad input', () => assert.match(allow('lots'), /Usage/));

test('status lists running subagents', () => {
  store.writeJSON('sessions/s2.json', { sid: 's2', startedAt: Date.now(), agents: { main: { id: 'main' }, q: { id: 'q', agentType: 'Explore', ended: false, startedAt: Date.now(), spent: { tokens: 1000 }, toolCalls: 10 } } });
  assert.match(status(), /Explore/);
});

test('--today counts only usage in the window, even for an old session', () => {
  const now = Date.now();
  store.writeJSON('sessions/old.json', { sid: 'old', startedAt: now - 3 * 86400000, updatedAt: now, agents: { main: { id: 'main', spent: { tokens: 9e6, weekPct: 30 }, toolCalls: 900 } } });
  store.appendLedger({ type: 'call', session: 'old', id: 'main', agentType: 'main', source: 'tool:Bash', tokens: 1e6, usd: 0 });
  const { runReport } = require('../src/cli');
  const out = runReport(['--today']);
  const row = out.split('\n').find((l) => l.startsWith('main thread'));
  assert.ok(row, out);
  assert.match(row, /1\.0M/);
  assert.doesNotMatch(row, /9\.0M/);
});

test('allow also clears a subagent loop block', () => {
  store.writeJSON('sessions/s9.json', { sid: 's9', startedAt: 1, agents: { main: { id: 'main' },
    z: { id: 'z', agentType: 'Explore', denials: 1, lastDeniedAt: 99, history: [{ hash: 'h', ts: 1 }], spent: {}, toolCalls: 0 } } });
  allow('+10%');
  assert.deepEqual(store.readJSON('sessions/s9.json').agents.z.history, []);
});

test('week report starts at the current weekly window when known', () => {
  const now = Date.now();
  const resets = Math.floor((now + 2 * 86400000) / 1000);
  store.writeJSON('state/zz.json', { rate_limits: { seven_day: { used_percentage: 10, resets_at: resets } } });
  const { weekStart } = require('../src/cli');
  assert.equal(weekStart(now), resets * 1000 - 7 * 86400000);
});
