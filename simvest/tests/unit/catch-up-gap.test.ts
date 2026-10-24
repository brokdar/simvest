import { describe, expect, it } from "vitest"
import { buildGapBatch, gapGroups, missingMonths } from "@/lib/catch-up"
import type { EntryDTO, PortfolioDTO } from "@/lib/types"

function entry(year: number, month: number, value: number | null): EntryDTO {
  return {
    id: year * 100 + month,
    year,
    month,
    day: 28,
    label: "",
    invested: 0,
    value,
    note: "",
  }
}

function portfolio(
  id: number,
  entries: EntryDTO[],
  targetMonthlyContribution = 0
): PortfolioDTO {
  return {
    id,
    name: `P${id}`,
    color: "#000",
    targetMonthlyContribution,
    contributionSet: true,
    startingValue: 0,
    startingDate: null,
    entries,
  }
}

const ym = (year: number, month: number) => ({ year, month })

describe("UNIT-LO-B-001 missingMonths", () => {
  it("is empty when the account is up to date", () => {
    const p = portfolio(1, [entry(2026, 9, 100)])
    expect(missingMonths(p, "2026-10-24", "last")).toEqual([])
  })

  it("spans a year boundary, oldest first", () => {
    const p = portfolio(1, [entry(2025, 11, 100)])
    expect(missingMonths(p, "2026-02-28", "last")).toEqual([
      ym(2025, 12),
      ym(2026, 1),
      ym(2026, 2),
    ])
  })

  it("has nothing to catch up from without a valued entry", () => {
    expect(missingMonths(portfolio(1, []), "2026-10-24", "last")).toEqual([])
    const unvalued = portfolio(1, [entry(2026, 1, null)])
    expect(missingMonths(unvalued, "2026-10-24", "last")).toEqual([])
  })

  it("offers the current month only once its entry day has come", () => {
    const p = portfolio(1, [entry(2026, 8, 100)])
    // "last" in October is the 31st — not due on the 24th.
    expect(missingMonths(p, "2026-10-24", "last")).toEqual([ym(2026, 9)])
    expect(missingMonths(p, "2026-10-31", "last")).toEqual([
      ym(2026, 9),
      ym(2026, 10),
    ])
    // A fixed day 15 is already due on the 24th.
    expect(missingMonths(p, "2026-10-24", "15")).toEqual([
      ym(2026, 9),
      ym(2026, 10),
    ])
    expect(missingMonths(p, "2026-10-14", "15")).toEqual([ym(2026, 9)])
  })

  it("never offers future months", () => {
    const p = portfolio(1, [entry(2026, 12, 100)])
    expect(missingMonths(p, "2026-10-31", "last")).toEqual([])
  })
})

describe("UNIT-LO-B-002 gap form batch", () => {
  const lag = portfolio(1, [entry(2026, 6, 100)], 250)
  const fine = portfolio(2, [entry(2026, 9, 100)])
  const groups = gapGroups([fine, lag], "2026-10-24", "last")

  it("groups only accounts two or more months behind", () => {
    expect(groups).toHaveLength(1)
    expect(groups[0].rows.map((r) => r.month)).toEqual([
      ym(2026, 7),
      ym(2026, 8),
      ym(2026, 9),
    ])
    expect(groups[0].rows[0].day).toBe(31)
  })

  it("is null until every month has a value, then writes them all", () => {
    expect(buildGapBatch(groups, {})).toBeNull()
    const inputs = {
      "1-2026-7": { value: 110 },
      "1-2026-8": { value: 120, invested: 0 },
    }
    expect(buildGapBatch(groups, inputs)).toBeNull()
    const batch = buildGapBatch(groups, {
      ...inputs,
      "1-2026-9": { value: 130 },
    })
    expect(batch).toEqual([
      expect.objectContaining({ month: 7, value: 110, invested: 250, day: 31 }),
      expect.objectContaining({ month: 8, value: 120, invested: 0, day: 31 }),
      expect.objectContaining({ month: 9, value: 130, invested: 250, day: 30 }),
    ])
  })

  it("UNIT-LO-B-003 keeps the note of an existing value-less entry", () => {
    const withNote = { ...entry(2026, 8, null), note: "bonus paid" }
    const p = portfolio(1, [entry(2026, 6, 100), withNote])
    const g = gapGroups([p], "2026-10-24", "last")
    const batch = buildGapBatch(g, {
      "1-2026-7": { value: 110 },
      "1-2026-8": { value: 120 },
      "1-2026-9": { value: 130 },
    })
    expect(batch?.map((b) => b.note)).toEqual(["", "bonus paid", ""])
  })
})
