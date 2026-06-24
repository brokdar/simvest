#!/usr/bin/env node
'use strict';
/**
 * PreCompact hook. Saves the same commit-aware summary as session-end, but to
 * pre-compact-latest.json. SessionStart prefers whichever of the two is newer.
 */
const S = require('./_session.js');

const MAX_STDIN = 1024 * 1024;
let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  if (data.length < MAX_STDIN) data += chunk.substring(0, MAX_STDIN - data.length);
});
process.stdin.on('end', () => {
  try {
    S.saveSession('pre-compact-', JSON.parse(data));
  } catch (e) {
    process.stderr.write('[Hook] pre-compact error: ' + e.message + '\n');
  }
  process.stdout.write(data); // pass through unchanged
  process.exit(0);
});
