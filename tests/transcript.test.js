const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'); const os = require('os'); const path = require('path');

process.env.WARDEN_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'warden-tr-'));
const { readNewUsage, costWeighted } = require('../src/transcript');

function copyFixture() {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tr-')), 't.jsonl');
  fs.copyFileSync(path.join(__dirname, 'fixtures', 'transcript-a.jsonl'), p);
  return p;
}

test('reads new usage once and dedupes by message id', () => {
  const p = copyFixture();
  const first = readNewUsage(p, 'k1');
  assert.equal(first.length, 2);
  assert.deepEqual(first[0], { id: 'm1', input: 100, output: 50, cacheCreate: 10, cacheRead: 1000, model: 'claude-opus-5-5', ts: Date.parse('2026-11-25T10:00:00Z') });
  assert.deepEqual(readNewUsage(p, 'k1'), []);
});

test('half-written line is skipped then read once complete', () => {
  const p = copyFixture();
  readNewUsage(p, 'k2');
  const line = '{"type":"assistant","message":{"id":"m3","model":"x","usage":{"input_tokens":1,"output_tokens":1}}}';
  fs.appendFileSync(p, line.slice(0, 30));
  assert.deepEqual(readNewUsage(p, 'k2'), []);
  fs.appendFileSync(p, line.slice(30) + '\n');
  const got = readNewUsage(p, 'k2');
  assert.equal(got.length, 1);
  assert.equal(got[0].id, 'm3');
  assert.deepEqual(readNewUsage(p, 'k2'), []);
});

test('duplicate id split across reads is not double counted', () => {
  const p = copyFixture();
  readNewUsage(p, 'k3');
  fs.appendFileSync(p, fs.readFileSync(p, 'utf8').split('\n')[3] + '\n');
  assert.deepEqual(readNewUsage(p, 'k3'), []);
});

test('costWeighted weights cache reads at 0.1', () => {
  assert.equal(costWeighted({ input: 100, output: 50, cacheCreate: 10, cacheRead: 1000 }), 260);
});

test('missing file returns empty', () => {
  assert.deepEqual(readNewUsage('/no/such/file.jsonl', 'k4'), []);
});

test('skipSidechain ignores inline subagent lines (I5)', () => {
  const p = copyFixture();
  fs.appendFileSync(p, '{"type":"assistant","isSidechain":true,"message":{"id":"sc1","usage":{"input_tokens":9,"output_tokens":9}}}\n');
  const got = readNewUsage(p, 'k5', { skipSidechain: true });
  assert.ok(!got.some((u) => u.id === 'sc1'));
});
