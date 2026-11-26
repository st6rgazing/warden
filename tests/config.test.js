const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'warden-')); }
function fresh(home) { process.env.WARDEN_HOME = home; delete require.cache[require.resolve('../src/config')]; return require('../src/config'); }

test('defaults when no files', () => {
  const { loadConfig } = fresh(tmp());
  const c = loadConfig(tmp());
  assert.equal(c.subagent.weekPct, 2);
  assert.equal(c.subagent.tokens, 1500000);
  assert.equal(c.spawn.maxDepth, 2);
  assert.equal(c.spawn.maxConcurrent, 4);
  assert.equal(c.mode, 'auto');
});

test('project overrides user', () => {
  const home = tmp(), proj = tmp();
  fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify({ subagent: { minutes: 30 } }));
  fs.mkdirSync(path.join(proj, '.claude'));
  fs.writeFileSync(path.join(proj, '.claude', 'warden.json'), JSON.stringify({ subagent: { minutes: 60 } }));
  const { loadConfig } = fresh(home);
  const c = loadConfig(proj);
  assert.equal(c.subagent.minutes, 60);
  assert.equal(c.subagent.toolCalls, 250);
});

test('malformed json falls back to defaults with a warning', () => {
  const home = tmp();
  fs.writeFileSync(path.join(home, 'config.json'), '{nope');
  const { loadConfig } = fresh(home);
  const c = loadConfig(tmp());
  assert.equal(c.subagent.weekPct, 2);
  assert.match(loadConfig.lastWarning, /config/);
});

test('wrong-type values are ignored, rest still applies', () => {
  const home = tmp();
  fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify({ spawn: null, subagent: { minutes: 'lots', toolCalls: 99 } }));
  const { loadConfig } = fresh(home);
  const c = loadConfig(tmp());
  assert.equal(c.spawn.maxDepth, 2);
  assert.equal(c.subagent.minutes, 45);
  assert.equal(c.subagent.toolCalls, 99);
  assert.match(loadConfig.lastWarning, /spawn|minutes/);
});
