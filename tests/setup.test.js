const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');

process.env.WARDEN_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'warden-setup-'));
const { setup, off } = require('../src/setup');
const store = require('../src/store');
const ROOT = '/opt/warden';

function settingsFile(obj) {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-')), 'settings.json');
  if (obj) fs.writeFileSync(f, JSON.stringify(obj, null, 2) + '\n');
  return f;
}

test('setup wraps existing status line and off restores it exactly', () => {
  const f = settingsFile({ model: 'opus', statusLine: { type: 'command', command: 'my-line.sh' } });
  const before = fs.readFileSync(f, 'utf8');
  setup(f, ROOT);
  const s = JSON.parse(fs.readFileSync(f, 'utf8'));
  assert.equal(s.statusLine.command, 'node "/opt/warden/bin/warden-status.js"');
  assert.equal(store.readJSON('statusline.json', {}).command, 'my-line.sh');
  assert.ok(fs.existsSync(f + '.warden-bak'));
  setup(f, ROOT);
  assert.equal(store.readJSON('statusline.json', {}).command, 'my-line.sh');
  off(f);
  assert.equal(fs.readFileSync(f, 'utf8'), before);
});

test('setup with no status line; off removes the key', () => {
  const f = settingsFile({ model: 'opus' });
  setup(f, ROOT);
  off(f);
  assert.deepEqual(JSON.parse(fs.readFileSync(f, 'utf8')), { model: 'opus' });
});

test('setup when settings file does not exist', () => {
  const f = settingsFile(null);
  setup(f, ROOT);
  assert.ok(JSON.parse(fs.readFileSync(f, 'utf8')).statusLine);
});
