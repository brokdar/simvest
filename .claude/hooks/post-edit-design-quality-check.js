#!/usr/bin/env node
'use strict';
const fs = require('fs');
const P = require('./_paths.js');

const MAX_STDIN = 1024 * 1024;

// NOTE: the signals below are project-specific design heuristics, not paths.
// To reuse this hook on another project, override them via .claude/hooks.config.json
// (e.g. config.designSignals) — left inline here as Simvest's defaults.
const GENERIC_SIGNALS = [
  { pattern: /\bget\s+started\b/i, label: '"Get Started" copy — use specific Simvest CTAs' },
  { pattern: /\blearn\s+more\b/i, label: '"Learn more" copy — be specific' },
  { pattern: /grid-cols-(3|4)\b/, label: 'uniform multi-column grid — consider asymmetric layouts' },
  { pattern: /bg-gradient-to-[trbl]/, label: 'stock Tailwind gradient — use Simvest design tokens' },
  { pattern: /font-(sans|mono)\b/, label: 'default Tailwind font — use Manrope or Inter explicitly' },
  { pattern: /recharts|visx|d3\b/, label: 'chart library import — Simvest uses hand-built SVG charts only' },
  { pattern: /text-gray-(400|500|600)\b/, label: 'generic gray — use Simvest neutral tokens from globals.css' },
];

const DESIGN_CHECKLIST = `[Hook] Simvest design checklist:
  - Visual hierarchy with real contrast (not just size)
  - Intentional spacing rhythm using design tokens
  - Simvest color palette (#1E40AF primary, custom neutrals from globals.css)
  - Purposeful hover and focus states
  - SVG charts hand-built — no chart library imports`;

let data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  if (data.length < MAX_STDIN) data += chunk.substring(0, MAX_STDIN - data.length);
});
process.stdin.on('end', () => {
  try {
    const input = JSON.parse(data);
    const filePath = input.tool_input?.file_path || '';
    const isFrontend = /\.(tsx|css|jsx)$/.test(filePath);
    const inProject = isFrontend && P.isInRepo(filePath) && !!P.appDir(filePath);

    if (inProject) {
      const signals = [];
      try {
        const content = fs.readFileSync(filePath, 'utf8');
        for (const { pattern, label } of GENERIC_SIGNALS) {
          if (pattern.test(content)) {
            signals.push(label);
          }
        }
      } catch (e) {
        process.stderr.write('[Hook] post-edit-design-quality-check: could not read file: ' + e.message + '\n');
      }

      process.stderr.write(DESIGN_CHECKLIST + '\n');

      if (signals.length > 0) {
        process.stderr.write('[Hook] Generic UI signals detected:\n');
        for (const s of signals) {
          process.stderr.write('  ! ' + s + '\n');
        }
      }
    }
  } catch (e) {
    process.stderr.write('[Hook] post-edit-design-quality-check error: ' + e.message + '\n');
  }
  process.stdout.write(data);
  process.exit(0);
});
