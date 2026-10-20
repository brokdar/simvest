import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  goalClause,
  goalsHeadline,
  goalTargetPhrase,
  incomeHeadline,
  overviewHeadline,
} from "@/lib/narrative"
import { monthMoves, type GoalEvaluation } from "@/lib/calc"
import { incomeWindow } from "@/lib/income-window"
import { catchUpGap, catchUpRows } from "@/lib/catch-up"
import { getActiveLocale, setActiveLocale } from "@/lib/format"
import type {
  EntryDTO,
  GoalDTO,
  IncomeEventDTO,
  PortfolioDTO,
} from "@/lib/types"
import { labelFor } from "@/lib/types"

const PREVIOUS = getActiveLocale()
beforeAll(() => setActiveLocale("de-DE"))
afterAll(() => setActiveLocale(PREVIOUS))

function entry(
  year: number,
  month: number,
  value: number | null,
  invested = 1000
): EntryDTO {
  return {
    id: year * 100 + month,
    year,
    month,
    day: 28,
    label: labelFor(year, month),
    invested,
    value,
    note: "",
  }
}

/** Twelve true months of 2025 with a +€500 market move each, then `last`. */
function series(lastValue: number | null, lastInvested = 1000): EntryDTO[] {
  const out: EntryDTO[] = []
  let v = 10_000
  for (let m = 1; m <= 12; m++) {
    v += m === 1 ? 0 : 1000 + 500
    out.push(entry(2025, m, v))
  }
  out.push(entry(2026, 1, lastValue, lastInvested))
  return out
}

const NOW = { year: 2026, month: 2 }

describe("overviewHeadline", () => {
  it("UNIT-NARR-001 — returns null with no recorded value (the empty state speaks instead)", () => {
    expect(
      overviewHeadline({ moves: [], valuedCount: 0, gain: 0, now: NOW })
    ).toBeNull()
  })

  it("UNIT-NARR-002 — a single entry says what happens next instead of inventing a move", () => {
    const text = overviewHeadline({
      moves: [],
      valuedCount: 1,
      gain: 0,
      now: NOW,
    })
    expect(text).toBe(
      "Your first month is in — log next month’s value and you’ll see how it moved."
    )
  })

  it("UNIT-NARR-003 — ahead: names the rise, the market's part and a record month", () => {
    // Dec ’25 → €26.500; Jan ’26 €30.000 with €1.000 added = +€2.500 market.
    const entries = series(30_000)
    const text = overviewHeadline({
      moves: monthMoves(entries),
      valuedCount: entries.length,
      gain: 5_000,
      now: NOW,
    })
    expect(text).toBe(
      "Up €3.500 in Jan ’26, €2.500 of it from the market — your best month on record."
    )
  })

  it("UNIT-NARR-004 — best since: names the last month that did better", () => {
    const entries = series(28_000) // +€500 market — ties the 2025 months
    entries[5] = entry(2025, 6, entries[5].value! + 5000)
    // Re-flow later months so Jun is a one-off spike (+€5.500 market) and
    // the rest stay at +€500.
    for (let i = 6; i < 12; i++)
      entries[i] = entry(2025, i + 1, entries[i - 1].value! + 1500)
    entries[12] = entry(2026, 1, entries[11].value! + 1000 + 2000)
    const text = overviewHeadline({
      moves: monthMoves(entries),
      valuedCount: entries.length,
      gain: 5_000,
      now: NOW,
    })
    expect(text).toContain("your best month since Jun ’25")
  })

  it("UNIT-NARR-005 — behind / negative month: calm, and says where you stand", () => {
    const entries = series(24_000) // €26.500 → €24.000 with €1.000 added
    const text = overviewHeadline({
      moves: monthMoves(entries),
      valuedCount: entries.length,
      gain: 3_000,
      now: NOW,
    })
    expect(text).toBe(
      "The market took €3.500 off in Jan ’26, partly offset by the €1.000 you added; you’re still €3.000 ahead of everything you’ve put in."
    )
  })

  it("UNIT-NARR-006 — negative month while below what you put in", () => {
    const entries = series(24_000)
    const text = overviewHeadline({
      moves: monthMoves(entries),
      valuedCount: entries.length,
      gain: -1_200,
      now: NOW,
    })
    expect(text).toContain("that leaves you €1.200 below what you’ve put in")
  })

  it("UNIT-NARR-007 — on track / flat month: the value moved only by what was added", () => {
    const entries = series(27_500) // €26.500 + €1.000 added, no market move
    const text = overviewHeadline({
      moves: monthMoves(entries),
      valuedCount: entries.length,
      gain: 0,
      now: NOW,
    })
    expect(text).toBe(
      "Flat in Jan ’26: the value moved only by what you added."
    )
  })

  it("UNIT-NARR-008 — stale account: says how long ago the latest value is", () => {
    const entries = series(30_000)
    const text = overviewHeadline({
      moves: monthMoves(entries),
      valuedCount: entries.length,
      gain: 0,
      now: { year: 2026, month: 7 },
    })
    expect(text).toContain("in Jan ’26 (6 months ago)")
  })

  it("UNIT-NARR-009 — combined with an incomplete newer month: says it's the last complete one", () => {
    const entries = series(30_000)
    const text = overviewHeadline({
      moves: monthMoves(entries),
      valuedCount: entries.length,
      gain: 0,
      now: NOW,
      newestReported: { year: 2026, month: 2 },
    })
    expect(text).toContain(
      "in Jan ’26 (the latest month all your accounts reported)"
    )
  })

  it("UNIT-NARR-010 — a gap spanning several months is never called a month", () => {
    const entries = [
      entry(2025, 1, 10_000),
      entry(2025, 2, 11_000),
      entry(2025, 3, null),
      entry(2025, 4, 14_000),
    ]
    const text = overviewHeadline({
      moves: monthMoves(entries),
      valuedCount: 3,
      gain: 0,
      now: { year: 2025, month: 5 },
    })
    expect(text).toContain("over the 2 months to Apr ’25")
    expect(text).not.toContain("best month")
  })

  it("UNIT-NARR-011 — never ranks with too little history to compare", () => {
    const entries = [entry(2025, 1, 10_000), entry(2025, 2, 12_000)]
    const text = overviewHeadline({
      moves: monthMoves(entries),
      valuedCount: 2,
      gain: 0,
      now: { year: 2025, month: 2 },
    })
    expect(text).toBe("Up €2.000 in Feb ’25, €1.000 of it from the market.")
  })
})

function goal(over: Partial<GoalDTO> = {}): GoalDTO {
  return {
    id: 1,
    name: "Million",
    color: "#1E40AF",
    kind: "portfolio_value",
    scope: "combined",
    portfolioId: null,
    target: 1_000_000,
    targetYear: 2035,
    swr: null,
    yieldAssumed: null,
    returnAssumed: null,
    ...over,
  }
}

function ev(over: Partial<GoalEvaluation> = {}): GoalEvaluation {
  return {
    currentValue: 300_000,
    targetValue: 1_000_000,
    inflatedTargetValue: 1_000_000,
    portfolioTargetValue: 1_000_000,
    pct: 0.3,
    projectedYear: 2033.8,
    onTrack: true,
    requiredMonthly: 900,
    expectedReturn: 7,
    expectedReturnSource: "derived",
    historicalReturn: { value: 7, source: "derived" },
    returnScopeName: "Combined",
    returnEntryCount: 60,
    monthlySaving: 1800,
    scopedKpiValue: 300_000,
    ...over,
  }
}

describe("goalsHeadline", () => {
  it("UNIT-NARR-012 — no goals: nothing to say", () => {
    expect(goalsHeadline([])).toBeNull()
  })

  it("UNIT-NARR-013 — ahead of the goal year", () => {
    expect(goalsHeadline([{ goal: goal(), ev: ev() }])).toBe(
      "At this pace you’ll reach €1,0M around 2034, a year ahead of your 2035 goal."
    )
  })

  it("UNIT-NARR-014 — right on time", () => {
    expect(
      goalsHeadline([{ goal: goal(), ev: ev({ projectedYear: 2034.8 }) }])
    ).toBe(
      "At this pace you’ll reach €1,0M in 2035, right on time for your goal."
    )
  })

  it("UNIT-NARR-015 — behind: leads with the fix, in the verdict's own numbers", () => {
    const g = goal({
      kind: "dividend_monthly",
      target: 100,
      targetYear: 2032,
      scope: "portfolio",
      portfolioId: 4,
    })
    const e = ev({
      onTrack: false,
      projectedYear: null,
      requiredMonthly: 324.06,
      monthlySaving: 0,
      currentValue: 26,
      targetValue: 100,
    })
    expect(
      goalsHeadline([{ goal: g, ev: e, portfolioName: "Deutsche Bank" }])
    ).toBe(
      "You need €324/mo more, starting now, to reach €100/mo in dividends from Deutsche Bank by 2032."
    )
  })

  it("UNIT-NARR-016 — behind without a fix: says when it does land", () => {
    const e = ev({
      onTrack: false,
      projectedYear: 2036.2,
      requiredMonthly: 1800.2,
      monthlySaving: 1800,
    })
    expect(goalClause({ goal: goal(), ev: e })).toBe(
      "at this pace €1,0M arrives around 2036, just after your 2035 goal"
    )
  })

  it("UNIT-NARR-017 — out of reach at today's pace", () => {
    const e = ev({
      onTrack: false,
      projectedYear: null,
      requiredMonthly: 1800,
      monthlySaving: 1800,
    })
    expect(goalClause({ goal: goal(), ev: e })).toBe(
      "at today’s pace €1,0M is more than 40 years away"
    )
  })

  it("UNIT-NARR-018 — already reached", () => {
    const e = ev({ currentValue: 1_200_000, projectedYear: 2026 })
    expect(goalClause({ goal: goal(), ev: e })).toBe(
      "you’ve already reached €1,0M"
    )
  })

  it("UNIT-NARR-019 — mixed: the on-track goal leads, the one needing help follows", () => {
    const behind = {
      goal: goal({
        id: 2,
        kind: "dividend_monthly",
        target: 100,
        targetYear: 2032,
      }),
      ev: ev({
        onTrack: false,
        projectedYear: null,
        requiredMonthly: 324,
        monthlySaving: 0,
        currentValue: 26,
        targetValue: 100,
      }),
    }
    expect(goalsHeadline([behind, { goal: goal(), ev: ev() }])).toBe(
      "At this pace you’ll reach €1,0M around 2034, a year ahead of your 2035 goal — and you need €324/mo more, starting now, to reach €100/mo in dividends by 2032."
    )
  })

  it("UNIT-NARR-020 — all on track / all behind", () => {
    const a = { goal: goal(), ev: ev() }
    const b = { goal: goal({ id: 2, targetYear: 2040 }), ev: ev() }
    expect(goalsHeadline([a, b])).toMatch(/^All 2 goals are on track — /)
    const late = (id: number) => ({
      goal: goal({ id }),
      ev: ev({ onTrack: false, projectedYear: null, requiredMonthly: 2500 }),
    })
    expect(goalsHeadline([late(1), late(2), late(3)])).toMatch(
      / — and 2 more goals need a nudge\.$/
    )
  })

  it("UNIT-NARR-021 — target phrases per kind", () => {
    expect(
      goalTargetPhrase(goal({ kind: "annual_income", target: 30_000 }))
    ).toBe("€30k/yr of income")
    expect(
      goalTargetPhrase(goal({ kind: "dividend_annual", target: 1_200 }))
    ).toBe("€1.200/yr in dividends")
  })
})

function payout(
  paidDate: string,
  amount: number,
  portfolioId = 1,
  kind: "dividend" | "interest" = "dividend"
): IncomeEventDTO {
  return {
    id: Math.round(Math.random() * 1e9),
    portfolioId,
    holdingId: kind === "dividend" ? 1 : null,
    holdingName: kind === "dividend" ? "ETF" : null,
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

function monthly(year: number, months: number[], amount: number, pid = 1) {
  return months.map((m) =>
    payout(`${year}-${String(m).padStart(2, "0")}-15`, amount, pid)
  )
}

describe("incomeHeadline", () => {
  const now = new Date("2026-08-20")
  const head = (events: IncomeEventDTO[], lagging?: { name: string }[]) =>
    incomeHeadline({
      events,
      basis: "gross",
      window: incomeWindow(events, { now }),
      now,
      lagging,
    })

  it("UNIT-NARR-022 — no payouts: nothing to say", () => {
    expect(head([])).toBeNull()
  })

  it("UNIT-NARR-023 — this year already beat all of last year", () => {
    const events = [
      ...monthly(2025, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 50),
      ...monthly(2026, [1, 2, 3, 4, 5, 6, 7, 8], 100),
    ]
    expect(head(events)).toBe(
      "2026 has already beaten all of 2025 — €800 so far against €600, with 4 months still to come."
    )
  })

  it("UNIT-NARR-024 — ahead on the trailing year: like-for-like percentage", () => {
    const events = [
      ...monthly(2024, [9, 10, 11, 12], 50),
      ...monthly(2025, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 50),
      ...monthly(2026, [1, 2, 3, 4, 5, 6, 7], 55),
    ]
    expect(head(events)).toBe(
      "€635 of income came in over the 12 months to Jul ’26 — up 15,5% on the 12 months before."
    )
  })

  it("UNIT-NARR-025 — behind on the trailing year: says less, never alarms", () => {
    const events = [
      ...monthly(2024, [8, 9, 10, 11, 12], 60),
      ...monthly(2025, [1, 2, 3, 4, 5, 6, 7], 60),
      ...monthly(2025, [8, 9, 10, 11, 12], 50),
      ...monthly(2026, [1, 2, 3, 4, 5, 6, 7], 50),
    ]
    expect(head(events)).toContain("16,7% less than the 12 months before")
  })

  it("UNIT-NARR-026 — stale source: names the accounts counted only up to their last payout", () => {
    const events = [
      ...monthly(2024, [6, 7, 8, 9, 10, 11, 12], 10, 1),
      ...monthly(2025, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 10, 1),
      ...monthly(2026, [1, 2, 3], 10, 1),
      ...monthly(2024, [6, 7, 8, 9, 10, 11, 12], 10, 2),
      ...monthly(2025, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 10, 2),
      ...monthly(2026, [1, 2, 3, 4, 5, 6, 7], 10, 2),
    ]
    const w = incomeWindow(events, { now })
    expect(w.lagging.map((l) => l.portfolioId)).toEqual([1])
    expect(head(events, [{ name: "Trade Republic" }])).toContain(
      "(Trade Republic counted only up to its last recorded payout)"
    )
  })

  it("UNIT-NARR-027 — single payout, no baseline: the total so far", () => {
    expect(head([payout("2026-03-10", 12.5)])).toBe(
      "€13 of income so far, since your first payout in Mar ’26 — recorded through Mar ’26."
    )
  })
})

describe("catchUpGap", () => {
  const p = (id: number, name: string, entries: EntryDTO[]): PortfolioDTO => ({
    id,
    name,
    color: "#000",
    targetMonthlyContribution: 100,
    startingValue: 0,
    startingDate: null,
    entries,
  })
  const current = { year: 2026, month: 10 }

  it("UNIT-NARR-028 — names the account several months behind and where to start", () => {
    const rows = catchUpRows(
      [
        p(1, "Trade Republic", [entry(2026, 4, 100)]),
        p(5, "Bondora", [entry(2026, 9, 100)]),
      ],
      current,
      "last"
    )
    const gap = catchUpGap(rows, current)
    expect(gap?.text).toBe("Trade Republic is 6 months behind.")
    expect(gap?.firstMissing).toEqual({ year: 2026, month: 5 })
    expect(gap?.accounts.map((a) => a.id)).toEqual([1])
  })

  it("UNIT-NARR-029 — several accounts behind: most behind first", () => {
    const rows = catchUpRows(
      [
        p(4, "Deutsche Bank", [entry(2026, 5, 100)]),
        p(1, "Trade Republic", [entry(2026, 4, 100)]),
      ],
      current,
      "last"
    )
    expect(catchUpGap(rows, current)?.text).toBe(
      "Trade Republic and Deutsche Bank are behind — up to 6 months."
    )
  })

  it("UNIT-NARR-030 — one month behind is just this month's chore — no gap", () => {
    const rows = catchUpRows(
      [p(5, "Bondora", [entry(2026, 9, 100)])],
      current,
      "last"
    )
    expect(catchUpGap(rows, current)).toBeNull()
  })
})
