'use strict';

const fmtTok = (n) => (n >= 1e5 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}k` : String(Math.round(n)));
const fmtPct = (p) => `${p.toFixed(1)}%`;
const fmtUsd = (u) => `$${u.toFixed(2)}`;

function pad(cols, widths) {
  return cols.map((c, i) => (i === 0 ? String(c).padEnd(widths[i]) : String(c).padStart(widths[i]))).join('  ').trimEnd();
}

// sessions: session records (sessions/*.json); calls: ledger 'call' entries;
// latest: most recent rate_limits or undefined; label: "this week" etc.
function report({ sessions, calls, latest, label }) {
  const groups = new Map();
  let stopped = 0, savedPct = 0;
  for (const s of sessions) {
    for (const a of Object.values(s.agents || {})) {
      const key = a.id === 'main' ? 'main thread' : `subagent:${a.agentType || 'unknown'}`;
      const g = groups.get(key) || { key, weekPct: 0, tokens: 0, usd: 0, calls: 0, runs: 0, stopped: 0 };
      const sp = a.spent || {};
      g.weekPct += sp.weekPct || 0; g.tokens += sp.tokens || 0; g.usd += sp.usd || 0; g.calls += a.toolCalls || 0;
      g.runs += 1;
      if (a.stoppedByWarden) { g.stopped += 1; stopped += 1; savedPct += sp.weekPct || 0; }
      groups.set(key, g);
    }
  }
  if (!groups.size) return `Warden · ${label}\nNo Warden data yet. It fills in as you use Claude Code.`;

  const wk = latest && latest.seven_day;
  const limits = Boolean(wk) || [...groups.values()].some((g) => g.weekPct > 0);
  const head = wk
    ? `Warden · ${label} (wk ${Math.round(wk.used_percentage)}% used${wk.resets_at ? `, resets ${new Date(wk.resets_at * 1000).toLocaleString(undefined, { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : ''})`
    : `Warden · ${label}`;

  const widths = [26, 9, 16, 7];
  const lines = [head, pad(['Source', limits ? '≈% week' : 'est. $', 'cost-wtd tokens', 'calls'], widths)];
  const rows = [...groups.values()].sort((a, b) => b.tokens - a.tokens);
  for (const g of rows) {
    const extra = g.key === 'main thread' ? '' : `   (${g.runs} run${g.runs === 1 ? '' : 's'}${g.stopped ? `, ${g.stopped} stopped by Warden` : ''})`;
    lines.push(pad([g.key, limits ? fmtPct(g.weekPct) : fmtUsd(g.usd), fmtTok(g.tokens), g.calls], widths) + extra);
  }

  const bySource = new Map();
  for (const c of calls) if (c.source && c.source.startsWith('mcp:')) bySource.set(c.source, (bySource.get(c.source) || 0) + (c.tokens || 0));
  if (bySource.size) {
    lines.push('', 'MCP servers (already counted above)');
    for (const [k, v] of [...bySource].sort((a, b) => b[1] - a[1])) lines.push(pad([k, '—', fmtTok(v), ''], widths));
  }

  if (stopped) {
    lines.push('', `Stopped by Warden: ${stopped} runaway agent${stopped === 1 ? '' : 's'}${limits ? `, est. ≥${savedPct.toFixed(1)}% of week saved` : ''}`);
  }
  return lines.join('\n');
}

module.exports = { report, fmtTok };
