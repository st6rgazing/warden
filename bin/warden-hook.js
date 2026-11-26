#!/usr/bin/env node
'use strict';
// Claude Code hook entry. Reads one event from stdin, prints a decision or nothing.
// Any error fails open: exit 0, no output, error logged.
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', () => {
  try {
    const { handle } = require('../src/hooks');
    const out = handle(JSON.parse(input));
    if (out) process.stdout.write(JSON.stringify(out));
  } catch (e) {
    try { require('../src/store').logError(e); } catch { /* ignore */ }
  }
  process.exit(0);
});
