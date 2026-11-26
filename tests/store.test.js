const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
const { fork } = require('child_process');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'warden-store-'));
process.env.WARDEN_HOME = home;
const store = require('../src/store');

test('writeJSON then readJSON roundtrip', () => {
  store.writeJSON('state/a.json', { x: 1 });
  assert.deepEqual(store.readJSON('state/a.json', null), { x: 1 });
});

test('readJSON missing returns fallback', () => {
  assert.equal(store.readJSON('nope.json', 7), 7);
});

test('appendLedger writes one line per call', () => {
  store.appendLedger({ type: 't', n: 1 });
  store.appendLedger({ type: 't', n: 2 });
  const dir = path.join(home, 'ledger');
  const lines = fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]), 'utf8').trim().split('\n');
  assert.equal(lines.length, 2);
  assert.equal(JSON.parse(lines[1]).n, 2);
  assert.ok(JSON.parse(lines[0]).ts);
});

test('concurrent update() keeps file valid', async () => {
  const worker = path.join(__dirname, 'helpers', 'inc-worker.js');
  await Promise.all(Array.from({ length: 20 }, () => new Promise((res) => {
    fork(worker, [], { env: { ...process.env, WARDEN_HOME: home } }).on('exit', res);
  })));
  const v = store.readJSON('counter.json', { n: 0 });
  assert.ok(v.n >= 19, `got ${v.n}`);
});

test('logError appends to errors.log', () => {
  store.logError(new Error('boom'));
  assert.match(fs.readFileSync(path.join(home, 'errors.log'), 'utf8'), /boom/);
});
