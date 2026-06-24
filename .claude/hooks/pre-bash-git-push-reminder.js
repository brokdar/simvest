#!/usr/bin/env node
// PreToolUse/Bash — remind to review diff before git push

const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const data = Buffer.concat(chunks).toString();
  let input = {};
  try {
    input = JSON.parse(data);
  } catch (_) {}

  const command = (input.tool_input && input.tool_input.command) || "";
  if (/\bgit\s+push\b/.test(command)) {
    process.stderr.write(
      "[Hook] Reminder: review your diff before pushing (git diff HEAD~1)\n"
    );
  }

  process.stdout.write(data);
  process.exit(0);
});
