'use strict';
const path = require('path');
const { readNewUsage, costWeighted } = require('./transcript');
const { priceFor, CACHE_WRITE, CACHE_READ } = require('./prices');

function subagentTranscript(evt) {
  if (evt.agent_transcript_path) return evt.agent_transcript_path;
  if (!evt.transcript_path || !evt.agent_id) return null;
  return path.join(path.dirname(evt.transcript_path), evt.session_id, 'subagents', `agent-${evt.agent_id}.jsonl`);
}

function sourceOf(toolName) {
  const m = /^mcp__(.+?)__/.exec(toolName || '');
  return m ? `mcp:${m[1]}` : `tool:${toolName || 'unknown'}`;
}

function priceUsd(u) {
  const p = priceFor(u.model);
  return ((u.input || 0) * p.input + (u.output || 0) * p.output
    + (u.cacheCreate || 0) * p.input * CACHE_WRITE + (u.cacheRead || 0) * p.input * CACHE_READ) / 1e6;
}

// New usage since the last call, attributed to the agent whose transcript it came from.
function account(evt) {
  const agentId = evt.agent_id || 'main';
  const file = evt.agent_id ? subagentTranscript(evt) : evt.transcript_path;
  const usage = file ? readNewUsage(file, `${evt.session_id}:${agentId}:${file}`) : [];
  const delta = { tokens: 0, usd: 0 };
  for (const u of usage) { delta.tokens += costWeighted(u); delta.usd += priceUsd(u); }
  return { agentId, delta, source: sourceOf(evt.tool_name) };
}

function splitWeekPct(deltaPct, agents) {
  const out = {};
  if (!agents.length) return out;
  const total = agents.reduce((s, a) => s + (a.tokens || 0), 0);
  for (const a of agents) out[a.id] = total > 0 ? deltaPct * (a.tokens || 0) / total : deltaPct / agents.length;
  return out;
}

module.exports = { account, splitWeekPct, sourceOf, subagentTranscript, priceUsd };
