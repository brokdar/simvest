import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import {
  DEFAULT_THEME_PREFERENCE,
  isThemePreference,
  resolveTheme,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
} from "@/lib/theme"
import {
  COMBINED_IDENTITY_HEX,
  IDENTITY_COLORS,
  identityColorName,
  swatch,
} from "@/lib/palette"

describe("resolveTheme", () => {
  it("UNIT-THEME-001 — explicit preferences ignore the OS", () => {
    expect(resolveTheme("light", true)).toBe("light")
    expect(resolveTheme("dark", false)).toBe("dark")
  })

  it("UNIT-THEME-002 — system follows the OS", () => {
    expect(resolveTheme("system", true)).toBe("dark")
    expect(resolveTheme("system", false)).toBe("light")
  })

  it("UNIT-THEME-003 — only the three known values are preferences", () => {
    expect(isThemePreference("light")).toBe(true)
    expect(isThemePreference("system")).toBe(true)
    expect(isThemePreference("auto")).toBe(false)
    expect(isThemePreference(null)).toBe(false)
  })
})

/**
 * Run the inline <head> script against a fake document/localStorage/
 * matchMedia — it is the no-flash path, so it must agree with resolveTheme.
 */
function runInitScript(stored: string | null, osDark: boolean, throws = false) {
  const classes = new Set<string>()
  const root = {
    classList: {
      toggle: (c: string, on: boolean) =>
        on ? classes.add(c) : classes.delete(c),
    },
    style: { colorScheme: "" },
  }
  const localStorage = {
    getItem: (k: string) => {
      if (throws) throw new Error("SecurityError")
      return k === THEME_STORAGE_KEY ? stored : null
    },
  }
  const window = { matchMedia: () => ({ matches: osDark }) }
  new Function("document", "localStorage", "window", THEME_INIT_SCRIPT)(
    { documentElement: root },
    localStorage,
    window
  )
  return { dark: classes.has("dark"), colorScheme: root.style.colorScheme }
}

describe("THEME_INIT_SCRIPT (no-flash)", () => {
  it("UNIT-THEME-010 — stored dark applies the dark class before paint", () => {
    expect(runInitScript("dark", false)).toEqual({
      dark: true,
      colorScheme: "dark",
    })
  })

  it("UNIT-THEME-011 — stored light wins over a dark OS", () => {
    expect(runInitScript("light", true)).toEqual({
      dark: false,
      colorScheme: "light",
    })
  })

  it("UNIT-THEME-012 — system follows the OS", () => {
    expect(runInitScript("system", true).dark).toBe(true)
    expect(runInitScript("system", false).dark).toBe(false)
  })

  it("UNIT-THEME-013 — nothing stored / garbage → the default preference", () => {
    const expected = resolveTheme(DEFAULT_THEME_PREFERENCE, true) === "dark"
    expect(runInitScript(null, true).dark).toBe(expected)
    expect(runInitScript("purple", true).dark).toBe(expected)
  })

  it("UNIT-THEME-014 — a throwing localStorage doesn't break the page", () => {
    expect(() => runInitScript(null, true, true)).not.toThrow()
  })
})

describe("identity colours (lib/palette)", () => {
  it("UNIT-PALETTE-001 — every stored hex maps to a theme token", () => {
    for (const c of IDENTITY_COLORS) {
      expect(swatch(c.hex)).toBe(`var(${c.token})`)
      expect(swatch(c.hex.toLowerCase())).toBe(`var(${c.token})`)
    }
    expect(swatch(COMBINED_IDENTITY_HEX)).toBe("var(--id-ink)")
  })

  it("UNIT-PALETTE-002 — unknown colours pass through; idempotent on tokens", () => {
    expect(swatch("#123456")).toBe("#123456")
    expect(swatch(swatch("#1E40AF"))).toBe("var(--id-blue)")
    expect(swatch(null)).toBe("var(--neutral-400)")
  })

  it("UNIT-PALETTE-003 — picker names", () => {
    expect(identityColorName("#7C3AED")).toBe("Purple")
    expect(identityColorName("#abcdef")).toBe("#abcdef")
  })
})

describe("identity tokens in globals.css", () => {
  it("UNIT-PALETTE-004 — light value of each --id-* token equals its stored hex", () => {
    const css = readFileSync(
      join(__dirname, "..", "..", "app", "globals.css"),
      "utf8"
    )
    const root = css.slice(
      css.indexOf(":root {"),
      css.indexOf("\n}", css.indexOf(":root {"))
    )
    for (const c of [
      ...IDENTITY_COLORS,
      { hex: COMBINED_IDENTITY_HEX, token: "--id-ink" },
    ]) {
      const m = root.match(new RegExp(`${c.token}:\\s*(#[0-9a-fA-F]{6});`))
      expect(m?.[1].toLowerCase(), c.token).toBe(c.hex.toLowerCase())
    }
  })
})
