import { describe, expect, it } from "vitest"
import { buildCatchUpBatch, catchUpRows, monthOf } from "@/lib/catch-up"
import {
  aggregatePortfoliosWithCoverage,
  latestMonthChange,
  rankByIncome,
  valueChange,
} from "@/lib/calc"
import {
  dueThisMonth,
  forecastPayouts,
  forecastSource,
  groupBySource,
} from "@/lib/payout-forecast"
import { validateEntryBatch } from "@/lib/validation/entry"
import type { EntryDTO, IncomeEventDTO, PortfolioDTO } from "@/lib/types"

let nextId = 1
function entry(
  year: number,
  month: number,
  invested: number,
  value: number | null,
  day = 28
): EntryDTO {
  return {
    id: nextId++,
    year,
    month,
    day,
    label: "",
    invested,
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
    startingValue: 0,
    startingDate: null,
    entries,
  }
}

function payout(
  paidDate: string,
  amount: number,
  o: Partial<IncomeEventDTO> = {}
): IncomeEventDTO {
  return {
    id: nextId++,
    portfolioId: 1,
    holdingId: 7,
    holdingName: "Welltower",
    holdingType: "stock",
    holdingIsin: null,
    paidDate,
    kind: "dividend",
    amount,
    tax: 0,
    note: "",
    sourceBroker: null,
    sourceTransactionId: null,
    ...o,
  }
}

// ── W2 catch-up ─────────────────────────────────────────────────────────

describe("catch-up rows (W2)", () => {
  const target = { year: 2026, month: 10 }
  const p1 = portfolio(1, [entry(2026, 4, 600, 152_379.81, 30)], 600)
  const p2 = portfolio(
    2,
    [entry(2026, 9, 100, 16_000), entry(2026, 10, 100, 16_455.31, 31)],
    100
  )

  it("UNIT-CATCHUP-001 — each account shows its last value and pre-fills the plan", () => {
    const rows = catchUpRows([p1, p2], target, "last")
    expect(rows[0].lastValued?.value).toBe(152_379.81)
    expect(rows[0].existing).toBeNull()
    expect(rows[0].defaultInvested).toBe(600)
    expect(rows[0].defaultValue).toBeNull()
    expect(rows[0].day).toBe(31) // last day of October
    // An account already logged this month starts from the saved figures.
    expect(rows[1].existing?.value).toBe(16_455.31)
    expect(rows[1].defaultValue).toBe(16_455.31)
  })

  it("UNIT-CATCHUP-002 — only accounts with a typed value are sent; untouched logged ones are skipped", () => {
    const rows = catchUpRows([p1, p2], target, "last")
    expect(buildCatchUpBatch(rows, {}, target)).toEqual([])
    const batch = buildCatchUpBatch(rows, { 1: { value: 155_000 } }, target)
    expect(batch).toEqual([
      {
        portfolioId: 1,
        year: 2026,
        month: 10,
        day: 31,
        invested: 600,
        value: 155_000,
        note: "",
      },
    ])
  })

  it("UNIT-CATCHUP-003 — a changed logged value is an update; a cleared value skips; cleared Added is €0", () => {
    const rows = catchUpRows([p1, p2], target, "last")
    const batch = buildCatchUpBatch(
      rows,
      { 1: { value: null }, 2: { value: 16_500, invested: null } },
      target
    )
    expect(batch).toHaveLength(1)
    expect(batch[0]).toMatchObject({
      portfolioId: 2,
      value: 16_500,
      invested: 0,
    })
  })

  it("UNIT-CATCHUP-004 — monthOf reads the month from an ISO date", () => {
    expect(monthOf("2026-10-20")).toEqual({ year: 2026, month: 10 })
  })
})

describe("validateEntryBatch (W2)", () => {
  const row = {
    portfolioId: 1,
    year: 2026,
    month: 10,
    day: 31,
    invested: 600,
    value: 1000,
    note: "",
  }
  it("UNIT-BATCH-001 — accepts one row per account", () => {
    const v = validateEntryBatch({ entries: [row, { ...row, portfolioId: 2 }] })
    expect(v.ok).toBe(true)
  })
  it("UNIT-BATCH-002 — rejects the whole batch and names the bad row", () => {
    const bad = validateEntryBatch({
      entries: [row, { ...row, portfolioId: 2, day: 32 }],
    })
    expect(bad).toMatchObject({ ok: false, index: 1 })
    expect(
      validateEntryBatch({ entries: [{ ...row, value: null }] })
    ).toMatchObject({
      ok: false,
      index: 0,
    })
    expect(validateEntryBatch({ entries: [{ ...row, value: -5 }] }).ok).toBe(
      false
    )
    expect(
      validateEntryBatch({ entries: [{ ...row, portfolioId: undefined }] }).ok
    ).toBe(false)
    expect(validateEntryBatch({ entries: [row, row] })).toMatchObject({
      ok: false,
      index: 1,
    })
    expect(validateEntryBatch({ entries: [] }).ok).toBe(false)
    expect(validateEntryBatch(null).ok).toBe(false)
  })
})

// ── W3 rank by income ───────────────────────────────────────────────────

describe("rankByIncome (W3)", () => {
  it("UNIT-RANK-001 — the top 12-month earner leads, whatever its account", () => {
    const ranked = rankByIncome([
      { name: "Welltower", trailing12: 490.1, total: 900 },
      { name: "Allianz", trailing12: 0, total: 300 },
      { name: "Mercedes-Benz", trailing12: 894.41, total: 1200 },
      { name: "Zeta", trailing12: 0, total: 300 },
    ])
    expect(ranked.map((r) => r.name)).toEqual([
      "Mercedes-Benz",
      "Welltower",
      "Allianz",
      "Zeta",
    ])
  })
})

// ── W5 forecast ─────────────────────────────────────────────────────────

describe("payout forecast (W5)", () => {
  const welltower = [
    payout("2025-08-22", 10),
    payout("2025-11-21", 10),
    payout("2026-02-20", 11),
    payout("2026-05-22", 12),
  ]

  it("UNIT-FORECAST-001 — quarterly: next is last paid + 3 months, at the last amount", () => {
    const f = forecastPayouts(welltower, "2026-06-01")[0]
    expect(f.cadence).toBe("quarterly")
    expect(f.next).toBe("2026-08-22")
    expect(f.lastAmount).toBe(12)
    expect(f.behind).toBe(false)
  })

  it("UNIT-FORECAST-002 — a missed date rolls forward and says it's behind", () => {
    const f = forecastPayouts(welltower, "2026-10-20")[0]
    expect(f.next).toBe("2026-11-22")
    expect(f.behind).toBe(true)
  })

  it("UNIT-FORECAST-003 — single and irregular sources get no prediction", () => {
    const single = forecastPayouts([payout("2026-03-01", 5)], "2026-06-01")[0]
    expect(single.cadence).toBe("single")
    expect(single.next).toBeNull()
    expect(single.reason).toMatch(/one payout/i)
    const irregular = forecastPayouts(
      [
        payout("2022-01-01", 5),
        payout("2023-12-01", 5),
        payout("2026-01-01", 5),
      ],
      "2026-06-01"
    )[0]
    expect(irregular.cadence).toBe("irregular")
    expect(irregular.next).toBeNull()
  })

  it("UNIT-FORECAST-004 — a source that went quiet while its account kept paying gets no prediction", () => {
    const quiet = [payout("2025-01-15", 5), payout("2025-04-15", 5)]
    const other = [
      payout("2026-05-01", 3, { holdingId: 8, holdingName: "Other" }),
    ]
    const all = forecastPayouts([...quiet, ...other], "2026-06-01")
    const f = all.find((x) => x.holdingId === 7)!
    expect(f.next).toBeNull()
    expect(f.reason).toMatch(/kept paying/)
    // …but the whole account lagging (not imported yet) keeps the schedule.
    const lagging = forecastSource(
      groupBySource(quiet).get("h:7")!.source,
      quiet,
      "2026-06-01",
      "net",
      "2025-04-15"
    )!
    expect(lagging.next).not.toBeNull()
  })

  it("UNIT-FORECAST-005 — interest groups per account; daily counts each remaining day this month", () => {
    const interest = Array.from({ length: 10 }, (_, i) =>
      payout(`2026-09-${String(21 + i).padStart(2, "0")}`, 2, {
        kind: "interest",
        holdingId: null,
        holdingName: null,
        portfolioId: 4,
      })
    )
    const forecasts = forecastPayouts([...interest, ...welltower], "2026-10-20")
    const daily = forecasts.find((f) => f.key === "i:4")!
    expect(daily.cadence).toBe("daily")
    expect(daily.next).toBe("2026-10-20")
    const due = dueThisMonth(forecasts, "2026-10-20")
    // 20..31 Oct = 12 daily payouts of €2; Welltower's next is in November.
    expect(due.count).toBe(12)
    expect(due.amount).toBe(24)
    expect(due.sources).toBe(1)
  })

  it("UNIT-FORECAST-006 — net/gross basis sets the estimate; unscheduled sources are counted apart", () => {
    const taxed = [
      payout("2026-01-10", 10, { tax: -2.64 }),
      payout("2026-04-10", 10, { tax: -2.64 }),
    ]
    expect(
      forecastPayouts(taxed, "2026-05-01", "net")[0].lastAmount
    ).toBeCloseTo(7.36)
    expect(forecastPayouts(taxed, "2026-05-01", "gross")[0].lastAmount).toBe(10)
    const due = dueThisMonth(
      forecastPayouts(
        [payout("2026-03-01", 5, { holdingId: 9, holdingName: "One-off" })],
        "2026-05-01"
      ),
      "2026-05-01"
    )
    expect(due).toEqual({ amount: 0, count: 0, sources: 0, unscheduled: 1 })
  })
})

// ── W8 KPI deltas ───────────────────────────────────────────────────────

describe("latestMonthChange (W8)", () => {
  it("UNIT-MOM-001 — agrees with the Entries M/M Δ and splits out what was added", () => {
    const es = [entry(2026, 3, 600, 10_000), entry(2026, 4, 600, 11_000)]
    const c = latestMonthChange(es)!
    expect(c).toMatchObject({ year: 2026, month: 4, gapMonths: 1 })
    expect(c.valueDelta).toBe(1000)
    expect(c.added).toBe(600)
    expect(c.marketDelta).toBe(valueChange(es, 1)!.delta)
    expect(c.marketDelta).toBe(400)
  })

  it("UNIT-MOM-002 — skips a trailing month with no value and reports a real gap", () => {
    const es = [
      entry(2026, 1, 100, 1000),
      entry(2026, 2, 100, null),
      entry(2026, 4, 100, 1500),
      entry(2026, 5, 100, null),
    ]
    const c = latestMonthChange(es)!
    expect(c.month).toBe(4)
    expect(c.gapMonths).toBe(3)
    expect(c.added).toBe(200)
  })

  it("UNIT-MOM-003 — Combined uses the latest month every account reported", () => {
    const a = portfolio(1, [
      entry(2026, 3, 0, 100),
      entry(2026, 4, 0, 110),
      entry(2026, 5, 0, 130),
    ])
    const b = portfolio(2, [entry(2026, 3, 0, 50), entry(2026, 4, 0, 60)])
    const { portfolio: combined, coverage } = aggregatePortfoliosWithCoverage([
      a,
      b,
    ])
    const c = latestMonthChange(combined.entries, coverage)!
    expect(c.month).toBe(4)
    expect(c.valueDelta).toBe(20)
    // Without coverage the May row (b carried forward) would be used.
    expect(latestMonthChange(combined.entries)!.month).toBe(5)
  })

  it("UNIT-MOM-004 — null with fewer than two valued months", () => {
    expect(latestMonthChange([entry(2026, 1, 0, 5)])).toBeNull()
    expect(latestMonthChange([])).toBeNull()
  })
})
