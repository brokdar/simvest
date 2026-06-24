#!/usr/bin/env node
// PreToolUse/all — suggest /compact every 50 tool calls to prevent context loss

const fs = require("fs");

const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const data = Buffer.concat(chunks).toString();
  let input = {};
  try {
    input = JSON.parse(data);
  } catch (_) {}

  // Sanitize session_id: alphanumeric + -_ only, max 64 chars
  const rawId = (input.session_id || "default").replace(/[^a-zA-Z0-9\-_]/g, "").slice(0, 64) || "default";
  const counterFile = `/tmp/claude-tool-count-${rawId}`;

  // Read current count
  let count = 0;
  try {
    const contents = fs.readFileSync(counterFile, "utf8").trim();
    count = parseInt(contents, 10) || 0;
  } catch (_) {}

  count += 1;

  // Write updated count back
  try {
    fs.writeFileSync(counterFile, String(count), "utf8");
  } catch (_) {}

  // Suggest /compact at 50, then every 25 after that
  if (count === 50 || (count > 50 && (count - 50) % 25 === 0)) {
    process.stderr.write(
      `[Hook] ${count} tool calls reached — consider /compact if transitioning between phases\n`
    );
  }

  process.stdout.write(data);
  process.exit(0);
});
