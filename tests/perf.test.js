const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');

process.env.WARDEN_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'warden-perf-'));
const { handle } = require('../src/hooks');

test('PostToolUse p95 under 50 ms on a 5 MB transcript', () => {
  const tp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'perf-')), 'p1.jsonl');
  const line = (i) => JSON.stringify({ type: 'assistant', message: { id: `m${i}`, model: 'claude-opus-5-5', usage: { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 1000 } }, pad: 'x'.repeat(200) }) + '\n';
  let s = ''; let i = 0;
  while (s.length < 5e6) s += line(i++);
  fs.writeFileSync(tp, s);
  const base = { session_id: 'p1', transcript_path: tp, cwd: os.tmpdir(), hook_event_name: 'PostToolUse', tool_name: 'Bash', tool_input: {} };
  const times = [];
  for (let k = 0; k < 1000; k++) {
    fs.appendFileSync(tp, line(i++));
    const t = process.hrtime.bigint();
    handle(base);
    times.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  times.sort((a, b) => a - b);
  const p95 = times[Math.floor(times.length * 0.95)];
  assert.ok(p95 < 50, `p95 ${p95.toFixed(1)} ms`);
});
