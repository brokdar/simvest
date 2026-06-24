import { describe, it, expect } from "vitest"
import {
  emptyDraft,
  fromEntry,
  isDirty,
  nextMonthAfter,
  setCellValue,
  touchCell,
  validate,
  type DraftRow,
} from "@/components/entries-grid/draft-row"
import type { EntryDTO, PortfolioDTO } from "@/lib/types"
import { labelFor } from "@/lib/types"

function makeEntry(
  year: number,
  month: number,
  overrides: Partial<EntryDTO> = {}
): EntryDTO {
  return {
    id: year * 100 + month,
    year,
    month,
    day: 15,
    label: labelFor(year, month),
    invested: 500,
    value: 1000,
    note: "",
    ...overrides,
  }
}

function makePortfolio(entries: EntryDTO[] = []): PortfolioDTO {
  return {
    id: 1,
    name: "Growth",
    color: "#1E40AF",
    targetMonthlyContribution: 500,
    startingValue: 0,
    startingDate: null,
    entries,
  }
}

describe("fromEntry", () => {
  it("UNIT-DRAFT-001 — wraps an EntryDTO with key, empty touched, no error", () => {
    const e = makeEntry(2024, 1, {
      id: 42,
      invested: 500,
      value: 1000,
      note: "n",
    })
    const d = fromEntry(e)
    expect(d.key).toBe("entry-42")
    expect(d.original).toBe(e)
    expect(d.year).toBe(2024)
    expect(d.month).toBe(1)
    expect(d.invested).toBe(500)
    expect(d.value).toBe(1000)
    expect(d.note).toBe("n")
    expect(d.toDelete).toBe(false)
    expect(d.touched.size).toBe(0)
    expect(d.error).toBeNull()
  })

  it("UNIT-DRAFT-002 — preserves null value from the source", () => {
    const e = makeEntry(2024, 1, { value: null })
    const d = fromEntry(e)
    expect(d.value).toBeNull()
  })
})

describe("emptyDraft", () => {
  it("UNIT-DRAFT-010 — neutral defaults", () => {
    const d = emptyDraft("draft-1", { year: 2026, month: 5, day: 31 })
    expect(d.key).toBe("draft-1")
    expect(d.original).toBeNull()
    expect(d.invested).toBe(0)
    expect(d.value).toBeNull()
    expect(d.note).toBe("")
    expect(d.touched.size).toBe(0)
  })

  it("UNIT-DRAFT-011 — applies overrides", () => {
    const d = emptyDraft(
      "draft-2",
      { year: 2026, month: 5, day: 31 },
      { invested: 250, value: 7777, note: "seed" }
    )
    expect(d.invested).toBe(250)
    expect(d.value).toBe(7777)
    expect(d.note).toBe("seed")
  })
})

describe("isDirty", () => {
  it("UNIT-DRAFT-020 — clean existing draft is not dirty", () => {
    const d = fromEntry(makeEntry(2024, 1))
    expect(isDirty(d)).toBe(false)
  })

  it("UNIT-DRAFT-021 — touched existing draft is dirty", () => {
    const d = touchCell(fromEntry(makeEntry(2024, 1)), "value")
    expect(isDirty(d)).toBe(true)
  })

  it("UNIT-DRAFT-022 — new draft (original=null) is always dirty", () => {
    const d = emptyDraft("draft-1", { year: 2026, month: 5, day: 31 })
    expect(isDirty(d)).toBe(true)
  })

  it("UNIT-DRAFT-023 — toDelete makes it dirty", () => {
    const d: DraftRow = { ...fromEntry(makeEntry(2024, 1)), toDelete: true }
    expect(isDirty(d)).toBe(true)
  })
})

describe("validate", () => {
  it("UNIT-DRAFT-030 — accepts a normal existing draft", () => {
    expect(validate(fromEntry(makeEntry(2024, 1)))).toBeNull()
  })

  it("UNIT-DRAFT-031 — rejects year < 1970", () => {
    const d = { ...fromEntry(makeEntry(2024, 1)), year: 1969 }
    expect(validate(d)).toMatch(/year/i)
  })

  it("UNIT-DRAFT-032 — rejects month > 12", () => {
    const d = { ...fromEntry(makeEntry(2024, 1)), month: 13 }
    expect(validate(d)).toMatch(/month/i)
  })

  it("UNIT-DRAFT-033 — rejects month < 1", () => {
    const d = { ...fromEntry(makeEntry(2024, 1)), month: 0 }
    expect(validate(d)).toMatch(/month/i)
  })

  it("UNIT-DRAFT-034 — rejects day > daysInMonth", () => {
    const d = { ...fromEntry(makeEntry(2024, 2)), day: 30 } // Feb has 29 in 2024
    expect(validate(d)).toMatch(/day/i)
  })

  it("UNIT-DRAFT-035 — accepts Feb 29 in a leap year", () => {
    const d = { ...fromEntry(makeEntry(2024, 2)), day: 29 }
    expect(validate(d)).toBeNull()
  })

  it("UNIT-DRAFT-036 — rejects day = 0", () => {
    const d = { ...fromEntry(makeEntry(2024, 1)), day: 0 }
    expect(validate(d)).toMatch(/day/i)
  })

  it("UNIT-DRAFT-037 — new draft conflicting with existingByMonth is rejected", () => {
    const existing = new Map<string, EntryDTO>([["2024-3", makeEntry(2024, 3)]])
    const d = emptyDraft("draft-1", { year: 2024, month: 3, day: 15 })
    expect(validate(d, { existingByMonth: existing })).toMatch(
      /already exists/i
    )
  })

  it("UNIT-DRAFT-038 — existing draft with same (year, month) as in existingByMonth is fine", () => {
    const e = makeEntry(2024, 3)
    const existing = new Map<string, EntryDTO>([["2024-3", e]])
    expect(validate(fromEntry(e), { existingByMonth: existing })).toBeNull()
  })
})

describe("nextMonthAfter", () => {
  it("UNIT-DRAFT-040 — empty portfolio returns the current month", () => {
    const now = new Date()
    const next = nextMonthAfter(makePortfolio(), "last")
    expect(next.year).toBe(now.getFullYear())
    expect(next.month).toBe(now.getMonth() + 1)
  })

  it("UNIT-DRAFT-041 — increments month after the last entry", () => {
    const next = nextMonthAfter(makePortfolio([makeEntry(2024, 3)]), "last")
    expect(next).toEqual({
      year: 2024,
      month: 4,
      day: 30, // April has 30 days
    })
  })

  it("UNIT-DRAFT-042 — wraps from December to January of the next year", () => {
    const next = nextMonthAfter(makePortfolio([makeEntry(2024, 12)]), "last")
    expect(next.year).toBe(2025)
    expect(next.month).toBe(1)
  })

  it("UNIT-DRAFT-043 — honors defaultEntryDay='first'", () => {
    const next = nextMonthAfter(makePortfolio([makeEntry(2024, 3)]), "first")
    expect(next.day).toBe(1)
  })
})

describe("setCellValue", () => {
  it("UNIT-DRAFT-070 — touches invested when changing from original", () => {
    const d = fromEntry(makeEntry(2024, 1, { invested: 500 }))
    const next = setCellValue(d, "invested", 600)
    expect(next.invested).toBe(600)
    expect(next.touched.has("invested")).toBe(true)
  })

  it("UNIT-DRAFT-071 — untouches invested when value equals original", () => {
    const d = touchCell(
      setCellValue(
        fromEntry(makeEntry(2024, 1, { invested: 500 })),
        "invested",
        600
      ),
      "invested"
    )
    const next = setCellValue(d, "invested", 500)
    expect(next.invested).toBe(500)
    expect(next.touched.has("invested")).toBe(false)
  })

  it("UNIT-DRAFT-072 — value can be set to null", () => {
    const d = fromEntry(makeEntry(2024, 1, { value: 1000 }))
    const next = setCellValue(d, "value", null)
    expect(next.value).toBeNull()
    expect(next.touched.has("value")).toBe(true)
  })

  it("UNIT-DRAFT-073 — new draft (no original) always marks touched on change", () => {
    const d = emptyDraft("draft-1", { year: 2026, month: 5, day: 31 })
    const next = setCellValue(d, "value", 7777)
    expect(next.value).toBe(7777)
    expect(next.touched.has("value")).toBe(true)
  })
})
