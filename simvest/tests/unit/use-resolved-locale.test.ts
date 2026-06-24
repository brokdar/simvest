import { afterEach, describe, expect, it } from "vitest"
import { resolveLocale, SSR_FALLBACK } from "@/components/use-resolved-locale"
import { fmtEUR, getActiveLocale, setActiveLocale } from "@/lib/format"

// Cover the precedence rules that drive `useResolvedLocale`. The hook
// itself is a thin `useMemo` wrapper; testing the pure resolver here lets
// us exercise the seam without pulling jsdom + testing-library into the
// node-only vitest project.

describe("resolveLocale", () => {
  it("UNIT-LOCALE-001 — user pick wins over browser locale", () => {
    expect(resolveLocale("de-DE", "en-GB")).toEqual({
      locale: "de-DE",
      source: "user",
    })
  })

  it("UNIT-LOCALE-002 — null settings → browser locale when distinct from fallback", () => {
    expect(resolveLocale(null, "de-DE")).toEqual({
      locale: "de-DE",
      source: "browser",
    })
  })

  it("UNIT-LOCALE-003 — null settings + browser equals fallback → fallback source", () => {
    // navigator.language returning the SSR fallback (en-US) is
    // indistinguishable from an unset locale; the resolver explicitly
    // reports `fallback` so the Settings UI can flag it.
    expect(resolveLocale(null, SSR_FALLBACK)).toEqual({
      locale: SSR_FALLBACK,
      source: "fallback",
    })
  })

  it("UNIT-LOCALE-004 — null settings + empty browser → fallback", () => {
    expect(resolveLocale(null, "")).toEqual({
      locale: SSR_FALLBACK,
      source: "fallback",
    })
  })

  it("UNIT-LOCALE-005 — empty-string settings is treated as 'no override'", () => {
    // An empty settings.locale should not pin formatting to ''; the
    // resolver must treat it as "no pick" and fall through to browser.
    expect(resolveLocale("", "de-DE")).toEqual({
      locale: "de-DE",
      source: "browser",
    })
  })
})

// The other half of the integration: <LocaleSync> works by mutating the
// module-level activeLocale used by `fmtEUR / fmtPct / fmtNum`. Verify the
// flip is observable without React by driving `setActiveLocale` directly —
// the same call the component makes during render.

describe("setActiveLocale", () => {
  const PREVIOUS = getActiveLocale()
  afterEach(() => {
    setActiveLocale(PREVIOUS)
  })

  it("UNIT-LOCALE-006 — flipping the active locale switches fmtEUR output", () => {
    setActiveLocale("en-US")
    expect(fmtEUR(1234.5)).toBe("€1,234.50")
    setActiveLocale("de-DE")
    expect(fmtEUR(1234.5)).toBe("€1.234,50")
  })

  it("UNIT-LOCALE-007 — falsy locale is ignored (defensive no-op)", () => {
    setActiveLocale("de-DE")
    setActiveLocale("")
    expect(fmtEUR(1234.5)).toBe("€1.234,50")
  })
})
