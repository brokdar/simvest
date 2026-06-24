#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { spawnSync } = require('child_process');
const P = require('./_paths.js');

const GIT_CWD = P.repoRoot() || P.PROJECT_ROOT; // git runs here; paths are repo-relative
const APP_DIR = P.appDir(); // only scan source inside the app project, not tooling (.claude/)
const MAX_STDIN = 1024 * 1024;

const EXCLUDE_PATTERNS = [
  /\.test\./,
  /\.spec\./,
  /\.config\./,
  /[/\\]scripts[/\\]/,
  /[/\\]__tests__[/\\]/,
  /[/\\]__mocks__[/\\]/,
];

function getModifiedFiles() {
  const results = new Set();
  for (const args of [
    ['diff', '--name-only', 'HEAD'],
    ['diff', '--cached', '--name-only'],
  ]) {
    const r = spawnSync('git', args, { encoding: 'utf8', cwd: GIT_CWD });
    if (r.status === 0 && r.stdout) {
      for (const line of r.stdout.split('\n')) {
        const trimmed = line.trim();
        if (trimmed) results.add(trimmed);
      }
    }
  }
  return Array.from(results);
}

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (data.length < MAX_STDIN) data += chunk.substring(0, MAX_STDIN - data.length);
});
process.stdin.on('end', () => {
  try {
    let modifiedFiles;
    try {
      modifiedFiles = getModifiedFiles();
    } catch (e) {
      // Not a git repo or git not available — exit silently
      process.stdout.write(data);
      process.exit(0);
    }

    const sourceFiles = modifiedFiles.filter(f => /\.(ts|tsx|js|jsx)$/.test(f));
    const filtered = sourceFiles.filter(f => {
      const abs = f.startsWith('/') ? f : `${GIT_CWD}/${f}`;
      if (APP_DIR && !abs.startsWith(APP_DIR + '/')) return false; // skip non-app files (e.g. hooks)
      return !EXCLUDE_PATTERNS.some(p => p.test(abs));
    });

    for (const rel of filtered) {
      const abs = rel.startsWith('/') ? rel : `${GIT_CWD}/${rel}`;
      if (!fs.existsSync(abs)) continue;
      try {
        const content = fs.readFileSync(abs, 'utf8');
        const lines = content.split('\n');
        let found = false;
        for (let i = 0; i < lines.length; i++) {
          const trimmed = lines[i].trimStart();
          if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) continue;
          if (/console\.log/.test(lines[i])) {
            found = true;
            break;
          }
        }
        if (found) {
          process.stderr.write(`[Hook] console.log found in ${rel} — remove before committing\n`);
        }
      } catch (e) {
        // Skip unreadable files silently
      }
    }
  } catch (e) {
    process.stderr.write('[Hook] stop-check-console-log error: ' + e.message + '\n');
  }
  process.stdout.write(data);
  process.exit(0);
});
