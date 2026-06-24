'use strict';
/**
 * _paths.js — portable path resolution shared by every hook.
 *
 * Not a hook itself (never registered in settings.json). Required by the other
 * hooks via `require('./_paths.js')`, which Node resolves relative to the
 * requiring module's directory — so it works no matter the process cwd.
 *
 * Nothing here is hardcoded to a specific checkout. Everything is derived from
 * this file's own location plus `git`, so the whole hook system drops into any
 * repository unchanged. Two distinct path concepts:
 *
 *   repoRoot()  — `git rev-parse --show-toplevel`; where git commands run.
 *   appDir()    — the nearest package.json (the Node/app project where
 *                 npm / tsc / eslint must run). May be a subdirectory of the
 *                 repo (as in simvest/) or the repo root itself.
 *
 * Override auto-detection with `.claude/hooks.config.json`:
 *   { "appDir": "relative/or/absolute/path" }
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// This file lives at <root>/.claude/hooks/_paths.js — derive everything from that.
const HOOKS_DIR = __dirname;
const CLAUDE_DIR = path.dirname(HOOKS_DIR); // <root>/.claude
const PROJECT_ROOT = process.env.CLAUDE_PROJECT_DIR || path.dirname(CLAUDE_DIR);
const SESSIONS_DIR = path.join(CLAUDE_DIR, 'sessions');
const RULES_FILE = path.join(CLAUDE_DIR, 'session-rules.md');
const CONFIG_FILE = path.join(CLAUDE_DIR, 'hooks.config.json');

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {
    return null;
  }
}

const config = readJsonSafe(CONFIG_FILE) || {};

let _repoRoot; // undefined = not computed, string = root, null = not a repo
function repoRoot() {
  if (_repoRoot !== undefined) return _repoRoot;
  try {
    const r = spawnSync('git', ['rev-parse', '--show-toplevel'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
      timeout: 5000,
    });
    const out = (r.stdout || '').trim();
    _repoRoot = r.status === 0 && out ? out : null;
  } catch (_) {
    _repoRoot = null;
  }
  return _repoRoot;
}

// Walk up from a file or directory to find the dir containing `marker`.
function findUp(start, marker) {
  let dir = start;
  try {
    if (fs.statSync(start).isFile()) dir = path.dirname(start);
  } catch (_) {
    dir = path.dirname(start); // start may not exist (e.g. deleted file) — use parent
  }
  const fsRoot = path.parse(dir).root;
  for (;;) {
    if (fs.existsSync(path.join(dir, marker))) return dir;
    if (dir === fsRoot) return null;
    dir = path.dirname(dir);
  }
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  'build',
  '.turbo',
  'coverage',
]);

// Breadth-first downward search for the nearest dir containing `marker`.
function findDown(base, marker, maxDepth) {
  const queue = [[base, 0]];
  while (queue.length) {
    const [dir, depth] = queue.shift();
    if (fs.existsSync(path.join(dir, marker))) return dir;
    if (depth >= maxDepth) continue;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    for (const e of entries) {
      if (e.isDirectory() && !SKIP_DIRS.has(e.name) && !e.name.startsWith('.')) {
        queue.push([path.join(dir, e.name), depth + 1]);
      }
    }
  }
  return null;
}

let _appDir;
// The Node/app project dir (where package.json + npm scripts live).
//   appDir(file) → nearest package.json above `file`, or null if none (treat as
//                  "file not in a Node project" — do NOT fall back repo-wide).
//   appDir()     → the repo's app dir: config override → repo root → downward search.
function appDir(forFile) {
  if (forFile) {
    return findUp(forFile, 'package.json');
  }
  if (_appDir !== undefined) return _appDir;
  const root = repoRoot() || PROJECT_ROOT;
  if (config.appDir) {
    _appDir = path.isAbsolute(config.appDir) ? config.appDir : path.join(root, config.appDir);
  } else if (fs.existsSync(path.join(root, 'package.json'))) {
    _appDir = root;
  } else {
    _appDir = findDown(root, 'package.json', 3) || root;
  }
  return _appDir;
}

// Is this absolute file path inside the repo?
function isInRepo(filePath) {
  if (!filePath) return false;
  const root = repoRoot();
  if (!root) return false;
  const rel = path.relative(root, filePath);
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

module.exports = {
  PROJECT_ROOT,
  CLAUDE_DIR,
  SESSIONS_DIR,
  RULES_FILE,
  config,
  readJsonSafe,
  repoRoot,
  appDir,
  findUp,
  isInRepo,
};
