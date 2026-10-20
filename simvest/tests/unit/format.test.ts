import { afterAll, beforeAll, describe, it, expect } from "vitest"
import {
  fmtAxisEUR,
  fmtCompactEUR,
  fmtCount,
  fmtEUR,
  fmtNum,
  fmtPct,
  fmtPctCapped,
  plural,
  setActiveLocale,
  snapToStep,
} from "@/lib/format"

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

// ---------------------------------------------------------------------------
// P1 — one separator, one abbreviation rule, plural, slider steps
// ---------------------------------------------------------------------------

describe("decimal separator follows the locale everywhere (F1)", () => {
  it("UNIT-FMT-030 — a 2-decimal percent uses the locale separator", () => {
    // The Planning "Assumed yield" tile rendered `${v.toFixed(2)}%` → "4.91%"
    // beside "€324,06". fmtPct is the replacement; toFixed ignores locale.
    expect(fmtPct(4.9123, 2)).toBe("4,91%")
    expect((4.9123).toFixed(2) + "%").toBe("4.91%") // the old, wrong path
    expect(fmtPct(4.9123, 2, false, "en-US")).toBe("4.91%")
  })

  it("UNIT-FMT-031 — money, percent and plain numbers agree on the separator", () => {
    const dec = (s: string) => s.replace(/[^.,]/g, "").slice(-1)
    expect(dec(fmtEUR(324.06))).toBe(",")
    expect(dec(fmtPct(4.9, 1))).toBe(",")
    expect(dec(fmtNum(6.7, 1))).toBe(",")
    expect(dec(fmtEUR(324.06, {}, "en-US"))).toBe(".")
    expect(dec(fmtPct(4.9, 1, false, "en-US"))).toBe(".")
  })
})

describe("fmtCompactEUR — the one abbreviation rule", () => {
  it("UNIT-FMT-040 — below €10.000: full amount, no cents", () => {
    expect(fmtCompactEUR(9999)).toBe("€9.999")
    expect(fmtCompactEUR(624.32)).toBe("€624")
  })

  it("UNIT-FMT-041 — €10.000 to <€1M: whole thousands with k", () => {
    expect(fmtCompactEUR(10000)).toBe("€10k")
    expect(fmtCompactEUR(152379.81)).toBe("€152k")
  })

  it("UNIT-FMT-042 — from €1M: one-decimal millions with M", () => {
    expect(fmtCompactEUR(1_000_000)).toBe("€1,0M")
    expect(fmtCompactEUR(1_250_000, {}, "en-US")).toBe("€1.3M")
  })

  it("UNIT-FMT-043 — sign and null handling match fmtEUR", () => {
    expect(fmtCompactEUR(14000, { sign: true })).toBe("+€14k")
    expect(fmtCompactEUR(null)).toBe("—")
  })

  it("UNIT-FMT-044 — fmtEUR({ compact }) is the same rule", () => {
    for (const v of [0, 950, 9999, 10000, 87654, 2_400_000, -15000]) {
      expect(fmtEUR(v, { compact: true })).toBe(fmtCompactEUR(v))
    }
  })
})

describe("fmtAxisEUR — an axis is all-abbreviated or all-full (F2)", () => {
  const unitOf = (label: string) =>
    label === "€0"
      ? "zero"
      : /M$/.test(label)
        ? "M"
        : /k$/.test(label)
          ? "k"
          : "full"

  it("UNIT-FMT-050 — ticks straddling €10k all use k", () => {
    const ticks = [0, 4000, 8000, 12000, 16000]
    const fmt = fmtAxisEUR(ticks, { sign: true })
    expect(ticks.map(fmt)).toEqual(["€0", "+€4k", "+€8k", "+€12k", "+€16k"])
    const units = new Set(ticks.slice(1).map((t) => unitOf(fmt(t))))
    expect(units.size).toBe(1)
  })

  it("UNIT-FMT-051 — the old per-tick compact formatter mixed units on that axis", () => {
    const ticks = [0, 4000, 8000, 12000, 16000]
    const old = ticks.map((t) => fmtEUR(t, { compact: true, sign: true }))
    expect(old).toEqual(["€0", "+€4.000", "+€8.000", "+€12k", "+€16k"])
    expect(new Set(old.slice(1).map(unitOf)).size).toBe(2)
  })

  it("UNIT-FMT-052 — small axes stay full euros", () => {
    const fmt = fmtAxisEUR([0, 100, 200, 300])
    expect([0, 100, 200, 300].map(fmt)).toEqual(["€0", "€100", "€200", "€300"])
  })

  it("UNIT-FMT-053 — fractional small ticks use cents, never a lone decimal", () => {
    const fmt = fmtAxisEUR([0, 2.5, 5, 7.5])
    expect(fmt(2.5)).toBe("€2,50")
    expect(fmt(5)).toBe("€5,00")
  })

  it("UNIT-FMT-054 — thousands keep a decimal only when a tick needs it", () => {
    expect(fmtAxisEUR([0, 20000, 40000])(20000)).toBe("€20k")
    const half = fmtAxisEUR([0, 12500, 25000])
    expect(half(12500)).toBe("€12,5k")
    expect(half(25000)).toBe("€25,0k")
  })

  it("UNIT-FMT-055 — millions axis: every non-zero tick in M", () => {
    const ticks = [0, 500_000, 1_000_000, 1_500_000, 2_000_000]
    const fmt = fmtAxisEUR(ticks)
    expect(ticks.map(fmt)).toEqual(["€0", "€0,5M", "€1,0M", "€1,5M", "€2,0M"])
  })

  it("UNIT-FMT-056 — negative ticks follow fmtEUR's sign placement", () => {
    const fmt = fmtAxisEUR([-20000, 0, 20000], { sign: true })
    expect(fmt(-20000)).toBe("€-20k")
    expect(fmt(20000)).toBe("+€20k")
  })

  it("UNIT-FMT-057 — honours a per-call locale", () => {
    expect(fmtAxisEUR([0, 1_500_000], {}, "en-US")(1_500_000)).toBe("€1.5M")
  })
})

describe("plural / fmtCount (F4)", () => {
  it("UNIT-FMT-060 — singular only for exactly one", () => {
    expect(plural(1, "record", "records")).toBe("record")
    expect(plural(0, "record", "records")).toBe("records")
    expect(plural(2, "entry", "entries")).toBe("entries")
  })

  it("UNIT-FMT-061 — fmtCount renders the count with the right noun", () => {
    expect(fmtCount(1, "record", "records")).toBe("1 record")
    expect(fmtCount(75, "record", "records")).toBe("75 records")
    expect(fmtCount(1264, "event", "events")).toBe("1.264 events")
    // The bug this replaces: "1 records", "all 1 entries".
    expect(fmtCount(1, "entry", "entries")).not.toBe("1 entries")
  })
})

describe("snapToStep (F5)", () => {
  it("UNIT-FMT-070 — strips float32 noise from a 0.1-step slider", () => {
    expect(snapToStep(4.900000095367432, 0.1)).toBe(4.9)
    expect(String(snapToStep(4.900000095367432, 0.1))).toBe("4.9")
  })

  it("UNIT-FMT-071 — snaps to the grid anchored at the slider min", () => {
    expect(snapToStep(2.94, 0.1, 2.5)).toBe(2.9)
    expect(snapToStep(0.1 + 0.2, 0.1)).toBe(0.3)
    expect(snapToStep(12_340, 500, 0)).toBe(12_500)
  })

  it("UNIT-FMT-072 — integer steps stay integers", () => {
    expect(snapToStep(2031.6, 1)).toBe(2032)
  })

  it("UNIT-FMT-073 — passes non-finite values and bad steps through", () => {
    expect(Number.isNaN(snapToStep(NaN, 0.1))).toBe(true)
    expect(snapToStep(4.91, 0)).toBe(4.91)
  })
})

describe("fmtPctCapped (N6)", () => {
  it("UNIT-FMT-CAP-001 — ordinary values format like fmtPct", () => {
    expect(fmtPctCapped(11.234, 2, 999, "de-DE")).toBe("11,23%")
  })
  it("UNIT-FMT-CAP-002 — absurd magnitudes are capped, never 31 digits", () => {
    expect(fmtPctCapped(1.2e33, 2, 999, "de-DE")).toBe("> 999%")
    expect(fmtPctCapped(-5000, 2, 999, "en-US")).toBe("< -999%")
  })
  it("UNIT-FMT-CAP-003 — null renders a dash", () => {
    expect(fmtPctCapped(null)).toBe("—")
  })
})
