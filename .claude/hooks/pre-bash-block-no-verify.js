#!/usr/bin/env node
/**
 * PreToolUse/Bash hook: pre-bash-block-no-verify.js
 *
 * Blocks any git command that tries to bypass pre-commit hooks via:
 *   --no-verify
 *   -n  (short flag for --no-verify on commit/push/merge/cherry-pick)
 *   -c core.hooksPath=  (redirect hooks directory to /dev/null or similar)
 *
 * Exit 2 → Claude sees the error and aborts the tool call.
 * Exit 0 → pass through.
 */

"use strict";

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    process.stdout.write(raw);
    process.exit(0);
  }

  const command = input?.tool_input?.command || "";

  // Only inspect commands that contain a git invocation.
  if (!/\bgit\b/.test(command)) {
    process.stdout.write(raw);
    process.exit(0);
  }

  // Detect hook-bypass patterns.
  const hasNoVerify = /--no-verify\b/.test(command);
  // -n as a standalone flag (possibly followed by space or end of token)
  const hasShortN = /-n\s/.test(command) || /\s-n$/.test(command);
  const hasCoreHooksPath = /\bcore\.hookspath\s*=/i.test(command);

  if (hasNoVerify || hasShortN || hasCoreHooksPath) {
    process.stderr.write(
      "[Hook] BLOCKED: --no-verify is not allowed. Fix the underlying issue instead.\n"
    );
    process.exit(2);
  }

  process.stdout.write(raw);
  process.exit(0);
});
