'use strict';
const fs = require('fs');
const path = require('path');
const store = require('./store');

const MARK = 'warden-status.js';

function readSettings(file) {
  try { return { raw: fs.readFileSync(file, 'utf8'), obj: JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch { return { raw: null, obj: {} }; }
}
function writeSettings(file, obj) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

function setup(file, root) {
  const { raw, obj } = readSettings(file);
  const cur = obj.statusLine;
  if (cur && String(cur.command || '').includes(MARK)) return 'Warden status line is already installed.';
  if (raw !== null) fs.writeFileSync(`${file}.warden-bak`, raw);
  store.writeJSON('statusline.json', { command: cur && cur.command || null, original: cur === undefined ? null : cur });
  obj.statusLine = { type: 'command', command: `node "${path.join(root, 'bin', MARK)}"` };
  writeSettings(file, obj);
  return cur ? `Installed. Your status line (${cur.command}) still shows, with Warden's badge after it.` : 'Installed Warden status line.';
}

function off(file) {
  const { obj } = readSettings(file);
  const saved = store.readJSON('statusline.json', null);
  if (!obj.statusLine || !String(obj.statusLine.command || '').includes(MARK)) return 'Warden status line is not installed.';
  if (saved && saved.original) obj.statusLine = saved.original; else delete obj.statusLine;
  writeSettings(file, obj);
  return 'Removed Warden status line. Your original setting is back.';
}

module.exports = { setup, off };
