#!/usr/bin/env node
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
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
    const isTypeScript = /\.(ts|tsx)$/.test(filePath);
    const inProject = isTypeScript && P.isInRepo(filePath) && !!P.appDir(filePath);

    if (inProject) {
      // Walk up to find tsconfig.json (max 20 levels)
      let tsconfigDir = null;
      let dir = path.dirname(filePath);
      for (let i = 0; i < 20; i++) {
        if (fs.existsSync(path.join(dir, 'tsconfig.json'))) {
          tsconfigDir = dir;
          break;
        }
        const parent = path.dirname(dir);
        if (parent === dir) break; // filesystem root
        dir = parent;
      }

      if (tsconfigDir) {
        try {
          execFileSync('npx', ['tsc', '--noEmit', '--pretty', 'false'], {
            cwd: tsconfigDir,
            timeout: 30000,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
        } catch (e) {
          // tsc exits non-zero when there are errors; combine stdout+stderr output
          const output = [e.stdout, e.stderr]
            .filter(Boolean)
            .map(b => (Buffer.isBuffer(b) ? b.toString('utf8') : b))
            .join('');

          // Filter to lines mentioning the edited file (by absolute or relative path)
          const relPath = path.relative(tsconfigDir, filePath);
          const lines = output.split('\n').filter(line => {
            return line.includes(filePath) || line.includes(relPath);
          });

          const limited = lines.slice(0, 10);
          if (limited.length > 0) {
            process.stderr.write('[Hook] post-edit-typecheck errors:\n' + limited.join('\n') + '\n');
          }
        }
      } else {
        process.stderr.write('[Hook] post-edit-typecheck: could not find tsconfig.json for ' + filePath + '\n');
      }
    }
  } catch (e) {
    process.stderr.write('[Hook] post-edit-typecheck error: ' + e.message + '\n');
  }
  process.stdout.write(data);
  process.exit(0);
});
