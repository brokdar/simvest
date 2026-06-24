#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { spawnSync } = require('child_process');
const P = require('./_paths.js');

const REPO = P.repoRoot() || P.PROJECT_ROOT; // git runs here; paths are repo-relative
const APP_DIR = P.appDir(); // npm / prettier / tsc run here
const MAX_STDIN = 1024 * 1024;
const MAX_FILES = 20;

function getModifiedTsFiles() {
  const results = new Set();
  const gitSets = [
    ['diff', '--name-only', 'HEAD'],
    ['diff', '--cached', '--name-only'],
    ['diff', '--name-only'],
  ];
  for (const args of gitSets) {
    const r = spawnSync('git', args, { encoding: 'utf8', cwd: REPO, timeout: 10000 });
    if (r.status === 0 && r.stdout) {
      for (const line of r.stdout.split('\n')) {
        const trimmed = line.trim();
        if (trimmed) results.add(trimmed);
      }
    }
  }
  return Array.from(results)
    .filter(f => /\.(ts|tsx)$/.test(f))
    .map(f => (f.startsWith('/') ? f : `${REPO}/${f}`))
    .filter(abs => !APP_DIR || abs.startsWith(APP_DIR + '/')) // only files in the app project
    .filter(abs => fs.existsSync(abs))
    .slice(0, MAX_FILES);
}

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (data.length < MAX_STDIN) data += chunk.substring(0, MAX_STDIN - data.length);
});
process.stdin.on('end', () => {
  let files = [];
  try {
    files = getModifiedTsFiles();
  } catch (e) {
    // git not available or not a repo — exit silently
    process.stdout.write(data);
    process.exit(0);
  }

  if (files.length === 0) {
    process.stdout.write(data);
    process.exit(0);
  }

  let formatIssues = 0;
  let typeErrors = 0;

  // Run Prettier check
  const prettierResult = spawnSync(
    'npx',
    ['prettier', '--check', ...files],
    { encoding: 'utf8', cwd: APP_DIR, timeout: 30000 }
  );
  if (prettierResult.status !== 0) {
    const needsFormat = files.filter(f => {
      const rel = f.replace(REPO + '/', '');
      return (prettierResult.stdout || '').includes(rel) || (prettierResult.stderr || '').includes(rel);
    });
    // If we can't tell which files, count all
    formatIssues = needsFormat.length > 0 ? needsFormat.length : files.length;
    process.stderr.write('[Hook] Prettier: these files need formatting:\n');
    for (const f of (needsFormat.length > 0 ? needsFormat : files)) {
      process.stderr.write('  ' + f.replace(REPO + '/', '') + '\n');
    }
  }

  // Run typecheck
  const tscResult = spawnSync(
    'npx',
    ['tsc', '--noEmit', '--pretty', 'false'],
    { encoding: 'utf8', cwd: APP_DIR, timeout: 60000 }
  );
  if (tscResult.status !== 0) {
    const errOutput = (tscResult.stdout || '') + (tscResult.stderr || '');
    const lines = errOutput.split('\n').filter(l => l.trim());
    const errorLines = lines.filter(l => / error TS/.test(l));
    typeErrors = errorLines.length || 1;
    const shown = lines.slice(0, 20);
    process.stderr.write('[Hook] TypeScript errors:\n');
    for (const l of shown) {
      process.stderr.write('  ' + l + '\n');
    }
    if (lines.length > 20) {
      process.stderr.write(`  ... (${lines.length - 20} more lines)\n`);
    }
  }

  process.stderr.write(
    `[Hook] Quality gate: ${files.length} file${files.length === 1 ? '' : 's'} checked, ` +
    `${formatIssues} format issue${formatIssues === 1 ? '' : 's'}, ` +
    `${typeErrors} type error${typeErrors === 1 ? '' : 's'}\n`
  );

  process.stdout.write(data);
  process.exit(0);
});
