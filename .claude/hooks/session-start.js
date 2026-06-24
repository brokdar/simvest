#!/usr/bin/env node
'use strict';
/**
 * SessionStart hook. Injects, as additionalContext:
 *   1. A summary of the prior session (commits made, uncommitted changes, recent log).
 *   2. The project's always-active rules from .claude/session-rules.md.
 * Also records the starting commit so session-end can diff against it.
 */
const fs = require('fs');
const path = require('path');
const P = require('./_paths.js');
const S = require('./_session.js');

const MAX_CONTEXT_CHARS = 10000;

function buildContext(priorSession) {
  const parts = [];

  if (priorSession) {
    const ts = priorSession.timestamp || 'unknown';
    const lines = [`## Prior Session (${ts})`];

    if (priorSession.sessionCommits !== undefined) {
      // New format
      if (Array.isArray(priorSession.sessionCommits) && priorSession.sessionCommits.length > 0) {
        lines.push('### Committed this session:');
        priorSession.sessionCommits.forEach((c) => lines.push(`- ${c}`));
      } else {
        lines.push('_No commits recorded last session._');
      }
    } else {
      // Legacy format fallback (modifiedFiles)
      const files = priorSession.modifiedFiles || [];
      if (files.length > 0) {
        lines.push('### Modified files (legacy):');
        files.forEach((f) => lines.push(`- ${f}`));
      }
    }

    if (Array.isArray(priorSession.uncommittedChanges) && priorSession.uncommittedChanges.length > 0) {
      lines.push('### Uncommitted changes:');
      priorSession.uncommittedChanges.forEach((f) => lines.push(`- ${f}`));
    }

    if (Array.isArray(priorSession.recentLog) && priorSession.recentLog.length > 0) {
      lines.push('### Recent git log:');
      priorSession.recentLog.slice(0, 5).forEach((c) => lines.push(`- ${c}`));
    }

    parts.push(lines.join('\n'));
  }

  const rules = S.getSessionRules();
  if (rules) parts.push(rules);

  let context = parts.join('\n\n');
  if (context.length > MAX_CONTEXT_CHARS) {
    context = context.substring(0, MAX_CONTEXT_CHARS - 3) + '...';
  }
  return context;
}

const MAX_STDIN = 1024 * 1024;
let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  if (data.length < MAX_STDIN) data += chunk.substring(0, MAX_STDIN - data.length);
});
process.stdin.on('end', () => {
  let additionalContext = '';
  try {
    fs.mkdirSync(P.SESSIONS_DIR, { recursive: true });
    S.recordStartContext();

    const sessionEnd = P.readJsonSafe(path.join(P.SESSIONS_DIR, 'latest.json'));
    const preCompact = P.readJsonSafe(path.join(P.SESSIONS_DIR, 'pre-compact-latest.json'));

    let priorSession = null;
    if (sessionEnd && preCompact) {
      const tse = new Date(sessionEnd.timestamp || 0).getTime();
      const tpc = new Date(preCompact.timestamp || 0).getTime();
      priorSession = tpc >= tse ? preCompact : sessionEnd;
    } else {
      priorSession = preCompact || sessionEnd;
    }

    additionalContext = buildContext(priorSession);
  } catch (e) {
    process.stderr.write('[Hook] session-start error: ' + e.message + '\n');
    additionalContext = S.getSessionRules() || '';
  }

  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext },
    })
  );
  process.exit(0);
});
