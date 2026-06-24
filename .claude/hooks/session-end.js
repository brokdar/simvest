#!/usr/bin/env node
'use strict';
/**
 * SessionEnd hook. Persists a commit-aware session summary (latest.json + a
 * timestamped history file) for the next SessionStart to read back.
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
    S.saveSession('', JSON.parse(data));
  } catch (e) {
    process.stderr.write('[Hook] session-end error: ' + e.message + '\n');
  }
  process.stdout.write(data); // pass through unchanged
  process.exit(0);
});
