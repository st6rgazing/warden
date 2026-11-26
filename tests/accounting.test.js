const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');

process.env.WARDEN_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'warden-acc-'));
const { account, splitWeekPct, sourceOf, subagentTranscript, priceUsd } = require('../src/accounting');

function layout() {
  const proj = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-'));
  const main = path.join(proj, 'sess1.jsonl');
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'transcript-a.jsonl'), main);
  const subDir = path.join(proj, 'sess1', 'subagents'); fs.mkdirSync(subDir, { recursive: true });
  fs.writeFileSync(path.join(subDir, 'agent-ag1.jsonl'),
    '{"type":"assistant","message":{"id":"s1","model":"claude-haiku-5-5","usage":{"input_tokens":1000,"output_tokens":0}}}\n');
  return { main };
}

test('main-thread call lands on main', () => {
  const { main } = layout();
  const r = account({ session_id: 'sess1', transcript_path: main, tool_name: 'Bash' });
  assert.equal(r.agentId, 'main');
  assert.equal(r.delta.tokens, 260 + 25 + 200);
  assert.equal(r.source, 'tool:Bash');
});

test('subagent call lands on the subagent via derived path', () => {
  const { main } = layout();
  const r = account({ session_id: 'sess1', transcript_path: main, agent_id: 'ag1', agent_type: 'Explore', tool_name: 'mcp__github__search' });
  assert.equal(r.agentId, 'ag1');
  assert.equal(r.delta.tokens, 1000);
  assert.equal(r.source, 'mcp:github');
});

test('agent_transcript_path wins when given', () => {
  assert.equal(subagentTranscript({ agent_transcript_path: '/x.jsonl', agent_id: 'a', transcript_path: '/p/s.jsonl', session_id: 's' }), '/x.jsonl');
  assert.equal(subagentTranscript({ agent_id: 'a', transcript_path: '/p/s.jsonl', session_id: 's' }), path.join('/p', 's', 'subagents', 'agent-a.jsonl'));
});

test('splitWeekPct is proportional, even when no tokens', () => {
  assert.deepEqual(splitWeekPct(3, [{ id: 'a', tokens: 200 }, { id: 'b', tokens: 100 }]), { a: 2, b: 1 });
  assert.deepEqual(splitWeekPct(2, [{ id: 'a', tokens: 0 }, { id: 'b', tokens: 0 }]), { a: 1, b: 1 });
  assert.deepEqual(splitWeekPct(2, []), {});
});

test('sourceOf names mcp servers and tools', () => {
  assert.equal(sourceOf('mcp__github__search'), 'mcp:github');
  assert.equal(sourceOf('mcp__plugin_x_db__query'), 'mcp:plugin_x_db');
  assert.equal(sourceOf('Read'), 'tool:Read');
  assert.equal(sourceOf(undefined), 'tool:unknown');
});

test('priceUsd uses model family', () => {
  assert.ok(priceUsd({ model: 'claude-opus-5-5', input: 1e6, output: 0, cacheCreate: 0, cacheRead: 0 }) > priceUsd({ model: 'claude-haiku-5-5', input: 1e6, output: 0, cacheCreate: 0, cacheRead: 0 }));
  assert.ok(priceUsd({ model: 'mystery', input: 1e6, output: 0, cacheCreate: 0, cacheRead: 0 }) > 0);
});

test('agent ids already prefixed with agent- are not doubled', () => {
  assert.equal(subagentTranscript({ agent_id: 'agent-abc123', transcript_path: '/p/s.jsonl', session_id: 's' }), path.join('/p', 's', 'subagents', 'agent-abc123.jsonl'));
});

test('mcp_server field wins for source', () => {
  const { main } = layout();
  assert.equal(account({ session_id: 'sess1', transcript_path: main, tool_name: 'mcp__x__y', mcp_server: 'github' }).source, 'mcp:github');
});
