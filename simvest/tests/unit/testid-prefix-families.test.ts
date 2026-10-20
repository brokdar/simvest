import { readFileSync, readdirSync, statSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

/**
 * Testid prefix-family guard. An e2e selector like
 * `[data-testid^="goal-tile-"]` is meant to match one family — the testids
 * built as `goal-tile-${id}`. A new testid that merely *starts* with the same
 * text (`goal-tile-status`, `goal-tile-${id}-bar`) silently joins the match
 * and breaks counts and `.first()` picks (P3 broke VIEWS-010 this way).
 *
 * The rule: for every prefix X used in tests/e2e with `^=`, each testid in
 * components/ or app/ that starts with X must be a family member — X followed
 * directly by one interpolation and nothing else (`${X}${id}`). Anything with
 * more static text after X, or a static literal starting with X, collides.
 *
 * ALLOWED lists deliberate extras per prefix, each with the reason a spec
 * scoping can't trip over it.
 */
const NAV_SCOPED =
  "accessibility spec scopes ^=nav- to the nav container; static nav item ids are the family"
const ALLOWED: Record<string, Record<string, string>> = {
  "nav-": {
    "nav-toggle":
      "the hamburger sits in the topbar, outside the scoped nav list",
    "nav-overview": NAV_SCOPED,
    "nav-holdings": NAV_SCOPED,
    "nav-entries": NAV_SCOPED,
    "nav-income": NAV_SCOPED,
    "nav-projection": NAV_SCOPED,
    "nav-goals": NAV_SCOPED,
    "nav-settings": NAV_SCOPED,
  },
}

const ROOT = join(__dirname, "..", "..")

function walk(dir: string, exts: RegExp): string[] {
  let out: string[] = []
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return out
  }
  for (const n of names) {
    if (n === "node_modules" || n.startsWith(".")) continue
    const p = join(dir, n)
    if (statSync(p).isDirectory()) out = out.concat(walk(p, exts))
    else if (exts.test(n)) out.push(p)
  }
  return out
}

/** Every `[data-testid^="X"]` prefix used by the e2e suite. */
function e2ePrefixes(): string[] {
  const set = new Set<string>()
  for (const f of walk(join(ROOT, "tests", "e2e"), /\.ts$/)) {
    const src = readFileSync(f, "utf8")
    for (const m of src.matchAll(/data-testid\^=\\?["']?([^"'\]\\]+)/g))
      set.add(m[1])
  }
  return [...set]
}

/**
 * Testid shapes declared in app code, normalised so every interpolation is
 * `${}`. Picks up `data-testid=`, `testId=` / `testId:` props, and every
 * string/template literal in the expression that follows (ternaries).
 */
function appTestids(): Map<string, string> {
  const ids = new Map<string, string>()
  const files = [
    ...walk(join(ROOT, "components"), /\.tsx?$/),
    ...walk(join(ROOT, "app"), /\.tsx?$/),
  ]
  for (const f of files) {
    const src = readFileSync(f, "utf8")
    for (const m of src.matchAll(
      /(?:data-testid|testId|testid)\s*[=:]\s*(\{[^}\n]*(?:\}[^}\n]*)*?\}|"[^"]*"|'[^']*')/g
    )) {
      const expr = m[1]
      for (const lit of expr.matchAll(/"([^"]*)"|'([^']*)'|`([^`]*)`/g)) {
        const raw = lit[1] ?? lit[2] ?? lit[3] ?? ""
        if (!raw) continue
        const norm = raw.replace(/\$\{[^}]*\}/g, "${}")
        ids.set(norm, f.slice(ROOT.length + 1))
      }
    }
  }
  return ids
}

describe("testid prefix families", () => {
  const prefixes = e2ePrefixes()
  const ids = appTestids()

  it("UNIT-TESTID-001 — finds the prefixes and testids it guards", () => {
    expect(prefixes.length).toBeGreaterThan(5)
    expect(ids.size).toBeGreaterThan(50)
  })

  it.each(prefixes)(
    "UNIT-TESTID-002 — only the %s* family starts with that prefix",
    (x) => {
      const allowed = ALLOWED[x] ?? {}
      const collisions = [...ids.entries()]
        .filter(([id]) => id.startsWith(x))
        // A family member is X plus one interpolation — or another prefix the
        // suite also uses (a deliberate sub-family, e.g. income-bar-hit-).
        .filter(([id]) => id !== `${x}\${}`)
        .filter(([id]) => !(id in allowed))
        .filter(
          ([id]) =>
            !prefixes.some(
              (p) => p !== x && p.startsWith(x) && id.startsWith(p)
            )
        )
        .map(([id, file]) => `${id}  (${file})`)
      expect(collisions, `testids that also match ^="${x}"`).toEqual([])
    }
  )
})
