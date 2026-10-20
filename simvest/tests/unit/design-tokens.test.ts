import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Token-compliance guard (P1 · F7). Components and routes must paint with
 * the tokens in app/globals.css — never a raw colour or a raw px font size —
 * so every colour exists in both themes and there is one type scale.
 *
 * Scope: components/**, app/**, hooks/** (.ts/.tsx/.css), excluding
 * app/globals.css, which IS the token layer. Identity colours stored in the
 * DB live in lib/palette.ts (outside the scanned tree on purpose).
 *
 * ALLOWLIST: none today. If one is ever truly needed, add `path → reason`
 * here and in docs/design-tokens.md — the reason must say why a token can't
 * work.
 */
const ALLOWLIST: Record<string, string> = {}

const ROOT = join(__dirname, "..", "..")
const SCAN_DIRS = ["components", "app", "hooks"]
const EXCLUDE = new Set(["app/globals.css"])

function walk(dir: string): string[] {
  let out: string[] = []
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return out
  }
  for (const name of names) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out = out.concat(walk(p))
    else if (/\.(tsx?|css)$/.test(name)) out.push(p)
  }
  return out
}

/** Drop comments so prose like "the old #1E40AF tile" doesn't trip the scan. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .split("\n")
    .map((line) => line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1"))
    .join("\n")
}

type Rule = { name: string; re: RegExp }

const RULES: Rule[] = [
  {
    name: "raw hex colour",
    re: /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/,
  },
  { name: "raw rgb()/hsl() colour", re: /\b(?:rgba?|hsla?|oklch)\(/ },
  { name: "named colour literal", re: /["'](?:white|black)["']/ },
  {
    name: "Tailwind palette colour class",
    re: /\b(?:bg|text|border|fill|stroke|ring|outline)-(?:white|black|(?:gray|slate|zinc|neutral|stone|red|green|blue|amber|yellow|emerald|sky|indigo|purple)-\d{2,3})\b/,
  },
  { name: "raw px font size (inline style)", re: /fontSize:\s*(?:\d|["']\d)/ },
  {
    name: "raw px font size (SVG attribute)",
    re: /fontSize=(?:["']?\d|\{\s*\d|\{[^}]*?(?:["']\d|[?:]\s*\d))/,
  },
  { name: "raw px font size (CSS)", re: /font-size:\s*\d*\.?\d+(?:px|rem|em)/ },
  { name: "raw font size (Tailwind arbitrary)", re: /\btext-\[\d/ },
  {
    name: "font-family outside the --font-* tokens",
    re: /font(?:Family|-family)\s*[:=]\s*(?!\s*["'{]?\s*(?:var\(--font-|inherit))/,
  },
]

function scan() {
  const hits: string[] = []
  for (const dir of SCAN_DIRS) {
    for (const file of walk(join(ROOT, dir))) {
      const rel = relative(ROOT, file).split("\\").join("/")
      if (EXCLUDE.has(rel) || ALLOWLIST[rel]) continue
      const lines = stripComments(readFileSync(file, "utf8")).split("\n")
      lines.forEach((line, i) => {
        for (const rule of RULES) {
          if (rule.re.test(line)) {
            hits.push(`${rel}:${i + 1} ${rule.name}: ${line.trim()}`)
          }
        }
      })
    }
  }
  return hits
}

describe("design tokens — no raw colours or font sizes outside globals.css", () => {
  it("UNIT-TOKENS-001 — components/app/hooks paint only with tokens", () => {
    expect(scan()).toEqual([])
  })

  it("UNIT-TOKENS-002 — the guard actually catches each violation kind", () => {
    const samples = [
      'style={{ color: "#B91C1C" }}',
      'fill="#fff"',
      'border: "1px solid rgba(255,255,255,0.4)"',
      'background: active ? "var(--primary-50)" : "white",',
      'className="bg-white text-gray-500"',
      "fontSize: 12,",
      'fontSize="11"',
      "fontSize={11}",
      'fontSize={narrow ? "10" : "11"}',
      "font-size: 13px;",
      'className="text-[13px]"',
      'fontFamily: "system-ui, sans-serif"',
    ]
    for (const s of samples) {
      expect(
        RULES.some((r) => r.re.test(stripComments(s))),
        `guard missed: ${s}`
      ).toBe(true)
    }
  })

  it("UNIT-TOKENS-003 — token usages are not flagged", () => {
    const ok = [
      'style={{ color: "var(--critical)" }}',
      'fill="var(--surface)"',
      'fontSize: "var(--fs-xs)",',
      'fontSize={narrow ? "var(--fs-3xs)" : "var(--fs-2xs)"}',
      'fontFamily="var(--font-body)"',
      'fontFamily: "inherit",',
      'className="bg-(--scrim) text-muted-foreground"',
      "// legacy note: was #1E40AF",
      'href="#main"',
    ]
    for (const s of ok) {
      expect(
        RULES.filter((r) => r.re.test(stripComments(s))).map((r) => r.name),
        s
      ).toEqual([])
    }
  })
})

describe("design tokens — every colour token exists in both themes", () => {
  const css = readFileSync(join(ROOT, "app", "globals.css"), "utf8")
  const block = (selector: string) => {
    const start = css.indexOf(`${selector} {`)
    const end = css.indexOf("\n}", start)
    return css.slice(start, end)
  }
  const names = (src: string) =>
    new Set([...src.matchAll(/^\s*(--[a-z0-9-]+):/gm)].map((m) => m[1]))
  const isColour = (decl: string) =>
    /#[0-9a-fA-F]{3,8}\b|rgba?\(/.test(decl) &&
    !/^\s*--(sh|font|fs|r)-/.test(decl)

  it("UNIT-TOKENS-010 — each raw-coloured light token is redefined under .dark", () => {
    const light = block(":root")
    const dark = names(block(".dark"))
    const lightColourTokens = light
      .split("\n")
      .filter(isColour)
      .map((l) => l.trim().split(":")[0])
    // Theme-agnostic by design: scrims/overlays on top of anything, the
    // tooltip chip's own inks (the chip is dark in both themes), the hero's
    // white-on-blue inks, and on-hero foreground.
    const agnostic = new Set([
      "--scrim",
      "--hero-fg",
      "--hero-fg-soft",
      "--hero-fg-muted",
      "--hero-chip-bg",
      "--tooltip-fg-soft",
      "--tooltip-fg-muted",
      "--tooltip-divider",
      "--tooltip-chip-border",
      "--tooltip-good",
      "--tooltip-critical",
    ])
    const missing = lightColourTokens.filter(
      (t) => !dark.has(t) && !agnostic.has(t)
    )
    expect(missing).toEqual([])
  })

  it("UNIT-TOKENS-011 — every var(--x) used by components is defined", () => {
    const defined = names(css)
    // Set inline by components or by next/font, not in globals.css.
    const runtime = new Set(["--fill", "--font-inter", "--font-manrope"])
    const used = new Set<string>()
    for (const dir of SCAN_DIRS) {
      for (const file of walk(join(ROOT, dir))) {
        for (const m of readFileSync(file, "utf8").matchAll(
          /var\((--[a-z0-9-]+)/g
        ))
          used.add(m[1])
      }
    }
    for (const file of walk(join(ROOT, "lib")))
      for (const m of readFileSync(file, "utf8").matchAll(
        /var\((--[a-z0-9-]+)/g
      ))
        used.add(m[1])
    const undefinedVars = [...used].filter(
      (v) => !defined.has(v) && !runtime.has(v)
    )
    expect(undefinedVars).toEqual([])
  })

  it("UNIT-TOKENS-012 — semantic state tokens exist and differ from the brand accent", () => {
    const light = block(":root")
    const value = (name: string) =>
      light.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1].trim()
    const primary = value("--primary")
    for (const t of ["--good", "--warn", "--critical", "--info"]) {
      expect(value(t), t).toBeTruthy()
      expect(value(t), t).not.toBe(primary)
      expect(value(`${t}-bg`), `${t}-bg`).toBeTruthy()
      expect(value(`${t}-border`), `${t}-border`).toBeTruthy()
    }
  })
})
