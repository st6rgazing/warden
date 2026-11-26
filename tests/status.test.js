const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
const { spawnSync } = require('child_process');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'warden-st-'));
process.env.WARDEN_HOME = HOME;
const { badge } = require('../src/badge');
const store = require('../src/store');
const BIN = path.join(__dirname, '..', 'bin', 'warden-status.js');

const limitsPayload = { session_id: 'st1', rate_limits: { seven_day: { used_percentage: 41.2 }, five_hour: { used_percentage: 23.5 } }, cost: { total_cost_usd: 1 } };

test('badge in limits, dollar and empty modes', () => {
  assert.equal(badge(limitsPayload), '⛨ wk 41% · 5h 24%');
  assert.equal(badge({ cost: { total_cost_usd: 4.1 } }), '⛨ $4.10');
  assert.equal(badge({}), '⛨');
});

function run(payload, original) {
  if (original === undefined) fs.rmSync(path.join(HOME, 'statusline.json'), { force: true });
  else store.writeJSON('statusline.json', { command: original });
  return spawnSync(process.execPath, [BIN], { input: JSON.stringify(payload), env: { ...process.env, WARDEN_HOME: HOME } });
}

test('wraps the original status line and writes state', () => {
  const r = run(limitsPayload, `${JSON.stringify(process.execPath)} -e "process.stdin.on('data',d=>process.stdout.write('orig:'+JSON.parse(d).session_id+'\\n'))"`);
  assert.equal(r.status, 0);
  assert.equal(r.stdout.toString(), 'orig:st1 ⛨ wk 41% · 5h 24%\n');
  assert.equal(store.readJSON('state/st1.json', {}).rate_limits.seven_day.used_percentage, 41.2);
  assert.equal(store.readJSON('pace/st1.json', []).at(-1).fiveHourPct, 23.5);
});

test('no original: badge only', () => {
  assert.equal(run(limitsPayload).stdout.toString(), '⛨ wk 41% · 5h 24%\n');
});

test('failing original: badge only, exit 0', () => {
  const r = run(limitsPayload, 'exit 1');
  assert.equal(r.status, 0);
  assert.equal(r.stdout.toString(), '⛨ wk 41% · 5h 24%\n');
});

test('hanging original times out: badge only', () => {
  const t = Date.now();
  const r = run(limitsPayload, `${JSON.stringify(process.execPath)} -e "setTimeout(()=>{},5000)"`);
  assert.equal(r.stdout.toString(), '⛨ wk 41% · 5h 24%\n');
  assert.ok(Date.now() - t < 3000);
});

test('garbage stdin: still prints a badge', () => {
  const r = spawnSync(process.execPath, [BIN], { input: 'nope', env: { ...process.env, WARDEN_HOME: HOME } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.toString(), '⛨\n');
});

test('shim runs the wrapper found in root.json (I6)', () => {
  const { installShim } = require('../src/setup');
  installShim(path.join(__dirname, '..'));
  const r = spawnSync(process.execPath, [path.join(HOME, 'status-shim.js')], { input: JSON.stringify(limitsPayload), env: { ...process.env, WARDEN_HOME: HOME } });
  assert.match(r.stdout.toString(), /⛨ wk 41%/);
  store.writeJSON('root.json', { root: '/gone' });
  const r2 = spawnSync(process.execPath, [path.join(HOME, 'status-shim.js')], { input: JSON.stringify(limitsPayload), env: { ...process.env, WARDEN_HOME: HOME } });
  assert.equal(r2.status, 0);
});
