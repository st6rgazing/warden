const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');
const { spawnSync } = require('child_process');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'warden-hooks-'));
process.env.WARDEN_HOME = HOME;
const store = require('../src/store');
const { handle } = require('../src/hooks');
const { STOP_REASON } = require('../src/ladder');

let n = 0;
function session(rateLimits) {
  const sid = `s${++n}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-'));
  const tp = path.join(dir, `${sid}.jsonl`); fs.writeFileSync(tp, '');
  if (rateLimits) store.writeJSON(`state/${sid}.json`, { rate_limits: rateLimits, ts: Date.now() });
  const base = { session_id: sid, transcript_path: tp, cwd: dir };
  return { sid, base, ev: (o) => ({ ...base, ...o }) };
}
const pre = (o) => ({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: `ls ${Math.random()}` }, ...o });
const post = (o) => ({ hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: {}, ...o });
const decision = (out) => out && out.hookSpecificOutput && out.hookSpecificOutput.permissionDecision;
const ctx = (out) => out && out.hookSpecificOutput && out.hookSpecificOutput.additionalContext;

test('subagent over 2% of week is denied, then hard-stopped but still denied', () => {
  const rl = { seven_day: { used_percentage: 10 }, five_hour: { used_percentage: 5 } };
  const s = session(rl);
  handle(s.ev({ hook_event_name: 'SessionStart' }));
  handle(s.ev({ hook_event_name: 'SubagentStart', agent_id: 'a1', agent_type: 'Explore' }));
  store.writeJSON(`state/${s.sid}.json`, { rate_limits: { ...rl, seven_day: { used_percentage: 13 } }, ts: Date.now() });
  handle(s.ev(post({ agent_id: 'a1', agent_type: 'Explore' })));
  const out = handle(s.ev(pre({ agent_id: 'a1', agent_type: 'Explore' })));
  assert.equal(decision(out), 'deny');
  assert.equal(out.hookSpecificOutput.permissionDecisionReason, STOP_REASON);
  for (let i = 0; i < 6; i++) handle(s.ev(pre({ agent_id: 'a1' })));
  assert.equal(decision(handle(s.ev(pre({ agent_id: 'a1' })))), 'deny');
  handle(s.ev({ hook_event_name: 'SubagentStop', agent_id: 'a1', agent_type: 'Explore' }));
  const e = store.readLedger().find((x) => x.type === 'agent' && x.session === s.sid);
  assert.equal(e.stoppedByWarden, true);
  assert.equal(e.agentType, 'Explore');
});

test('main thread is never budget-denied in limits mode', () => {
  const s = session({ seven_day: { used_percentage: 50 } });
  handle(s.ev({ hook_event_name: 'SessionStart' }));
  store.writeJSON(`state/${s.sid}.json`, { rate_limits: { seven_day: { used_percentage: 70 } }, ts: Date.now() });
  handle(s.ev(post({})));
  assert.notEqual(decision(handle(s.ev(pre({})))), 'deny');
});

test('spawn denied past max depth', () => {
  const s = session();
  handle(s.ev({ hook_event_name: 'SessionStart' }));
  handle(s.ev(pre({ tool_name: 'Agent', tool_input: { prompt: 'a' } })));
  handle(s.ev({ hook_event_name: 'SubagentStart', agent_id: 'd1' }));
  handle(s.ev(pre({ tool_name: 'Task', agent_id: 'd1', tool_input: { prompt: 'b' } })));
  handle(s.ev({ hook_event_name: 'SubagentStart', agent_id: 'd2' }));
  const out = handle(s.ev(pre({ tool_name: 'Agent', agent_id: 'd2', tool_input: { prompt: 'c' } })));
  assert.equal(decision(out), 'deny');
  assert.match(out.hookSpecificOutput.permissionDecisionReason, /nest 2 levels/);
});

test('spawn asks at 95% weekly', () => {
  const s = session({ seven_day: { used_percentage: 96 } });
  assert.equal(decision(handle(s.ev(pre({ tool_name: 'Agent', tool_input: { prompt: 'x' } })))), 'ask');
});

test('no state and no session record: everything allows', () => {
  const s = session();
  for (const e of ['SessionStart', 'SubagentStart', 'SubagentStop', 'Stop']) handle(s.ev({ hook_event_name: e, agent_id: 'z' }));
  assert.notEqual(decision(handle(s.ev(pre({})))), 'deny');
  handle(s.ev(post({})));
});

test('loop: 8th identical call is denied, warning delivered once', () => {
  const s = session();
  handle(s.ev({ hook_event_name: 'SubagentStart', agent_id: 'L1' }));
  const same = { agent_id: 'L1', tool_name: 'Bash', tool_input: { command: 'ls' } };
  let warns = 0, last;
  for (let i = 0; i < 8; i++) {
    last = handle(s.ev(pre(same)));
    if (ctx(handle(s.ev(post(same))))) warns++;
  }
  assert.equal(decision(last), 'deny');
  assert.equal(warns, 1);
});

test('dollar mode: session over $20 asks', () => {
  const s = session();
  store.writeJSON(`state/${s.sid}.json`, { cost: { total_cost_usd: 21 }, ts: Date.now() });
  assert.equal(decision(handle(s.ev(pre({})))), 'ask');
});

test('disabled config does nothing', () => {
  const s = session({ seven_day: { used_percentage: 99 } });
  fs.mkdirSync(path.join(s.base.cwd, '.claude'));
  fs.writeFileSync(path.join(s.base.cwd, '.claude', 'warden.json'), '{"enabled":false}');
  assert.equal(handle(s.ev(pre({ tool_name: 'Agent' }))), null);
});

test('CLI fails open on bad input and logs the error', () => {
  const bin = path.join(__dirname, '..', 'bin', 'warden-hook.js');
  const r = spawnSync(process.execPath, [bin], { input: '{not json', env: { ...process.env, WARDEN_HOME: HOME } });
  assert.equal(r.status, 0);
  assert.equal(r.stdout.toString(), '');
  assert.match(fs.readFileSync(path.join(HOME, 'errors.log'), 'utf8'), /JSON/);
});

test('CLI prints the decision JSON', () => {
  const s = session({ seven_day: { used_percentage: 96 } });
  const bin = path.join(__dirname, '..', 'bin', 'warden-hook.js');
  const r = spawnSync(process.execPath, [bin], { input: JSON.stringify(s.ev(pre({ tool_name: 'Agent', tool_input: {} }))), env: { ...process.env, WARDEN_HOME: HOME } });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'ask');
});

test('deny records lastDeniedAt for /warden allow', () => {
  const s = session();
  handle(s.ev({ hook_event_name: 'SubagentStart', agent_id: 'P1' }), 5000);
  const same = { agent_id: 'P1', tool_name: 'Bash', tool_input: { command: 'pwd' } };
  for (let i = 0; i < 8; i++) handle(s.ev(pre(same)), 5000 + i);
  assert.equal(store.readJSON(`sessions/${s.sid}.json`).agents.P1.lastDeniedAt, 5007);
});

test('main thread is never loop-denied (C1)', () => {
  const s = session();
  const same = { tool_name: 'Bash', tool_input: { command: 'npm test' } };
  for (let i = 0; i < 12; i++) assert.notEqual(decision(handle(s.ev(pre(same)))), 'deny');
});

test('agents silent for 10+ minutes do not count as running (I2)', () => {
  const s = session(); const t0 = 1e12;
  for (let i = 0; i < 4; i++) {
    handle(s.ev(pre({ tool_name: 'Agent', tool_input: { prompt: String(i) } })), t0);
    handle(s.ev({ hook_event_name: 'SubagentStart', agent_id: `g${i}` }), t0);
  }
  assert.equal(decision(handle(s.ev(pre({ tool_name: 'Agent', tool_input: { prompt: 'x' } })), t0 + 1000)), 'deny');
  assert.notEqual(decision(handle(s.ev(pre({ tool_name: 'Agent', tool_input: { prompt: 'y' } })), t0 + 11 * 60000)), 'deny');
});

test('rejected spawns do not leave stale depths (I3)', () => {
  const s = session(); const t0 = 2e12;
  handle(s.ev(pre({ tool_name: 'Agent', tool_input: { prompt: 'a' } })), t0);
  handle(s.ev({ hook_event_name: 'SubagentStart', agent_id: 'r1' }), t0);
  handle(s.ev(pre({ agent_id: 'r1', tool_name: 'Task', tool_input: { prompt: 'rejected by user' } })), t0 + 1000);
  handle(s.ev({ hook_event_name: 'SubagentStop', agent_id: 'r1' }), t0 + 2000);
  handle(s.ev(pre({ tool_name: 'Agent', tool_input: { prompt: 'b' } })), t0 + 5 * 60000);
  handle(s.ev({ hook_event_name: 'SubagentStart', agent_id: 'r2' }), t0 + 5 * 60000);
  assert.equal(store.readJSON(`sessions/${s.sid}.json`).agents.r2.depth, 1);
});

test('no status line state yet: subscribers are not put on dollar caps (M2)', () => {
  const s = session();
  handle(s.ev({ hook_event_name: 'SubagentStart', agent_id: 'm2' }));
  store.update(`sessions/${s.sid}.json`, null, (x) => { x.agents.m2.spent.usd = 50; return x; });
  assert.notEqual(decision(handle(s.ev(pre({ agent_id: 'm2' })))), 'deny');
});

test('lock held elsewhere: hook skips instead of running unlocked (I4)', () => {
  const s = session({ seven_day: { used_percentage: 96 } });
  fs.mkdirSync(path.join(HOME, 'sessions'), { recursive: true });
  const lock = path.join(HOME, 'sessions', `${s.sid}.json.lock`);
  fs.mkdirSync(lock);
  try { assert.equal(handle(s.ev(pre({ tool_name: 'Agent', tool_input: {} }))), null); }
  finally { fs.rmdirSync(lock); }
  assert.equal(store.readJSON(`sessions/${s.sid}.json`, 'none'), 'none');
});
