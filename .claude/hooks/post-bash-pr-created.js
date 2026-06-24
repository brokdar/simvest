#!/usr/bin/env node
// PostToolUse/Bash — log PR URL and review command after gh pr create

const chunks = [];
process.stdin.on("data", (chunk) => chunks.push(chunk));
process.stdin.on("end", () => {
  const data = Buffer.concat(chunks).toString();
  let input = {};
  try {
    input = JSON.parse(data);
  } catch (_) {}

  const command = (input.tool_input && input.tool_input.command) || "";
  const output = (input.tool_output && input.tool_output.output) || "";

  if (/\bgh\s+pr\s+create\b/.test(command)) {
    const match = output.match(/https:\/\/github\.com\/[^/]+\/[^/]+\/pull\/\d+/);
    if (match) {
      const prUrl = match[0];
      const prNum = prUrl.split("/").pop();
      process.stderr.write(`[Hook] PR created: ${prUrl}\n`);
      process.stderr.write(`[Hook] Review: gh pr view ${prNum}\n`);
    }
  }

  process.stdout.write(data);
  process.exit(0);
});
