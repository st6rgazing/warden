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
