'use strict';
const fs = require('fs');
const path = require('path');
const store = require('./store');

const MARKS = ['warden-status.js', 'status-shim.js'];
const isWarden = (sl) => Boolean(sl) && MARKS.some((m) => String(sl.command || '').includes(m));

// Lives at a stable path so plugin updates (new versioned dir) don't break the status line.
const SHIM = `#!/usr/bin/env node
'use strict';
const fs = require('fs'); const path = require('path');
const home = __dirname;
let root = null;
try { root = JSON.parse(fs.readFileSync(path.join(home, 'root.json'), 'utf8')).root; } catch {}
const bin = root && path.join(root, 'bin', 'warden-status.js');
if (bin && fs.existsSync(bin)) { require(bin); } else {
  let input = '';
  process.stdin.on('data', (c) => { input += c; });
  process.stdin.on('end', () => {
    let line = '';
    try {
      const o = JSON.parse(fs.readFileSync(path.join(home, 'statusline.json'), 'utf8'));
      if (o.command) { const r = require('child_process').spawnSync(o.command, { shell: true, input, timeout: 1000, encoding: 'utf8' }); if (r.status === 0 && r.stdout) line = r.stdout.trim() + ' '; }
    } catch {}
    process.stdout.write(line + '⛨\\n');
  });
}
`;

function installShim(root) {
  store.writeJSON('root.json', { root });
  const file = path.join(store.home(), 'status-shim.js');
  fs.writeFileSync(`${file}.tmp`, SHIM);
  fs.renameSync(`${file}.tmp`, file);
  return file;
}

function readSettings(file) {
  let raw;
  try { raw = fs.readFileSync(file, 'utf8'); } catch { return { raw: null, obj: {} }; }
  try { return { raw, obj: JSON.parse(raw) }; } catch { return { raw, obj: null }; }
}
function writeSettings(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(`${file}.warden-tmp`, JSON.stringify(obj, null, 2) + '\n');
  fs.renameSync(`${file}.warden-tmp`, file);
}
const unreadable = (file) => `Warden could not read ${file} (it isn't valid JSON). Fix it, then run this again. Nothing was changed.`;

function setup(file, root) {
  const { raw, obj } = readSettings(file);
  if (!obj) return unreadable(file);
  const cur = obj.statusLine;
  const shim = installShim(root);
  if (isWarden(cur)) { obj.statusLine = { type: 'command', command: `node "${shim}"` }; writeSettings(file, obj); return 'Warden status line is already installed.'; }
  if (raw !== null) fs.writeFileSync(`${file}.warden-bak`, raw);
  store.writeJSON('statusline.json', { command: cur && cur.command || null, original: cur === undefined ? null : cur });
  obj.statusLine = { type: 'command', command: `node "${shim}"` };
  writeSettings(file, obj);
  return cur ? `Installed. Your status line (${cur.command}) still shows, with Warden's badge after it.` : 'Installed Warden status line.';
}

function off(file) {
  const { obj } = readSettings(file);
  if (!obj) return unreadable(file);
  const saved = store.readJSON('statusline.json', null);
  if (!isWarden(obj.statusLine)) return 'Warden status line is not installed.';
  if (saved && saved.original) obj.statusLine = saved.original; else delete obj.statusLine;
  writeSettings(file, obj);
  return 'Removed Warden status line. Your original setting is back.';
}

module.exports = { setup, off, installShim };
