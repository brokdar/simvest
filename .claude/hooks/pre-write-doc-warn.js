#!/usr/bin/env node
// PreToolUse/Write — warn when Claude creates documentation files that weren't explicitly requested

const ALLOWED_BASENAMES = new Set([
  "README.md",
  "CLAUDE.md",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "LICENSE.md",
  "AGENTS.md",
  "SKILL.md",
  "ECC_ANALYSIS.md",
]);

const ALLOWED_PATH_SEGMENTS = [
  "/docs/",
  "/skills/",
  "/.claude/",
  "/.agents/",
  "/drizzle/",
];

const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const data = Buffer.concat(chunks).toString();
  let input = {};
  try {
    input = JSON.parse(data);
  } catch (_) {}

  const filePath = (input.tool_input && input.tool_input.file_path) || "";

  if (/\.(md|txt)$/.test(filePath)) {
    const basename = filePath.split("/").pop();
    const inAllowedDir = ALLOWED_PATH_SEGMENTS.some((seg) =>
      filePath.includes(seg)
    );

    if (!ALLOWED_BASENAMES.has(basename) && !inAllowedDir) {
      process.stderr.write(
        `[Hook] WARNING: Creating doc file ${basename} — only create docs when explicitly requested\n`
      );
    }
  }

  process.stdout.write(data);
  process.exit(0);
});
