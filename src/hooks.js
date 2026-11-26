'use strict';
const store = require('./store');
const { loadConfig } = require('./config');
const ladder = require('./ladder');
const rules = require('./rules');
const { account, splitWeekPct } = require('./accounting');

const SPAWN_TOOLS = new Set(['Agent', 'Task']);
const HISTORY_KEEP = 50;
const RETAIN_MS = 30 * 86400000; // keep 30 days of Warden data
const IDLE_MS = 10 * 60000; // an agent silent this long no longer counts as running
const SPAWN_TTL_MS = 2 * 60000; // a spawn not started within this is treated as rejected

function newAgent(id, o = {}) {
  return { id, depth: 0, agentType: null, startedAt: Date.now(), ended: false, spent: { weekPct: 0, tokens: 0, usd: 0 },
    pendingTokens: 0, toolCalls: 0, denials: 0, warned: [], notes: [], allowance: 0, history: [], stoppedByWarden: false, ...o };
}

function newSession(sid, now) {
  return { sid, startedAt: now, agents: { main: newAgent('main', { startedAt: now }) }, pendingDepths: [], warned: [], lastWeekPct: null };
}

function latestState(sid) { return store.readJSON(`state/${sid}.json`, {}); }

function modeOf(cfg, st) {
  if (cfg.mode === 'limits' || cfg.mode === 'dollars') return cfg.mode;
  if (st.rate_limits && st.rate_limits.seven_day) return 'limits';
  // No status line data at all (setup not run): use token caps, not list-price dollars.
  return st.cost ? 'dollars' : 'limits';
}

function limitsFor(agent, mode, cfg, st) {
  const l = { minutes: cfg.subagent.minutes, toolCalls: cfg.subagent.toolCalls };
  if (mode === 'limits') l.weekPct = cfg.subagent.weekPct;
  else l.usd = cfg.subagent.usd;
  if (mode === 'limits' && !(st.rate_limits && st.rate_limits.seven_day)) { delete l.weekPct; l.tokens = cfg.subagent.tokens; }
  return l;
}

const pre = (decision, reason) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason } });
const context = (event, text) => ({ hookSpecificOutput: { hookEventName: event, additionalContext: text } });

function agentOf(s, evt) {
  const id = evt.agent_id || 'main';
  if (!s.agents[id]) s.agents[id] = newAgent(id, { depth: id === 'main' ? 0 : 1, agentType: evt.agent_type || null });
  if (evt.agent_type && !s.agents[id].agentType) s.agents[id].agentType = evt.agent_type;
  return s.agents[id];
}

function note(agent, d) {
  if (d.key && agent.warned.includes(d.key)) return;
  if (d.key) agent.warned.push(d.key);
  agent.notes.push(d.reason);
}

function onSessionStart(s, evt, cfg, st) {
  const wk = st.rate_limits && st.rate_limits.seven_day;
  if (wk) s.lastWeekPct = wk.used_percentage;
  const d = rules.checkWeekly(st.rate_limits, cfg);
  if (d.action !== 'allow' && !s.warned.includes('weekly80')) {
    s.warned.push('weekly80');
    return context('SessionStart', d.reason);
  }
  return null;
}

function onSubagentStart(s, evt, now) {
  s.pendingDepths = s.pendingDepths.filter((p) => typeof p === 'object' && now - p.ts < SPAWN_TTL_MS);
  const depth = s.pendingDepths.length ? s.pendingDepths.shift().depth : 1;
  s.agents[evt.agent_id] = newAgent(evt.agent_id, { depth, agentType: evt.agent_type || null, startedAt: now });
  return null;
}

function onSubagentStop(s, evt, now) {
  const a = s.agents[evt.agent_id];
  if (!a || a.ended) return null;
  a.ended = true;
  store.appendLedger({ type: 'agent', session: s.sid, id: a.id, agentType: a.agentType || evt.agent_type || 'unknown',
    tokens: a.spent.tokens, usd: a.spent.usd, weekPct: a.spent.weekPct, toolCalls: a.toolCalls,
    minutes: (now - a.startedAt) / 60000, stoppedByWarden: a.stoppedByWarden });
  return null;
}

function onPreToolUse(s, evt, cfg, st, now) {
  const a = agentOf(s, evt);
  const mode = modeOf(cfg, st);
  a.toolCalls += 1;
  a.lastSeen = now;

  const hash = rules.inputHash(evt.tool_name, evt.tool_input);
  const loop = rules.checkLoop(a.history, hash, now, cfg);
  a.history.push({ hash, ts: now });
  if (a.history.length > HISTORY_KEEP) a.history.splice(0, a.history.length - HISTORY_KEEP);
  if (loop.action === 'deny' && a.id !== 'main') return deny(s, a, loop.reason, now);
  if (loop.action === 'deny') note(a, { key: 'loopmain', reason: loop.reason.replace('Stop repeating it', 'Check this is intended') });
  else if (loop.action === 'warn' && a.id !== 'main') note(a, loop);

  if (a.id !== 'main') {
    const d = ladder.evaluate(a, limitsFor(a, mode, cfg, st), cfg, now);
    if (d.action === 'deny' || d.action === 'hardstop') return deny(s, a, d.reason, now);
    if (d.action === 'warn') note(a, d);
  }

  if (mode === 'dollars') {
    const cost = st.cost && st.cost.total_cost_usd;
    if (typeof cost === 'number' && cost >= cfg.session.usd && !s.warned.includes('session100')) {
      s.warned.push('session100');
      return pre('ask', `Warden: this session has used about $${cost.toFixed(2)} (limit $${cfg.session.usd}). Continue?`);
    }
    if (typeof cost === 'number' && cost >= cfg.session.usd * cfg.ladder.warnFrac && !s.warned.includes('session75')) {
      s.warned.push('session75');
      a.notes.push(`Warden: this session has used about $${cost.toFixed(2)} of its $${cfg.session.usd} budget.`);
    }
  }

  if (SPAWN_TOOLS.has(evt.tool_name)) {
    const active = Object.values(s.agents).filter((x) => x.id !== 'main' && !x.ended && now - (x.lastSeen || x.startedAt) < IDLE_MS);
    const sp = rules.checkSpawn(active, a.depth, cfg);
    if (sp.action === 'deny') return deny(s, a, sp.reason, now);
    const wk = rules.checkWeekly(st.rate_limits, cfg);
    if (wk.action === 'ask') return pre('ask', wk.reason);
    if (wk.action === 'warn') note(a, wk);
    s.pendingDepths.push({ depth: a.depth + 1, ts: now });
  }
  return null;
}

function deny(s, a, reason, now) {
  a.lastDeniedAt = now;
  a.denials += 1;
  a.stoppedByWarden = a.stoppedByWarden || reason === ladder.STOP_REASON;
  store.appendLedger({ type: 'deny', session: s.sid, id: a.id, agentType: a.agentType, reason });
  return pre('deny', reason);
}

function onPostToolUse(s, evt, cfg, st, now) {
  const a = agentOf(s, evt);
  a.lastSeen = now;
  const { delta, source } = account(evt);
  a.spent.tokens += delta.tokens;
  a.spent.usd += delta.usd;
  a.pendingTokens += delta.tokens;

  let weekDelta = 0;
  const wk = st.rate_limits && st.rate_limits.seven_day;
  if (wk && typeof wk.used_percentage === 'number') {
    if (s.lastWeekPct == null) s.lastWeekPct = wk.used_percentage;
    weekDelta = Math.max(0, wk.used_percentage - s.lastWeekPct);
    if (weekDelta > 0) {
      const live = Object.values(s.agents).filter((x) => !x.ended && x.pendingTokens > 0);
      const split = splitWeekPct(weekDelta, live.length ? live.map((x) => ({ id: x.id, tokens: x.pendingTokens })) : [{ id: a.id, tokens: 1 }]);
      for (const [id, pct] of Object.entries(split)) s.agents[id].spent.weekPct += pct;
      for (const x of Object.values(s.agents)) x.pendingTokens = 0;
      s.lastWeekPct = wk.used_percentage;
    }
  }

  store.appendLedger({ type: 'call', session: s.sid, id: a.id, agentType: a.id === 'main' ? 'main' : (a.agentType || 'unknown'),
    source, tokens: delta.tokens, usd: delta.usd });

  const pace = rules.checkPace(store.readJSON(`pace/${s.sid}.json`, []), cfg, now);
  if (pace.action === 'warn' && !s.warned.includes('pace')) { s.warned.push('pace'); a.notes.push(pace.reason); }

  if (a.id !== 'main') {
    const d = ladder.evaluate(a, limitsFor(a, modeOf(cfg, st), cfg, st), cfg, now);
    if (d.action === 'warn') note(a, d);
  }
  if (!a.notes.length || cfg.quiet) { a.notes = []; return null; }
  const text = a.notes.join('\n');
  a.notes = [];
  return context('PostToolUse', text);
}

function handle(evt, now = Date.now()) {
  const cfg = loadConfig(evt.cwd);
  if (loadConfig.lastWarning && store.readJSON('cfgwarn.json', {}).msg !== loadConfig.lastWarning) {
    store.logError(loadConfig.lastWarning);
    store.writeJSON('cfgwarn.json', { msg: loadConfig.lastWarning });
  }
  if (!cfg.enabled || !evt.session_id) return null;
  const st = latestState(evt.session_id);
  let out = null;
  if (evt.hook_event_name === 'SessionStart') {
    try { store.prune(RETAIN_MS, now); } catch (e) { store.logError(e); }
    try { const root = require('path').resolve(__dirname, '..'); if (store.readJSON('root.json', {}).root !== root) store.writeJSON('root.json', { root }); } catch (e) { store.logError(e); }
  }
  store.update(`sessions/${evt.session_id}.json`, null, (s) => {
    s = s || newSession(evt.session_id, now);
    s.updatedAt = now;
    switch (evt.hook_event_name) {
      case 'SessionStart': out = onSessionStart(s, evt, cfg, st); break;
      case 'SubagentStart': out = onSubagentStart(s, evt, now); break;
      case 'SubagentStop': out = onSubagentStop(s, evt, now); break;
      case 'PreToolUse': out = onPreToolUse(s, evt, cfg, st, now); break;
      case 'PostToolUse': out = onPostToolUse(s, evt, cfg, st, now); break;
      default: out = null;
    }
    return s;
  }, { required: true });
  return out;
}

module.exports = { handle, SPAWN_TOOLS };
