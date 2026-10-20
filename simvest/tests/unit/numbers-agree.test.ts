import { describe, expect, it } from "vitest"
import {
  bestWorstMonth,
  concentrationVerdict,
  evaluateGoal,
  returnMilestones,
  projectFuture,
  valueChange,
} from "@/lib/calc"
import { convertGoalTarget, defaultGoalTarget } from "@/lib/goal-evaluator"
import {
  bucketByMonthEnding,
  incomeWindow,
  monthIdx,
  monthStatus,
  recordedSpan,
  trailing12ByCalendar,
} from "@/lib/income-window"
import { donutSlicePath } from "@/lib/charts/donut"
import { heatBucket, heatBucketBounds } from "@/lib/charts/heatmap"
import type {
  EntryDTO,
  GoalDTO,
  IncomeEventDTO,
  PortfolioDTO,
  SettingsDTO,
} from "@/lib/types"

let nextId = 1
function ev(
  paidDate: string,
  amount: number,
  portfolioId = 1,
  kind: "dividend" | "interest" = "dividend"
): IncomeEventDTO {
  return {
    id: nextId++,
    portfolioId,
    holdingId: kind === "interest" ? null : 10 + portfolioId,
    holdingName: kind === "interest" ? null : `H${portfolioId}`,
    holdingType: null,
    holdingIsin: null,
    paidDate,
    kind,
    amount,
    tax: 0,
    note: "",
    sourceBroker: null,
    sourceTransactionId: null,
  }
}

function entry(
  year: number,
  month: number,
  value: number | null,
  invested = 100
): EntryDTO {
  return {
    id: nextId++,
    year,
    month,
    day: 28,
    label: "",
    invested,
    value,
    note: "",
  }
}

/** Monthly payouts of `amount` for portfolio `pid` from `from` to `to` (YYYY-MM). */
function monthly(from: string, to: string, amount: number, pid = 1) {
  const out: IncomeEventDTO[] = []
  let y = +from.slice(0, 4)
  let m = +from.slice(5, 7)
  const end = monthIdx(+to.slice(0, 4), +to.slice(5, 7))
  while (monthIdx(y, m) <= end) {
    out.push(ev(`${y}-${String(m).padStart(2, "0")}-15`, amount, pid))
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return out
}

describe("N4 — trailing windows anchor to the last recorded payout", () => {
  const now = new Date("2026-10-20T12:00:00Z")

  it("UNIT-P4-N4-001 — five un-entered months are not a −26,8% drop", () => {
    // Steady €100/month, recorded through May 2026; today is Oct 2026.
    const events = monthly("2024-01", "2026-05", 100)
    const w = incomeWindow(events, { now })
    expect(w.anchor).toBe(monthIdx(2026, 5))
    expect(w.last12).toBe(1200)
    expect(w.prior12).toBe(1200)
    expect(w.deltaPct).toBe(0)
    expect(w.monthsSinceAnchor).toBe(5)
  })

  it("UNIT-P4-N4-002 — a portfolio lagging behind the scope is compared like-for-like", () => {
    // Portfolio 1 (monthly €100) recorded through Apr 2026; portfolio 2
    // (monthly €10) through Sep 2026. Anchor = Sep 2026.
    const events = [
      ...monthly("2023-01", "2026-04", 100, 1),
      ...monthly("2023-01", "2026-09", 10, 2),
    ]
    const w = incomeWindow(events, { now })
    expect(w.anchor).toBe(monthIdx(2026, 9))
    expect(w.lagging).toEqual([
      { portfolioId: 1, through: monthIdx(2026, 4), missingMonths: 5 },
    ])
    // last12 = Oct25..Sep26: p1 has Oct25..Apr26 = 7 months, p2 12 months.
    expect(w.last12).toBe(7 * 100 + 12 * 10)
    // prior12 like-for-like: p1 only Oct24..Apr25 (7), p2 all 12.
    expect(w.prior12).toBe(7 * 100 + 12 * 10)
    expect(w.deltaPct).toBe(0)
  })

  it("UNIT-P4-N4-003 — an irregular payer that just had nothing due isn't 'lagging'", () => {
    const events = [
      ...monthly("2023-01", "2026-09", 10, 2),
      ev("2024-04-20", 300, 1),
      ev("2025-04-20", 300, 1),
      ev("2026-04-20", 300, 1),
    ]
    const w = incomeWindow(events, { now })
    expect(w.lagging).toEqual([])
  })

  it("UNIT-P4-N4-004 — no baseline when the record is younger than a year", () => {
    const w = incomeWindow(monthly("2026-01", "2026-09", 50), { now })
    expect(w.prior12).toBeNull()
    expect(w.deltaPct).toBeNull()
    expect(w.last12).toBe(9 * 50)
  })

  it("UNIT-P4-N4-005 — empty scope: no anchor, zero, no baseline", () => {
    const w = incomeWindow([], { now })
    expect(w.anchor).toBeNull()
    expect(w.last12).toBe(0)
    expect(w.prior12).toBeNull()
  })

  it("UNIT-P4-N4-006 — scoping by portfolio and kind", () => {
    const events = [
      ...monthly("2025-01", "2025-12", 100, 1),
      ev("2025-06-01", 7, 2, "interest"),
    ]
    expect(incomeWindow(events, { portfolioId: 2, now }).last12).toBe(7)
    expect(incomeWindow(events, { kind: "interest", now }).last12).toBe(7)
    expect(incomeWindow(events, { kind: "dividend", now }).last12).toBe(1200)
  })
})

describe("N5 — 'no data yet' is distinct from zero", () => {
  const span = {
    first: monthIdx(2024, 3),
    last: monthIdx(2026, 5),
    now: monthIdx(2026, 10),
  }
  it("UNIT-P4-N5-001 — month status distinguishes paid, none, unrecorded, before, future", () => {
    expect(monthStatus(monthIdx(2025, 1), 12, span)).toBe("paid")
    expect(monthStatus(monthIdx(2025, 2), 0, span)).toBe("none")
    expect(monthStatus(monthIdx(2026, 7), 0, span)).toBe("unrecorded")
    expect(monthStatus(monthIdx(2024, 1), 0, span)).toBe("before")
    expect(monthStatus(monthIdx(2026, 11), 0, span)).toBe("future")
  })

  it("UNIT-P4-N5-002 — recordedSpan returns first/last payout month", () => {
    expect(recordedSpan([ev("2025-03-02", 1), ev("2024-11-30", 1)])).toEqual({
      first: monthIdx(2024, 11),
      last: monthIdx(2025, 3),
    })
    expect(recordedSpan([])).toBeNull()
  })

  it("UNIT-P4-N5-003 — trailing-12 line sums 12 calendar months, not 12 non-empty ones", () => {
    // Quarterly €300 payouts: the 12-month sum is 4 × 300, never 12 × 300.
    const pts = [0, 3, 6, 9, 12, 15, 18].map((k) => ({
      idx: monthIdx(2024, 1) + k,
      total: 300,
    }))
    expect(trailing12ByCalendar(pts)).toEqual([
      300, 600, 900, 1200, 1200, 1200, 1200,
    ])
  })

  it("UNIT-P4-N5-004 — sparkline buckets end at the anchor month, not today", () => {
    const events = monthly("2025-01", "2026-05", 10)
    const s = bucketByMonthEnding(events, monthIdx(2026, 5), 24)
    expect(s).toHaveLength(24)
    expect(s.at(-1)).toBe(10)
    expect(s.slice(-17).every((v) => v === 10)).toBe(true)
    expect(s.slice(0, 7).every((v) => v === 0)).toBe(true)
  })
})

describe("N11 — one absolute heatmap scale", () => {
  it("UNIT-P4-N11-001 — €17,78 and €428,74 land in different buckets", () => {
    const max = 428.74
    expect(heatBucket(17.78, max)).toBe(1)
    expect(heatBucket(428.74, max)).toBe(5)
    expect(heatBucket(0, max)).toBe(0)
  })
  it("UNIT-P4-N11-002 — legend bounds are fifths of the max", () => {
    expect(heatBucketBounds(500)).toEqual([100, 200, 300, 400, 500])
  })
})

describe("N14 — 100% donut slice", () => {
  it("UNIT-P4-N14-001 — a full-circle slice draws two half arcs, not a zero-length arc", () => {
    const start = -Math.PI / 2
    const path = donutSlicePath(start, start + Math.PI * 2, 90, 60)
    expect(path.match(/A /g)).toHaveLength(4)
    expect(path).not.toMatch(/^M (\S+) (\S+) A 90 90 0 1 1 \1 \2 /)
  })
  it("UNIT-P4-N14-002 — partial slices are unchanged (one outer, one inner arc)", () => {
    const path = donutSlicePath(0, Math.PI / 2, 90, 60)
    expect(path.match(/A /g)).toHaveLength(2)
  })
})

describe("N10 — concentration framing", () => {
  it("UNIT-P4-N10-001 — frames high, moderate, low, and trivially-100% cases", () => {
    expect(concentrationVerdict(78, 12).level).toBe("concentrated")
    expect(concentrationVerdict(60, 12).level).toBe("moderate")
    expect(concentrationVerdict(30, 12).level).toBe("spread")
    expect(concentrationVerdict(100, 2)).toEqual({
      level: "few",
      text: "Only 2 sources — each one matters",
    })
    expect(concentrationVerdict(100, 1).level).toBe("few")
  })
})

describe("N13 — M/M Δ knows the real gap", () => {
  it("UNIT-P4-N13-001 — compares with the closest valued row and nets every contribution in between", () => {
    const entries = [
      entry(2026, 1, 1000, 100),
      entry(2026, 2, null, 100),
      entry(2026, 3, null, 100),
      entry(2026, 4, 1500, 100),
    ]
    expect(valueChange(entries, 3)).toEqual({ delta: 200, gapMonths: 3 })
    expect(valueChange(entries, 0)).toBeNull()
    expect(valueChange(entries, 2)).toBeNull()
  })
  it("UNIT-P4-N13-002 — a real one-month step reports gapMonths 1", () => {
    const entries = [entry(2026, 1, 1000, 100), entry(2026, 2, 1150, 100)]
    expect(valueChange(entries, 1)).toEqual({ delta: 50, gapMonths: 1 })
  })
  it("UNIT-P4-N13-003 — rows months apart are a gap even when adjacent", () => {
    const entries = [entry(2025, 9, 1000, 0), entry(2026, 1, 900, 0)]
    expect(valueChange(entries, 1)).toEqual({ delta: -100, gapMonths: 4 })
  })
  it("UNIT-P4-N13-004 — best/worst month ignore multi-month gaps", () => {
    const entries = [
      entry(2025, 1, 1000, 0),
      entry(2025, 2, 1100, 0), // +100 in one month
      entry(2025, 9, 400, 0), // −700 over seven months: not a "month"
      entry(2025, 10, 350, 0), // −50
    ]
    expect(bestWorstMonth(entries)).toEqual({ best: 100, worst: -50 })
  })
})

describe("N2 — milestones measure from today", () => {
  it("UNIT-P4-N2-001 — milestones already behind you are 'reached', not 'in ~0,0y'", () => {
    const projection = projectFuture({
      startValue: 326_000,
      monthlySaving: 1800,
      years: 20,
      annualReturn: 11.2,
    })
    const ms = returnMilestones({
      startValue: 326_000,
      monthlySaving: 1800,
      annualReturn: 11.2,
      projection,
    })
    // 326k × 11,2% ≈ €36,5k/yr vs €21,6k/yr contributions → 1× reached.
    expect(ms[0]).toMatchObject({ multiple: 1, reached: true, months: 0 })
    expect(ms[1].reached).toBe(false)
    expect(ms[1].months).toBeGreaterThan(0)
    // Three different thresholds → three different answers.
    expect(new Set(ms.map((m) => m.months)).size).toBe(3)
  })
  it("UNIT-P4-N2-002 — a non-positive return never reaches a milestone", () => {
    const ms = returnMilestones({
      startValue: 6000,
      monthlySaving: 100,
      annualReturn: -5.6,
      projection: [],
    })
    expect(ms.every((m) => !m.reached && m.months === null)).toBe(true)
  })
})

describe("N3 — the expected return is named and overridable", () => {
  const settings: SettingsDTO = {
    inflation: 2.4,
    conservativeReturn: 4,
    optimisticReturn: 10,
    monthlySaving: 1250,
    horizonYears: 20,
    defaultEntryDay: "last",
    defaultSwr: 4,
    dividendBasis: "net",
    locale: "de-DE",
  } as SettingsDTO
  const shrinking: PortfolioDTO = {
    id: 4,
    name: "Deutsche Bank",
    color: "#000000",
    targetMonthlyContribution: 0,
    startingValue: 0,
    startingDate: null,
    entries: Array.from({ length: 12 }, (_, i) =>
      entry(2025, i + 1, 10_000 - i * 50, 0)
    ),
  }
  const goal: GoalDTO = {
    id: 1,
    name: "g",
    color: "#000000",
    kind: "portfolio_value",
    scope: "portfolio",
    portfolioId: 4,
    target: 20_000,
    targetYear: 2040,
    swr: null,
    yieldAssumed: null,
    returnAssumed: null,
  }
  const ctx = {
    portfolios: [shrinking],
    incomeEvents: [],
    settings,
    monthlySaving: 0,
    now: new Date("2026-10-20"),
  }

  it("UNIT-P4-N3-001 — the evaluation names the scope and entry count behind the return", () => {
    const e = evaluateGoal(goal, ctx)
    expect(e.expectedReturnSource).toBe("derived")
    expect(e.expectedReturn).toBeLessThan(0)
    expect(e.returnScopeName).toBe("Deutsche Bank")
    expect(e.returnEntryCount).toBe(12)
  })
  it("UNIT-P4-N3-002 — a goal's returnAssumed overrides the record, which stays visible", () => {
    const e = evaluateGoal({ ...goal, returnAssumed: 6 }, ctx)
    expect(e.expectedReturn).toBe(6)
    expect(e.expectedReturnSource).toBe("override")
    expect(e.historicalReturn.value).toBeLessThan(0)
    expect(e.projectedYear).not.toBeNull()
  })
})

describe("N17 — switching goal kind converts or resets the amount", () => {
  it("UNIT-P4-N17-001 — yearly → monthly divides by 12 (no silent 12× goal)", () => {
    expect(
      convertGoalTarget(30_000, "annual_income", "dividend_monthly")
    ).toEqual({ target: 2500, how: "converted" })
  })
  it("UNIT-P4-N17-002 — monthly → yearly multiplies by 12", () => {
    expect(
      convertGoalTarget(100, "dividend_monthly", "dividend_annual")
    ).toEqual({ target: 1200, how: "converted" })
  })
  it("UNIT-P4-N17-003 — yearly ↔ yearly keeps the amount", () => {
    expect(
      convertGoalTarget(30_000, "annual_income", "dividend_annual")
    ).toEqual({ target: 30_000, how: "kept" })
  })
  it("UNIT-P4-N17-004 — income ↔ portfolio value resets to that kind's default", () => {
    expect(
      convertGoalTarget(30_000, "annual_income", "portfolio_value")
    ).toEqual({ target: defaultGoalTarget("portfolio_value"), how: "reset" })
    expect(
      convertGoalTarget(1_000_000, "portfolio_value", "dividend_monthly")
    ).toEqual({ target: 1000, how: "reset" })
  })
})
