import { describe, it, expect } from "vitest"
import {
  daysInMonth,
  resolveEntryDay,
  isValidEntryDayPref,
  toISODate,
  fromISODate,
  fmtDate,
  fmtMonth,
  fmtMonthKey,
  fmtMonthLong,
  fmtYearShort,
  MONTH_SHORT,
  addCalendarMonths,
  entryTimestamp,
} from "@/lib/dates"

describe("daysInMonth", () => {
  it("returns 31 for January, March, May, July, August, October, December", () => {
    for (const m of [1, 3, 5, 7, 8, 10, 12]) {
      expect(daysInMonth(2025, m)).toBe(31)
    }
  })

  it("returns 30 for April, June, September, November", () => {
    for (const m of [4, 6, 9, 11]) {
      expect(daysInMonth(2025, m)).toBe(30)
    }
  })

  it("returns 28 for February in a non-leap year", () => {
    expect(daysInMonth(2023, 2)).toBe(28)
  })

  it("returns 29 for February in a leap year (div by 4)", () => {
    expect(daysInMonth(2024, 2)).toBe(29)
  })

  it("returns 28 for February in a century non-leap year (div by 100, not 400)", () => {
    expect(daysInMonth(2100, 2)).toBe(28)
  })

  it("returns 29 for February in a quadricentennial year (div by 400)", () => {
    expect(daysInMonth(2000, 2)).toBe(29)
  })
})

describe("resolveEntryDay", () => {
  it("returns 1 for 'first'", () => {
    expect(resolveEntryDay("first", 2025, 6)).toBe(1)
    expect(resolveEntryDay("first", 2024, 2)).toBe(1)
  })

  it("returns the actual last day for 'last' across calendar months", () => {
    expect(resolveEntryDay("last", 2025, 1)).toBe(31)
    expect(resolveEntryDay("last", 2025, 2)).toBe(28)
    expect(resolveEntryDay("last", 2024, 2)).toBe(29)
    expect(resolveEntryDay("last", 2025, 4)).toBe(30)
    expect(resolveEntryDay("last", 2025, 12)).toBe(31)
  })

  it("returns the numeric day when it fits in the month", () => {
    expect(resolveEntryDay("15", 2025, 4)).toBe(15)
    expect(resolveEntryDay("1", 2025, 4)).toBe(1)
    expect(resolveEntryDay("28", 2024, 2)).toBe(28)
  })

  it("clamps a custom day to the last valid day when out of range for that month", () => {
    expect(resolveEntryDay("31", 2025, 4)).toBe(30)
    expect(resolveEntryDay("31", 2023, 2)).toBe(28)
    expect(resolveEntryDay("31", 2024, 2)).toBe(29)
    expect(resolveEntryDay("30", 2025, 2)).toBe(28)
  })

  it("falls back to last day for an unparseable pref", () => {
    expect(resolveEntryDay("middle", 2025, 6)).toBe(30)
  })
})

describe("isValidEntryDayPref", () => {
  it("accepts 'first' and 'last'", () => {
    expect(isValidEntryDayPref("first")).toBe(true)
    expect(isValidEntryDayPref("last")).toBe(true)
  })

  it("accepts integer strings 1..31", () => {
    expect(isValidEntryDayPref("1")).toBe(true)
    expect(isValidEntryDayPref("15")).toBe(true)
    expect(isValidEntryDayPref("31")).toBe(true)
  })

  it("rejects out-of-range numeric strings", () => {
    expect(isValidEntryDayPref("0")).toBe(false)
    expect(isValidEntryDayPref("32")).toBe(false)
    expect(isValidEntryDayPref("-1")).toBe(false)
  })

  it("rejects non-integer numeric strings", () => {
    expect(isValidEntryDayPref("15.5")).toBe(false)
  })

  it("rejects unknown tokens", () => {
    expect(isValidEntryDayPref("middle")).toBe(false)
    expect(isValidEntryDayPref("")).toBe(false)
  })

  it("rejects strings with leading zeros that don't round-trip", () => {
    expect(isValidEntryDayPref("01")).toBe(false)
  })
})

describe("toISODate / fromISODate", () => {
  it("toISODate zero-pads month and day", () => {
    expect(toISODate(2025, 4, 5)).toBe("2025-04-05")
    expect(toISODate(2025, 12, 31)).toBe("2025-12-31")
  })

  it("fromISODate parses a well-formed ISO string", () => {
    expect(fromISODate("2025-04-05")).toEqual({ year: 2025, month: 4, day: 5 })
  })

  it("round-trips through both functions", () => {
    const cases: Array<[number, number, number]> = [
      [2024, 1, 1],
      [2024, 2, 29],
      [2025, 12, 31],
      [2026, 5, 19],
    ]
    for (const [y, m, d] of cases) {
      expect(fromISODate(toISODate(y, m, d))).toEqual({
        year: y,
        month: m,
        day: d,
      })
    }
  })
})

describe("addCalendarMonths", () => {
  it("advances within the same year", () => {
    expect(addCalendarMonths(2025, 3, 15, 2)).toEqual({
      year: 2025,
      month: 5,
      day: 15,
    })
  })

  it("rolls over to the next year", () => {
    expect(addCalendarMonths(2025, 11, 10, 3)).toEqual({
      year: 2026,
      month: 2,
      day: 10,
    })
  })

  it("clamps day when target month is shorter", () => {
    expect(addCalendarMonths(2025, 1, 31, 1)).toEqual({
      year: 2025,
      month: 2,
      day: 28,
    })
    expect(addCalendarMonths(2024, 1, 31, 1)).toEqual({
      year: 2024,
      month: 2,
      day: 29,
    })
    expect(addCalendarMonths(2025, 3, 31, 1)).toEqual({
      year: 2025,
      month: 4,
      day: 30,
    })
  })

  it("supports negative offsets (looking back)", () => {
    expect(addCalendarMonths(2025, 3, 15, -4)).toEqual({
      year: 2024,
      month: 11,
      day: 15,
    })
  })

  it("preserves day for many-month strides", () => {
    expect(addCalendarMonths(2025, 1, 1, 12)).toEqual({
      year: 2026,
      month: 1,
      day: 1,
    })
  })
})

describe("entryTimestamp", () => {
  it("returns a strictly increasing value for chronologically later dates", () => {
    const a = entryTimestamp(2025, 3, 15)
    const b = entryTimestamp(2025, 3, 16)
    const c = entryTimestamp(2025, 4, 1)
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
  })
})

// ---------------------------------------------------------------------------
// App-wide date formats (P1 · C3 / F3). Exactly two visible formats:
//   fmtMonth → "Apr ’26"   fmtDate → "30 Apr 2026"
// The apostrophe is U+2019; month names never come from Intl (en-GB's
// toLocaleDateString renders September as "Sept", which was finding F3).
// ---------------------------------------------------------------------------

const RSQUO = "\u2019"

describe("fmtMonth", () => {
  it("UNIT-DATES-FMT-001 — month + curly-apostrophe two-digit year", () => {
    expect(fmtMonth(2026, 4)).toBe(`Apr ${RSQUO}26`)
    expect(fmtMonth(2026, 4)).toBe("Apr ’26")
  })

  it("UNIT-DATES-FMT-002 — uses U+2019, not an ASCII apostrophe", () => {
    const s = fmtMonth(2025, 9)
    expect(s).toContain(RSQUO)
    expect(s).not.toContain("'")
  })

  it("UNIT-DATES-FMT-003 — September is Sep (never Sept), every month three letters", () => {
    expect(fmtMonth(2025, 9)).toBe("Sep ’25")
    for (let m = 1; m <= 12; m++) {
      const [mon] = fmtMonth(2025, m).split(" ")
      expect(mon).toMatch(/^[A-Z][a-z]{2}$/)
    }
  })

  it("UNIT-DATES-FMT-004 — century boundaries keep two digits", () => {
    expect(fmtMonth(2000, 1)).toBe("Jan ’00")
    expect(fmtMonth(2100, 12)).toBe("Dec ’00")
  })

  it("UNIT-DATES-FMT-005 — fmtYearShort matches fmtMonth's year part", () => {
    expect(fmtYearShort(2032)).toBe("’32")
    expect(fmtMonth(2032, 5).endsWith(fmtYearShort(2032))).toBe(true)
  })

  it("UNIT-DATES-FMT-006 — fmtMonthKey parses YYYY-MM and leaves junk alone", () => {
    expect(fmtMonthKey("2026-04")).toBe("Apr ’26")
    expect(fmtMonthKey("2026-04-30")).toBe("Apr ’26")
    expect(fmtMonthKey("not a date")).toBe("not a date")
    expect(fmtMonthKey("2026-13")).toBe("2026-13")
  })
})

describe("fmtDate", () => {
  it("UNIT-DATES-FMT-010 — ISO string → day, three-letter month, full year", () => {
    expect(fmtDate("2026-04-30")).toBe("30 Apr 2026")
  })

  it("UNIT-DATES-FMT-011 — (year, month, day) overload matches the ISO form", () => {
    expect(fmtDate(2025, 4, 30)).toBe("30 Apr 2025")
    expect(fmtDate(2024, 2, 29)).toBe("29 Feb 2024")
    expect(fmtDate(2025, 12, 1)).toBe("1 Dec 2025")
    expect(fmtDate(2025, 4, 30)).toBe(fmtDate("2025-04-30"))
  })

  it("UNIT-DATES-FMT-012 — 30 Sep 2025, never 30 Sept 2025", () => {
    expect(fmtDate(2025, 9, 30)).toBe("30 Sep 2025")
    for (let m = 1; m <= 12; m++) {
      expect(fmtDate(2025, m, 1)).not.toMatch(/Sept/)
      expect(fmtDate(2025, m, 1)).toMatch(/^1 [A-Z][a-z]{2} 2025$/)
    }
  })

  it("UNIT-DATES-FMT-013 — the old Intl en-GB path is what produced 'Sept'", () => {
    // Documents why fmtDate doesn't use toLocaleDateString: on current ICU,
    // en-GB short month for September is "Sept". If this runtime's ICU ever
    // stops doing that, the assertion below is skipped rather than failing.
    const intl = new Date(2025, 8, 30).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    })
    if (intl.includes("Sept")) expect(fmtDate(2025, 9, 30)).not.toBe(intl)
  })
})

describe("fmtMonthLong", () => {
  it("UNIT-DATES-FMT-020 — spelled-out month for accessible names", () => {
    expect(fmtMonthLong(2026, 4)).toBe("April 2026")
    expect(fmtMonthLong(2025, 9)).toBe("September 2025")
  })
})

describe("MONTH_SHORT", () => {
  it("UNIT-DATES-FMT-030 — twelve three-letter English abbreviations", () => {
    expect(MONTH_SHORT).toEqual([
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ])
  })
})
