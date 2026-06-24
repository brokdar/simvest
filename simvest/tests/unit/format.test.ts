import { afterAll, beforeAll, describe, it, expect } from "vitest"
import { fmtEUR, fmtPct, fmtNum, setActiveLocale } from "@/lib/format"

// The existing assertions below pin German number formatting (1.234,56).
// `lib/format.ts` now defaults to `en-US` at module load (matching the
// `useSyncExternalStore` SSR fallback in `lib/locale.ts`), so we pin the
// active locale to `de-DE` for this suite — equivalent to what a German
// user would see at runtime — and restore it on teardown.
const PREVIOUS_LOCALE = "en-US"
beforeAll(() => {
  setActiveLocale("de-DE")
})
afterAll(() => {
  setActiveLocale(PREVIOUS_LOCALE)
})

// ---------------------------------------------------------------------------
// fmtEUR
// ---------------------------------------------------------------------------

describe("fmtEUR", () => {
  it("UNIT-FMT-001 — null returns em-dash", () => {
    expect(fmtEUR(null)).toBe("—")
  })

  it("UNIT-FMT-002 — undefined returns em-dash", () => {
    expect(fmtEUR(undefined)).toBe("—")
  })

  it("UNIT-FMT-003 — NaN returns em-dash", () => {
    expect(fmtEUR(NaN)).toBe("—")
  })

  it("UNIT-FMT-004 — whole number defaults to cents (2 decimals)", () => {
    expect(fmtEUR(1234)).toBe("€1.234,00")
  })

  it("UNIT-FMT-005 — explicit decimals option overrides default", () => {
    expect(fmtEUR(1234.567, { decimals: 2 })).toBe("€1.234,57")
  })

  it("UNIT-FMT-005b — explicit decimals: 0 strips cents", () => {
    expect(fmtEUR(1234, { decimals: 0 })).toBe("€1.234")
  })

  it("UNIT-FMT-006 — compact below 10 000 — no shortening, no cents", () => {
    expect(fmtEUR(9999, { compact: true })).toBe("€9.999")
  })

  it("UNIT-FMT-007 — compact exactly at 10 000 — k suffix", () => {
    expect(fmtEUR(10000, { compact: true })).toBe("€10k")
  })

  it("UNIT-FMT-008 — compact rounds to nearest thousand", () => {
    expect(fmtEUR(12500, { compact: true })).toBe("€13k")
  })

  it("UNIT-FMT-009 — compact at 1 000 000 — M suffix", () => {
    expect(fmtEUR(1000000, { compact: true })).toBe("€1,0M")
  })

  it("UNIT-FMT-010 — compact with M for 1.5 M", () => {
    expect(fmtEUR(1500000, { compact: true })).toBe("€1,5M")
  })

  it("UNIT-FMT-011 — sign option adds + prefix for positive (with cents)", () => {
    expect(fmtEUR(500, { sign: true })).toBe("+€500,00")
  })

  it("UNIT-FMT-012 — sign option does NOT add + for zero", () => {
    expect(fmtEUR(0, { sign: true })).toBe("€0,00")
  })

  it("UNIT-FMT-013 — negative value has no + prefix (with cents)", () => {
    expect(fmtEUR(-1500, { sign: true })).toBe("€-1.500,00")
  })

  it("UNIT-FMT-014 — negative compact uses k suffix", () => {
    expect(fmtEUR(-15000, { compact: true })).toBe("€-15k")
  })

  it("UNIT-FMT-015 — zero defaults to cents", () => {
    expect(fmtEUR(0)).toBe("€0,00")
  })

  it("UNIT-FMT-015b — fractional value rounds to cents", () => {
    expect(fmtEUR(1234.567)).toBe("€1.234,57")
  })
})

// ---------------------------------------------------------------------------
// fmtPct
// ---------------------------------------------------------------------------

describe("fmtPct", () => {
  it("UNIT-FMT-016 — null returns em-dash", () => {
    expect(fmtPct(null)).toBe("—")
  })

  it("UNIT-FMT-017 — NaN returns em-dash", () => {
    expect(fmtPct(NaN)).toBe("—")
  })

  it("UNIT-FMT-018 — positive value with default 1 decimal", () => {
    expect(fmtPct(5)).toBe("5,0%")
  })

  it("UNIT-FMT-019 — negative value", () => {
    expect(fmtPct(-3.5)).toBe("-3,5%")
  })

  it("UNIT-FMT-020 — sign option adds + for positive", () => {
    expect(fmtPct(12.3, 1, true)).toBe("+12,3%")
  })

  it("UNIT-FMT-021 — sign option does not add + for zero", () => {
    expect(fmtPct(0, 1, true)).toBe("0,0%")
  })

  it("UNIT-FMT-022 — custom decimals=0", () => {
    expect(fmtPct(25, 0)).toBe("25%")
  })
})

// ---------------------------------------------------------------------------
// fmtNum
// ---------------------------------------------------------------------------

describe("fmtNum", () => {
  it("UNIT-FMT-023 — null returns em-dash", () => {
    expect(fmtNum(null)).toBe("—")
  })

  it("UNIT-FMT-024 — integer with default 0 decimals", () => {
    expect(fmtNum(1234567)).toBe("1.234.567")
  })

  it("UNIT-FMT-025 — decimals option", () => {
    expect(fmtNum(3.14159, 2)).toBe("3,14")
  })

  it("UNIT-FMT-026 — NaN returns em-dash", () => {
    expect(fmtNum(NaN)).toBe("—")
  })
})

// ---------------------------------------------------------------------------
// Locale override
// ---------------------------------------------------------------------------

describe("locale override", () => {
  it("UNIT-FMT-027 — fmtEUR honors a per-call locale argument", () => {
    // Suite default is de-DE; per-call override must take precedence.
    expect(fmtEUR(1234.5, {}, "en-US")).toBe("€1,234.50")
  })

  it("UNIT-FMT-028 — fmtNum honors a per-call locale argument", () => {
    expect(fmtNum(1234567, 0, "en-US")).toBe("1,234,567")
  })

  it("UNIT-FMT-029 — fmtPct honors a per-call locale argument", () => {
    expect(fmtPct(3.5, 1, false, "en-US")).toBe("3.5%")
  })
})
