import { describe, it, expect } from "vitest"
import { labelFor } from "@/lib/types"

describe("labelFor", () => {
  it("UNIT-TYPES-001 — January", () => {
    expect(labelFor(2024, 1)).toBe("Jan 24")
  })

  it("UNIT-TYPES-002 — December", () => {
    expect(labelFor(2024, 12)).toBe("Dec 24")
  })

  it("UNIT-TYPES-003 — mid-year month", () => {
    expect(labelFor(2024, 6)).toBe("Jun 24")
  })

  it("UNIT-TYPES-004 — year suffix is last 2 digits (slice -2) — year 2000 produces 00", () => {
    expect(labelFor(2000, 6)).toBe("Jun 00")
  })

  it("UNIT-TYPES-005 — 1999 produces 2-digit year 99", () => {
    expect(labelFor(1999, 1)).toBe("Jan 99")
  })

  it("UNIT-TYPES-006 — 2100 produces year 00 (century boundary)", () => {
    expect(labelFor(2100, 3)).toBe("Mar 00")
  })

  it("UNIT-TYPES-007 — all 12 month abbreviations are correct", () => {
    const labels = Array.from({ length: 12 }, (_, i) => labelFor(2025, i + 1))
    expect(labels).toEqual([
      "Jan 25",
      "Feb 25",
      "Mar 25",
      "Apr 25",
      "May 25",
      "Jun 25",
      "Jul 25",
      "Aug 25",
      "Sep 25",
      "Oct 25",
      "Nov 25",
      "Dec 25",
    ])
  })
})
