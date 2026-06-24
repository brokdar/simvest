#!/usr/bin/env node
'use strict';
const fs = require('fs');
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
    const isSource = /\.(ts|tsx|js|jsx)$/.test(filePath);
    const inProject = isSource && P.isInRepo(filePath) && !!P.appDir(filePath);

    if (inProject) {
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        const lines = content.split('\n');
        const matches = [];
        for (let i = 0; i < lines.length; i++) {
          const trimmed = lines[i].trimStart();
          // Skip commented-out lines
          if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
          if (/console\.log/.test(lines[i])) {
            matches.push({ num: i + 1, content: lines[i] });
          }
        }
        if (matches.length > 0) {
          const filename = filePath.split('/').pop();
          process.stderr.write(`[Hook] WARNING: console.log found in ${filename}\n`);
          const shown = matches.slice(0, 5);
          for (const m of shown) {
            process.stderr.write(`  ${m.num}: ${m.content}\n`);
          }
          if (matches.length > 5) {
            process.stderr.write(`  ... and ${matches.length - 5} more\n`);
          }
        }
      } catch (e) {
        process.stderr.write('[Hook] post-edit-console-warn: could not read file: ' + e.message + '\n');
      }
    }
  } catch (e) {
    process.stderr.write('[Hook] post-edit-console-warn error: ' + e.message + '\n');
  }
  process.stdout.write(data);
  process.exit(0);
});
