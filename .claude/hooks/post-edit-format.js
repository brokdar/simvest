#!/usr/bin/env node
'use strict';
const { execFileSync } = require('child_process');
const P = require('./_paths.js');

const MAX_STDIN = 1024 * 1024;
let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (data.length < MAX_STDIN) data += chunk.substring(0, MAX_STDIN - data.length);
});
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data);
    const filePath = input.tool_input?.file_path || '';
    const isFormattable = /\.(ts|tsx|js|jsx|css|mjs)$/.test(filePath);
    // Resolve the app dir from the edited file (nearest package.json). Skip files
    // outside any Node project (e.g. the hooks themselves) — they use other styles.
    const appDir = isFormattable && P.isInRepo(filePath) ? P.appDir(filePath) : null;

    if (appDir) {
      try {
        execFileSync('npx', ['prettier', '--write', filePath], {
          cwd: appDir,
          timeout: 15000,
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (e) {
        process.stderr.write('[Hook] post-edit-format: prettier failed: ' + e.message + '\n');
      }
    }
  } catch (e) {
    process.stderr.write('[Hook] post-edit-format error: ' + e.message + '\n');
  }
  process.stdout.write(data);
  process.exit(0);
});
