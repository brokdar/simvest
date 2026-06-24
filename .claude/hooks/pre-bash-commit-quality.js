#!/usr/bin/env node
/**
 * PreToolUse/Bash hook: pre-bash-commit-quality.js
 *
 * Fires before every Bash tool call. If the command is a `git commit`,
 * this hook:
 *   1. Scans staged TS/JS files for debugger statements and hardcoded secrets (BLOCK).
 *   2. Warns about console.log usage (no block).
 *   3. Validates the conventional-commit message format (warn only).
 *   4. Runs ESLint on staged TS/JS files (warn only).
 *
 * Exit 2  → Claude sees the error output and aborts the tool call.
 * Exit 0  → tool call proceeds normally.
 */

"use strict";

const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");
const P = require("./_paths.js");

const APP_DIR = P.appDir(); // ESLint + its config resolve here
const REPO = P.repoRoot() || APP_DIR; // git runs here; staged paths are repo-relative
const ESLINT_BIN = path.join(APP_DIR, "node_modules", ".bin", "eslint");

// ─── helpers ──────────────────────────────────────────────────────────────────

function run(cmd, args, opts = {}) {
  return spawnSync(cmd, args, { encoding: "utf8", ...opts });
}

function getStagedFiles() {
  const result = run(
    "git",
    ["diff", "--cached", "--name-only", "--diff-filter=ACMR"],
    { cwd: REPO }
  );
  if (result.status !== 0) return [];
  return result.stdout
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
}

function getFileContentFromIndex(relPath) {
  // Use the staged version of the file, not the working-tree version.
  const result = run("git", ["show", `:${relPath}`], { cwd: REPO });
  return result.status === 0 ? result.stdout : null;
}

// ─── secret patterns ──────────────────────────────────────────────────────────

const SECRET_PATTERNS = [
  { re: /sk-[a-zA-Z0-9]{20,}/, label: "OpenAI API key" },
  { re: /ghp_[a-zA-Z0-9]{36}/, label: "GitHub PAT" },
  { re: /AKIA[A-Z0-9]{16}/, label: "AWS access key" },
  {
    re: /(?:api[_-]?key|password|secret)\s*[=:]\s*['"][^'"]{8,}['"]/i,
    label: "hardcoded credential",
  },
];

// ─── conventional-commit validation ───────────────────────────────────────────

const CC_RE =
  /^(feat|fix|docs|style|refactor|test|chore|build|ci|perf|revert)(\(.+\))?:\s*.+/;

function extractCommitMessage(command) {
  // Handles: -m "message", -m 'message', --message="message", heredoc $(cat <<EOF…EOF)
  const mFlag = command.match(/(?:-m|--message)\s+["']([^"']+)["']/);
  if (mFlag) return mFlag[1];
  const mEq = command.match(/(?:-m|--message)=["']([^"']+)["']/);
  if (mEq) return mEq[1];
  return null;
}

// ─── main ─────────────────────────────────────────────────────────────────────

let raw = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    // Not valid JSON — pass through silently.
    process.stdout.write(raw);
    process.exit(0);
  }

  const command = input?.tool_input?.command || "";

  // ── 1. Only act on `git commit` commands ──────────────────────────────────
  if (!/\bgit\s+commit\b/.test(command)) {
    process.stdout.write(raw);
    process.exit(0);
  }

  // ── 2. Skip amends ────────────────────────────────────────────────────────
  if (/--amend\b/.test(command)) {
    process.stdout.write(raw);
    process.exit(0);
  }

  // ── 3. Gather staged TS/JS files (only inside the app project, not tooling) ─
  const allStaged = getStagedFiles().filter(
    (f) => !APP_DIR || path.join(REPO, f).startsWith(APP_DIR + path.sep)
  );
  const tsJsFiles = allStaged.filter((f) =>
    /\.(ts|tsx|js|jsx)$/.test(f)
  );

  const errors = [];
  const warnings = [];

  // ── 4. Scan file content for secrets / debugger / console.log ─────────────
  for (const relPath of tsJsFiles) {
    const content = getFileContentFromIndex(relPath);
    if (content === null) continue;

    const lines = content.split("\n");

    lines.forEach((line, idx) => {
      const lineNo = idx + 1;
      const trimmed = line.trimStart();
      const isComment = trimmed.startsWith("//") || trimmed.startsWith("*");

      // debugger statement
      if (!isComment && /\bdebugger\b/.test(line)) {
        errors.push(`  ${relPath}:${lineNo} — debugger statement found`);
      }

      // hardcoded secrets
      if (!isComment) {
        for (const { re, label } of SECRET_PATTERNS) {
          if (re.test(line)) {
            errors.push(
              `  ${relPath}:${lineNo} — possible ${label} detected`
            );
          }
        }
      }

      // console.log (warn only, skip comment lines)
      if (!isComment && /\bconsole\.log\s*\(/.test(line)) {
        warnings.push(
          `  ${relPath}:${lineNo} — console.log (consider removing before commit)`
        );
      }
    });
  }

  // ── 5. Conventional-commit message validation ──────────────────────────────
  const commitMsg = extractCommitMessage(command);
  if (commitMsg) {
    const subject = commitMsg.split("\n")[0];

    if (!CC_RE.test(subject)) {
      warnings.push(
        `  Commit message does not follow Conventional Commits format.\n` +
          `  Expected: <type>(<scope>): <description>\n` +
          `  Got:      "${subject}"`
      );
    } else {
      if (subject.length > 72) {
        warnings.push(
          `  Commit subject is ${subject.length} chars (max 72): "${subject}"`
        );
      }
      if (subject.trimEnd().endsWith(".")) {
        warnings.push(
          `  Commit subject should not end with a period: "${subject}"`
        );
      }
    }
  }

  // ── 6. ESLint on staged TS/JS files ───────────────────────────────────────
  if (tsJsFiles.length > 0 && fs.existsSync(ESLINT_BIN)) {
    const absFiles = tsJsFiles.map((f) => path.join(REPO, f));
    const lint = spawnSync(
      ESLINT_BIN,
      ["--format", "compact", "--max-warnings", "0", ...absFiles],
      { encoding: "utf8", cwd: APP_DIR }
    );
    if (lint.status !== 0 && lint.stdout.trim()) {
      warnings.push(`  ESLint reported issues:\n${lint.stdout.trim()}`);
    }
  }

  // ── 7. Print summary ──────────────────────────────────────────────────────
  const hasErrors = errors.length > 0;

  if (warnings.length > 0) {
    process.stderr.write(
      `[Hook] commit-quality — warnings:\n${warnings.join("\n")}\n`
    );
  }

  if (hasErrors) {
    process.stderr.write(
      `[Hook] commit-quality — BLOCKED (fix the following before committing):\n` +
        `${errors.join("\n")}\n`
    );
    process.exit(2);
  }

  if (warnings.length === 0 && errors.length === 0) {
    process.stderr.write(`[Hook] commit-quality — all checks passed.\n`);
  }

  // Pass the original input through so the tool call can proceed.
  process.stdout.write(raw);
  process.exit(0);
});
