// End-to-end: needs a logged-in `claude` CLI. Run with WARDEN_E2E=1 npm test.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const enabled = process.env.WARDEN_E2E === '1' && spawnSync('claude', ['--version']).status === 0;

test('runaway subagent is stopped and its summary reaches the parent', { skip: !enabled && 'set WARDEN_E2E=1 with a logged-in claude CLI' }, () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'warden-e2e-'));
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'warden-proj-'));
  fs.mkdirSync(path.join(proj, '.claude'));
  fs.writeFileSync(path.join(proj, '.claude', 'warden.json'), JSON.stringify({ subagent: { toolCalls: 20 } }));
  const r = spawnSync('claude', ['-p', '--plugin-dir', ROOT, '--allowedTools', 'Bash(ls)', 'Agent', 'Task',
    'Spawn one subagent whose job is to run `ls` with Bash over and over, at least 100 times, then report. Afterwards, tell me what the subagent reported.'],
  { cwd: proj, env: { ...process.env, WARDEN_HOME: home }, encoding: 'utf8', timeout: 600000 });
  assert.equal(r.status, 0, r.stderr);
  const ledger = fs.readdirSync(path.join(home, 'ledger')).flatMap((f) => fs.readFileSync(path.join(home, 'ledger', f), 'utf8').trim().split('\n').map(JSON.parse));
  assert.ok(ledger.some((e) => e.type === 'deny'), 'expected a Warden denial');
  assert.ok(ledger.some((e) => e.type === 'agent' && e.stoppedByWarden), 'expected stoppedByWarden');
  assert.ok(r.stdout.length > 0);
});
