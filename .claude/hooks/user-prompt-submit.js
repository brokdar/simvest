#!/usr/bin/env node
'use strict';
/**
 * UserPromptSubmit hook. Injects the current UTC time as additionalContext on
 * each user message, giving the model a temporal anchor across long sessions.
 * Best-effort: if it fails, the only loss is the timestamp annotation.
 */
const MAX_STDIN = 1024 * 1024;
let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  if (data.length < MAX_STDIN) data += chunk.substring(0, MAX_STDIN - data.length);
});
process.stdin.on('end', () => {
  const hhmm = new Date().toISOString().slice(11, 16); // "HH:MM", always UTC
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: `[${hhmm} UTC]`,
      },
    })
  );
  process.exit(0);
});
