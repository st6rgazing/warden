#!/usr/bin/env node
'use strict';
const path = require('path');
try {
  const { main } = require('../src/cli');
  process.stdout.write(main(process.argv.slice(2), path.resolve(__dirname, '..')) + '\n');
} catch (e) {
  process.stdout.write(`Warden error: ${e.message}\n`);
}
