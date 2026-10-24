import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  detectMilestones,
  goalQuarterMilestones,
  incomeTotalMilestones,
  marketBeatContributions,
  activeMilestones,
  recordIncomeMonth,
  valueMilestones,
  type Milestone,
} from "@/lib/milestones"
import { aggregatePortfoliosWithCoverage } from "@/lib/calc"
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

function makeEntry(
  year: number,
  month: number,
  invested: number,
  value: number | null
): EntryDTO {
  return {
    id: -1,
    year,
    month,
    day: 28,
    label: labelFor(year, month),
    invested,
    value,
    note: "",
  }
}

function makePortfolio(id: number, entries: EntryDTO[]): PortfolioDTO {
  return {
    id,
    name: `P${id}`,
    color: "#000",
    targetMonthlyContribution: 100,
    contributionSet: true,
    startingValue: 0,
    startingDate: null,
    entries,
  }
}

let nextId = 1
function payout(
  paidDate: string,
  amount: number,
  kind: "dividend" | "interest" = "dividend",
  portfolioId = 1,
  tax = 0
): IncomeEventDTO {
  return {
    id: nextId++,
    portfolioId,
    holdingId: kind === "dividend" ? 1 : null,
    holdingName: null,
    holdingType: null,
    holdingIsin: null,
    paidDate,
    kind,
    amount,
    tax,
    note: "",
    sourceBroker: null,
    sourceTransactionId: null,
  }
}

const ids = (ms: Milestone[]) => ms.map((m) => m.id)

describe("incomeTotalMilestones", () => {
  it("UNIT-MILE-001 — first €1.000 of dividends, dated by the month it was passed", () => {
    const events = [
      payout("2024-01-10", 400),
      payout("2024-06-10", 300),
      payout("2024-09-10", 400), // cumulative €1.100 → passes €500 (Jun) and €1.000 (Sep)
      payout("2024-09-12", 50, "interest"),
    ]
    const ms = incomeTotalMilestones(events, "gross", "dividend")
    expect(ids(ms)).toEqual(["dividends-total-500", "dividends-total-1000"])
    expect(ms[1]).toMatchObject({
      year: 2024,
      month: 9,
      title: "Your first €1.000 of dividends",
    })
    expect(ms[1].detail).toContain("€1.100 since your first payout in Jan ’24")
  })

  it("UNIT-MILE-002 — 'all' counts interest too; net basis subtracts tax", () => {
    const events = [
      payout("2024-01-10", 600, "dividend", 1, -150),
      payout("2024-02-10", 100, "interest"),
    ]
    expect(ids(incomeTotalMilestones(events, "gross", "all"))).toEqual([
      "income-total-500",
    ])
    // Net: 450 + 100 = 550 → still €500, passed only in Feb.
    expect(incomeTotalMilestones(events, "net", "all")[0]).toMatchObject({
      month: 2,
    })
  })

  it("UNIT-MILE-003 — no payouts, no milestones", () => {
    expect(incomeTotalMilestones([], "gross", "all")).toEqual([])
  })
})

describe("recordIncomeMonth", () => {
  it("UNIT-MILE-004 — a new best month after a year of record", () => {
    const events = [
      payout("2024-01-10", 50),
      payout("2024-06-10", 80),
      payout("2025-03-10", 70),
      payout("2025-04-10", 120),
    ]
    const ms = recordIncomeMonth(events, "gross")
    expect(ids(ms)).toEqual(["record-income-month-2025-04"])
    expect(ms[0].detail).toBe(
      "€120 in Apr ’25 — the previous best was €80 in Jun ’24."
    )
  })

  it("UNIT-MILE-005 — inside the first year a 'record' means nothing", () => {
    const events = [payout("2024-01-10", 50), payout("2024-06-10", 80)]
    expect(recordIncomeMonth(events, "gross")).toEqual([])
  })
})

describe("valueMilestones", () => {
  it("UNIT-MILE-006 — first time over a round number; a jump over two is one milestone", () => {
    const entries = [
      makeEntry(2024, 1, 0, 8_000),
      makeEntry(2024, 2, 0, 12_000),
      makeEntry(2024, 3, 0, 9_000),
      makeEntry(2024, 4, 0, 11_000), // back over €10k — not a first time
      makeEntry(2024, 5, 0, 55_000), // passes €25k and €50k at once
    ]
    const ms = valueMilestones(entries)
    expect(ids(ms)).toEqual(["value-10000", "value-50000"])
    expect(ms[0]).toMatchObject({ year: 2024, month: 2 })
    expect(ms[1].title).toBe("Your portfolio passed €50k")
  })

  it("UNIT-MILE-007 — the first recorded month is where the record starts, not a crossing", () => {
    expect(valueMilestones([makeEntry(2024, 1, 0, 120_000)])).toEqual([])
  })

  it("UNIT-MILE-008 — Combined: a month carried forward for one account never counts", () => {
    const a = makePortfolio(1, [
      makeEntry(2024, 1, 0, 5_000),
      makeEntry(2024, 2, 0, 7_000),
      makeEntry(2024, 3, 0, null),
    ])
    const b = makePortfolio(2, [
      makeEntry(2024, 1, 0, 1_000),
      makeEntry(2024, 2, 0, 2_000),
      makeEntry(2024, 3, 0, 3_000), // 7k carried + 3k = 10k, but estimated
    ])
    const agg = aggregatePortfoliosWithCoverage([a, b])
    expect(valueMilestones(agg.portfolio.entries, agg.coverage)).toEqual([])
    // Without coverage the estimate would have claimed €10k.
    expect(ids(valueMilestones(agg.portfolio.entries))).toEqual(["value-10000"])
  })
})

describe("marketBeatContributions", () => {
  it("UNIT-MILE-009 — the month the year's market gain overtook what was added", () => {
    const entries = [
      makeEntry(2025, 12, 0, 10_000),
      makeEntry(2026, 1, 1000, 11_500), // market +500 vs added 1000
      makeEntry(2026, 2, 1000, 15_000), // market +2500 → 3000 vs 2000
    ]
    const ms = marketBeatContributions(entries)
    expect(ids(ms)).toEqual(["market-beat-contributions-2026"])
    expect(ms[0]).toMatchObject({
      year: 2026,
      month: 2,
      title: "For the first time, the market added more than you did",
    })
    expect(ms[0].detail).toBe(
      "€3.000 from the market against €2.000 you put in, Jan ’26–Feb ’26."
    )
  })

  it("UNIT-MILE-010 — a losing year never claims it", () => {
    const entries = [
      makeEntry(2025, 12, 0, 10_000),
      makeEntry(2026, 1, 1000, 10_500),
      makeEntry(2026, 2, 1000, 11_000),
    ]
    expect(marketBeatContributions(entries)).toEqual([])
  })
})

describe("goalQuarterMilestones", () => {
  const baseGoal: GoalDTO = {
    id: 9,
    name: "Half a million",
    color: "#000",
    kind: "portfolio_value",
    scope: "combined",
    portfolioId: null,
    target: 100_000,
    targetYear: 2040,
    swr: null,
    yieldAssumed: null,
    returnAssumed: null,
  }

  it("UNIT-MILE-011 — value goal: 25 / 50 % crossings, dated", () => {
    const p = makePortfolio(1, [
      makeEntry(2024, 1, 0, 10_000),
      makeEntry(2024, 2, 0, 30_000),
      makeEntry(2024, 3, 0, 52_000),
    ])
    const ms = goalQuarterMilestones({
      goal: baseGoal,
      portfolios: [p],
      incomeEvents: [],
      basis: "gross",
      defaultSwr: 4,
    })
    expect(ids(ms)).toEqual(["goal-9-q25", "goal-9-q50"])
    expect(ms[1]).toMatchObject({
      title: "Halfway to “Half a million”",
      href: "/goals?goal=9",
    })
    expect(ms[1].detail).toBe("Passed 50% of the goal in Mar ’24.")
  })

  it("UNIT-MILE-012 — monthly-dividend goal uses trailing-12 payouts ÷ 12", () => {
    const goal: GoalDTO = {
      ...baseGoal,
      kind: "dividend_monthly",
      target: 10,
      scope: "portfolio",
      portfolioId: 1,
    }
    const events = [
      payout("2024-01-10", 12), // t12 12 → €1/mo = 10%
      payout("2024-06-10", 24), // t12 36 → €3/mo = 30% → crosses 25%
      payout("2024-07-10", 5, "dividend", 2), // other account: ignored
    ]
    const ms = goalQuarterMilestones({
      goal,
      portfolios: [makePortfolio(1, []), makePortfolio(2, [])],
      incomeEvents: events,
      basis: "gross",
      defaultSwr: 4,
    })
    expect(ids(ms)).toEqual(["goal-9-q25"])
    expect(ms[0]).toMatchObject({ year: 2024, month: 6 })
  })

  it("UNIT-MILE-013 — a goal for a deleted portfolio yields nothing", () => {
    expect(
      goalQuarterMilestones({
        goal: { ...baseGoal, scope: "portfolio", portfolioId: 42 },
        portfolios: [],
        incomeEvents: [],
        basis: "gross",
        defaultSwr: 4,
      })
    ).toEqual([])
  })
})

describe("activeMilestones", () => {
  const m = (
    id: string,
    family: Milestone["family"],
    year: number,
    month: number
  ): Milestone => ({
    id,
    family,
    title: id,
    detail: "",
    year,
    month,
    href: "/",
  })

  const all = [
    m("value-100000", "value", 2025, 1),
    m("value-150000", "value", 2026, 3),
    m("value-200000", "value", 2026, 5),
    m("income-total-1000", "income-total", 2026, 4),
    m("record-income-month-2025-12", "record-income-month", 2025, 12),
  ]

  const now = { year: 2026, month: 10 }

  it("UNIT-LO-MILE-001 — keeps the newest per family regardless of age, newest first", () => {
    expect(ids(activeMilestones(all, now))).toEqual([
      "value-200000",
      "income-total-1000",
      "record-income-month-2025-12",
    ])
  })

  it("UNIT-LO-MILE-002 — an old milestone is still there years later", () => {
    expect(ids(activeMilestones(all, { year: 2030, month: 1 }))).toContain(
      "record-income-month-2025-12"
    )
  })

  it("UNIT-LO-MILE-003 — dismissing the newest of a family does not resurrect an older one", () => {
    const dismissed = new Set(["value-200000"])
    expect(ids(activeMilestones(all, now, dismissed))).toEqual([
      "income-total-1000",
      "record-income-month-2025-12",
    ])
  })

  it("UNIT-LO-MILE-004 — a newer milestone supersedes the old one of its family", () => {
    const withNewer = [...all, m("value-250000", "value", 2026, 8)]
    expect(ids(activeMilestones(withNewer, now))).toEqual([
      "value-250000",
      "income-total-1000",
      "record-income-month-2025-12",
    ])
  })

  it("UNIT-LO-MILE-005 — shows at most four", () => {
    const many = [
      m("a", "value", 2026, 1),
      m("b", "income-total", 2026, 2),
      m("c", "dividends-total", 2026, 3),
      m("d", "record-income-month", 2026, 4),
      m("e", "market-beat-contributions", 2026, 5),
      m("f", "goal-1", 2026, 6),
    ]
    expect(ids(activeMilestones(many, now))).toEqual(["f", "e", "d", "c"])
  })

  it("UNIT-LO-MILE-006 — ignores milestones dated after today", () => {
    expect(ids(activeMilestones([m("future", "value", 2027, 1)], now))).toEqual(
      []
    )
  })
})

describe("detectMilestones", () => {
  it("UNIT-MILE-017 — gathers every family, oldest first", () => {
    const p = makePortfolio(1, [
      makeEntry(2025, 12, 0, 9_000),
      makeEntry(2026, 1, 500, 10_500),
      makeEntry(2026, 2, 500, 12_000),
    ])
    const ms = detectMilestones({
      portfolios: [p],
      incomeEvents: [payout("2026-02-10", 600)],
      goals: [],
      basis: "gross",
      defaultSwr: 4,
    })
    expect(ids(ms)).toEqual([
      "value-10000",
      "market-beat-contributions-2026",
      "income-total-500",
      "dividends-total-500",
    ])
    expect(ms[0].title).toBe("Your portfolio passed €10k")
  })
})
