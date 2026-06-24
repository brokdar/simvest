#!/usr/bin/env node
/**
 * PreToolUse/Write|Edit hook: pre-write-config-protection.js
 *
 * Blocks edits to linter / formatter config files that already exist on disk.
 * This prevents Claude from loosening lint/format rules to make checks pass
 * instead of fixing the underlying code.
 *
 * New files (not yet on disk) are allowed — initial creation is fine.
 *
 * Exit 2 → Claude sees the error and aborts the tool call.
 * Exit 0 → pass through.
 */

"use strict";

const path = require("path");
const fs = require("fs");

const PROTECTED_BASENAMES = new Set([
  // ESLint
  ".eslintrc",
  ".eslintrc.js",
  ".eslintrc.cjs",
  ".eslintrc.json",
  ".eslintrc.yml",
  ".eslintrc.yaml",
  "eslint.config.js",
  "eslint.config.mjs",
  "eslint.config.cjs",
  "eslint.config.ts",
  // Prettier
  ".prettierrc",
  ".prettierrc.js",
  ".prettierrc.json",
  ".prettierrc.yml",
  ".prettierrc.yaml",
  "prettier.config.js",
  "prettier.config.mjs",
  // Biome
  "biome.json",
  "biome.jsonc",
  // Markdownlint
  ".markdownlint.json",
  ".markdownlint.yaml",
  ".markdownlintrc",
]);

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

  const filePath = input?.tool_input?.file_path || "";
  if (!filePath) {
    process.stdout.write(raw);
    process.exit(0);
  }

  const basename = path.basename(filePath);

  if (!PROTECTED_BASENAMES.has(basename)) {
    // Not a protected file — pass through.
    process.stdout.write(raw);
    process.exit(0);
  }

  // Protected filename found — only block if the file already exists.
  if (fs.existsSync(filePath)) {
    process.stderr.write(
      `[Hook] BLOCKED: Editing ${basename} is not allowed. Fix the code instead of loosening lint rules.\n`
    );
    process.exit(2);
  }

  // File doesn't exist yet — new creation is fine.
  process.stdout.write(raw);
  process.exit(0);
});
