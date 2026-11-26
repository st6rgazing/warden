'use strict';
const fs = require('fs');
const crypto = require('crypto');
const store = require('./store');

const KEEP_IDS = 500;

function keyFile(offsetKey) {
  return `offsets/${crypto.createHash('sha1').update(String(offsetKey)).digest('hex')}.json`;
}

function costWeighted(u) {
  return (u.input || 0) + (u.output || 0) + (u.cacheCreate || 0) + 0.1 * (u.cacheRead || 0);
}

// Reads assistant usage appended since the last call for this key.
// Only complete lines advance the offset; message ids already counted are skipped.
function readNewUsage(file, offsetKey) {
  let fd;
  try { fd = fs.openSync(file, 'r'); } catch { return []; }
  try {
    const rec = store.readJSON(keyFile(offsetKey), { offset: 0, seen: [] });
    const size = fs.fstatSync(fd).size;
    if (size < rec.offset) { rec.offset = 0; rec.seen = []; } // file rotated
    if (size === rec.offset) return [];
    const buf = Buffer.alloc(size - rec.offset);
    fs.readSync(fd, buf, 0, buf.length, rec.offset);
    const lastNl = buf.lastIndexOf(0x0a);
    if (lastNl < 0) return [];
    const seen = new Set(rec.seen);
    const out = [];
    for (const line of buf.subarray(0, lastNl).toString('utf8').split('\n')) {
      if (!line) continue;
      let e; try { e = JSON.parse(line); } catch { continue; }
      const m = e && e.type === 'assistant' && e.message;
      if (!m || !m.usage) continue;
      const id = m.id || e.uuid;
      if (id && seen.has(id)) continue;
      if (id) seen.add(id);
      const u = m.usage;
      out.push({
        id, model: m.model,
        input: u.input_tokens || 0, output: u.output_tokens || 0,
        cacheCreate: u.cache_creation_input_tokens || 0, cacheRead: u.cache_read_input_tokens || 0,
        ts: e.timestamp ? Date.parse(e.timestamp) : undefined,
      });
    }
    store.writeJSON(keyFile(offsetKey), { offset: rec.offset + lastNl + 1, seen: [...seen].slice(-KEEP_IDS) });
    return out;
  } finally { fs.closeSync(fd); }
}

module.exports = { readNewUsage, costWeighted };
