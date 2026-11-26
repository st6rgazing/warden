'use strict';
const fs = require('fs');
const path = require('path');
const { wardenHome } = require('./config');

const LOCK_WAIT_MS = 2000;
const STALE_LOCK_MS = 10000;

function home() { return wardenHome(); }
function abs(rel) { return path.join(home(), rel); }

function readJSON(rel, fallback) {
  try { return JSON.parse(fs.readFileSync(abs(rel), 'utf8')); } catch { return fallback; }
}

function writeJSON(rel, obj) {
  const file = abs(rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj));
  fs.renameSync(tmp, file);
}

function sleep(ms) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); }

function acquire(lockDir) {
  const end = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try { fs.mkdirSync(lockDir); return true; } catch (e) {
      if (e.code !== 'EEXIST') return false;
      try {
        if (Date.now() - fs.statSync(lockDir).mtimeMs > STALE_LOCK_MS) fs.rmdirSync(lockDir);
      } catch { /* raced */ }
      if (Date.now() > end) return false;
      sleep(2);
    }
  }
}

// Read-modify-write under a lock. On lock timeout: with { required: true } the
// update is skipped (returns undefined); otherwise it runs unlocked.
function update(rel, fallback, fn, opts = {}) {
  const file = abs(rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lockDir = `${file}.lock`;
  const locked = acquire(lockDir);
  if (!locked && opts.required) return undefined;
  try {
    const next = fn(readJSON(rel, fallback));
    writeJSON(rel, next);
    return next;
  } finally {
    if (locked) try { fs.rmdirSync(lockDir); } catch { /* gone */ }
  }
}

function today(d = new Date()) { return d.toISOString().slice(0, 10); }

function appendLedger(entry) {
  const file = abs(path.join('ledger', `${today()}.jsonl`));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify({ ts: Date.now(), ...entry }) + '\n');
}

function readLedger(sinceMs = 0) {
  const dir = abs('ledger');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort(); } catch { return []; }
  const out = [];
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (!line) continue;
      try { const e = JSON.parse(line); if (e.ts >= sinceMs) out.push(e); } catch { /* skip */ }
    }
  }
  return out;
}

function logError(err) {
  try {
    fs.mkdirSync(home(), { recursive: true });
    fs.appendFileSync(abs('errors.log'), `${new Date().toISOString()} ${err && err.stack || err}\n`);
  } catch { /* never throw from the error logger */ }
}

module.exports = { home, readJSON, writeJSON, update, appendLedger, readLedger, logError };
