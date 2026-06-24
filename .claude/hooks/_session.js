'use strict';
/**
 * _session.js — session-state helpers shared by session-start, session-end and
 * pre-compact. Required via `require('./_session.js')`; not a hook itself.
 *
 * Captures session activity from git (commits made this session, recent log,
 * uncommitted changes) rather than a raw file diff — a commit-aware signal that
 * survives `git commit` instead of going empty the moment work is committed.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const P = require('./_paths.js');

const MAX_HISTORY = 5;

function git(...args) {
  const root = P.repoRoot();
  if (!root) return [];
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: 10000 });
  if (r.status !== 0) return [];
  return (r.stdout || '').trim().split('\n').filter(Boolean);
}

function getHeadSha() {
  const root = P.repoRoot();
  if (!root) return null;
  const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
    timeout: 5000,
  });
  return r.status === 0 ? (r.stdout || '').trim() || null : null;
}

// Commits between startSha and HEAD.
//   null  → start SHA unknown (can't compute)
//   []    → known start, nothing committed this session
//   [...] → commit subject lines
function getSessionCommits(startSha) {
  if (!startSha) return null;
  const endSha = getHeadSha();
  if (!endSha) return null;
  if (startSha === endSha) return [];
  return git('log', '--oneline', `${startSha}..HEAD`);
}

function getRecentLog() {
  return git('log', '--oneline', '-10');
}

function getUncommittedChanges() {
  return git('status', '--short');
}

// Record where the session began so session-end can diff against it.
function recordStartContext() {
  try {
    fs.mkdirSync(P.SESSIONS_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(P.SESSIONS_DIR, 'session-start-context.json'),
      JSON.stringify({ timestamp: new Date().toISOString(), headSha: getHeadSha() }, null, 2)
    );
  } catch (_) {}
}

function readStartContext() {
  return P.readJsonSafe(path.join(P.SESSIONS_DIR, 'session-start-context.json'));
}

// Project-specific "always active" rules, externalized to .claude/session-rules.md.
// Absent file → null (generic repos get session continuity without project rules).
function getSessionRules() {
  try {
    const txt = fs.readFileSync(P.RULES_FILE, 'utf8').trim();
    return txt || null;
  } catch (_) {
    return null;
  }
}

function pruneOldSessions() {
  try {
    const SKIP = new Set(['latest.json', 'pre-compact-latest.json', 'session-start-context.json']);
    const files = fs
      .readdirSync(P.SESSIONS_DIR)
      .filter((f) => f.endsWith('.json') && !SKIP.has(f))
      .map((f) => ({ name: f, mtime: fs.statSync(path.join(P.SESSIONS_DIR, f)).mtimeMs }))
      .sort((a, b) => b.mtime - a.mtime);
    files.slice(MAX_HISTORY).forEach((f) => {
      try {
        fs.unlinkSync(path.join(P.SESSIONS_DIR, f.name));
      } catch (_) {}
    });
  } catch (_) {}
}

// prefix '' → session-end (writes latest.json + timestamped history + prune)
// prefix 'pre-compact-' → pre-compact (writes pre-compact-latest.json only)
function saveSession(prefix, input) {
  fs.mkdirSync(P.SESSIONS_DIR, { recursive: true });

  const startCtx = readStartContext();
  const startSha = startCtx && startCtx.headSha ? startCtx.headSha : null;
  const timestamp = new Date().toISOString();

  const summary = {
    timestamp,
    sessionId: (input && input.session_id) || 'unknown',
    startSha,
    endHeadSha: getHeadSha(),
    sessionCommits: getSessionCommits(startSha),
    recentLog: getRecentLog(),
    uncommittedChanges: getUncommittedChanges(),
  };

  fs.writeFileSync(
    path.join(P.SESSIONS_DIR, `${prefix}latest.json`),
    JSON.stringify(summary, null, 2)
  );

  if (prefix === '') {
    const safestamp = timestamp.replace(/[:.]/g, '-');
    const sessionId = ((input && input.session_id) || 'unknown').replace(/[^a-zA-Z0-9-_]/g, '_');
    fs.writeFileSync(
      path.join(P.SESSIONS_DIR, `${sessionId}-${safestamp}.json`),
      JSON.stringify(summary, null, 2)
    );
    pruneOldSessions();
  }

  return summary;
}

module.exports = {
  MAX_HISTORY,
  git,
  getHeadSha,
  getSessionCommits,
  getRecentLog,
  getUncommittedChanges,
  recordStartContext,
  readStartContext,
  getSessionRules,
  pruneOldSessions,
  saveSession,
};
