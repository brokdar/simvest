import { describe, it, expect } from "vitest"
import {
  aggregatePortfolios,
  aggregatePortfoliosWithCoverage,
  computeKPIs,
  incomeByMonth,
  historicalAnnualReturn,
  historicalAnnualReturnWithSource,
  latestKnownValue,
  projectFuture,
  requiredMonthlyInvestment,
  totalIncome,
  eventAmount,
  COMBINED_PORTFOLIO_ID,
} from "@/lib/calc"
import type { EntryDTO, IncomeEventDTO, PortfolioDTO } from "@/lib/types"
import { labelFor } from "@/lib/types"
import { daysInMonth } from "@/lib/dates"

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function entry(
  year: number,
  month: number,
  invested: number,
  value: number | null,
  id = -1
): EntryDTO {
  return {
    id,
    year,
    month,
    day: daysInMonth(year, month),
    label: labelFor(year, month),
    invested,
    value,
    note: "",
  }
}

const p1: PortfolioDTO = {
  id: 1,
  name: "Growth",
  color: "#3B82F6",
  targetMonthlyContribution: 300,
  startingValue: 0,
  startingDate: null,
  entries: [
    entry(2024, 1, 1000, 800),
    entry(2024, 2, 500, 1400),
    entry(2024, 3, 500, 2100),
  ],
}

const p2: PortfolioDTO = {
  id: 2,
  name: "Bonds",
  color: "#10B981",
  targetMonthlyContribution: 200,
  startingValue: 0,
  startingDate: null,
  entries: [
    entry(2024, 1, 500, 550),
    entry(2024, 2, 500, 1100),
    entry(2024, 3, 200, 900),
  ],
}

const pureGrowthPortfolio: PortfolioDTO = {
  id: 3,
  name: "Pure Growth",
  color: "#F59E0B",
  targetMonthlyContribution: 0,
  startingValue: 0,
  startingDate: null,
  entries: [
    entry(2024, 1, 1000, 1000),
    entry(2024, 2, 0, 1010),
    entry(2024, 3, 0, 1020),
    entry(2024, 4, 0, 1030),
    entry(2024, 5, 0, 1040),
    entry(2024, 6, 0, 1050),
  ],
}

const emptyPortfolio: PortfolioDTO = {
  id: 4,
  name: "Empty",
  color: "#6B7280",
  targetMonthlyContribution: 100,
  startingValue: 0,
  startingDate: null,
  entries: [],
}

// ---------------------------------------------------------------------------
// aggregatePortfolios
// ---------------------------------------------------------------------------

describe("aggregatePortfolios", () => {
  it("UNIT-CALC-001 — empty list returns sentinel", () => {
    const result = aggregatePortfolios([])
    expect(result).toEqual({
      id: 0,
      name: "Combined",
      color: "#1F2937",
      targetMonthlyContribution: 0,
      startingValue: 0,
      startingDate: null,
      entries: [],
    })
  })

  it("UNIT-CALC-002 — single portfolio is passthrough (values)", () => {
    const result = aggregatePortfolios([p1])
    expect(result.id).toBe(0)
    expect(result.entries.length).toBe(3)
    expect(result.entries[0]).toMatchObject({
      invested: 1000,
      value: 800,
    })
    expect(result.entries[2]).toMatchObject({
      invested: 500,
      value: 2100,
    })
  })

  it("UNIT-CALC-003 — two portfolios sum numeric fields", () => {
    const result = aggregatePortfolios([p1, p2])
    expect(result.entries[0]).toMatchObject({
      invested: 1500,
      value: 1350,
    })
    expect(result.entries[1]).toMatchObject({
      invested: 1000,
      value: 2500,
    })
    expect(result.entries[2]).toMatchObject({
      invested: 700,
      value: 3000,
    })
  })

  it("UNIT-CALC-004 — targetMonthlyContribution is summed", () => {
    expect(aggregatePortfolios([p1, p2]).targetMonthlyContribution).toBe(500)
  })

  it("UNIT-CALC-005 — year/month/label resolve to bucketed identity", () => {
    const result = aggregatePortfolios([p1, p2])
    expect(result.entries[0]).toMatchObject({
      year: 2024,
      month: 1,
      label: "Jan 24",
    })
  })

  it("UNIT-CALC-006 — id is always COMBINED_PORTFOLIO_ID (0)", () => {
    expect(aggregatePortfolios([p1]).id).toBe(COMBINED_PORTFOLIO_ID)
    expect(COMBINED_PORTFOLIO_ID).toBe(0)
  })

  it("UNIT-CALC-006b — portfolios with different histories still bucket correctly", () => {
    // Late-starting portfolio: only Feb-Mar 2024
    const late: PortfolioDTO = {
      id: 9,
      name: "Late",
      color: "#000",
      targetMonthlyContribution: 0,
      startingValue: 0,
      startingDate: null,
      entries: [entry(2024, 2, 100, 250), entry(2024, 3, 100, 400)],
    }
    const result = aggregatePortfolios([p1, late])
    expect(result.entries.length).toBe(3)
    // Jan only has p1 contribution
    expect(result.entries[0]).toMatchObject({
      year: 2024,
      month: 1,
      value: 800,
    })
    // Feb sums both
    expect(result.entries[1]).toMatchObject({
      year: 2024,
      month: 2,
      value: 1650,
    })
    expect(result.entries[2]).toMatchObject({
      year: 2024,
      month: 3,
      value: 2500,
    })
  })

  it("UNIT-CALC-006c — bucketing handles different start years", () => {
    const a: PortfolioDTO = {
      id: 10,
      name: "Old",
      color: "#000",
      targetMonthlyContribution: 0,
      startingValue: 0,
      startingDate: null,
      entries: [entry(2023, 12, 100, 100), entry(2024, 1, 100, 200)],
    }
    const b: PortfolioDTO = {
      id: 11,
      name: "New",
      color: "#000",
      targetMonthlyContribution: 0,
      startingValue: 0,
      startingDate: null,
      entries: [entry(2024, 1, 50, 70), entry(2024, 2, 50, 150)],
    }
    const result = aggregatePortfolios([a, b])
    expect(result.entries.map((e) => `${e.year}-${e.month}`)).toEqual([
      "2023-12",
      "2024-1",
      "2024-2",
    ])
    expect(result.entries[1]).toMatchObject({ invested: 150, value: 270 })
  })
})

// ---------------------------------------------------------------------------
// computeKPIs
// ---------------------------------------------------------------------------

describe("computeKPIs", () => {
  it("UNIT-CALC-007 — empty portfolio returns zero KPIs", () => {
    expect(computeKPIs(emptyPortfolio)).toEqual({
      value: 0,
      invested: 0,
      gain: 0,
      gainPct: 0,
      cagr: 0,
    })
  })

  it("UNIT-CALC-008 — value is last entry's value (not sum)", () => {
    expect(computeKPIs(p1).value).toBe(2100)
  })

  it("UNIT-CALC-009 — invested is cumulative sum of all entries", () => {
    expect(computeKPIs(p1).invested).toBe(2000)
  })

  it("UNIT-CALC-010 — gain and gainPct", () => {
    const kpis = computeKPIs(p1)
    expect(kpis.gain).toBe(100)
    expect(kpis.gainPct).toBeCloseTo(5.0, 1)
  })

  it("UNIT-CALC-012 — cagr with 3 entries (quarter-year)", () => {
    const expected = (Math.pow(2100 / 2000, 1 / 0.25) - 1) * 100
    expect(computeKPIs(p1).cagr).toBeCloseTo(expected, 1)
  })

  it("UNIT-CALC-013 — gainPct is 0 when invested is 0", () => {
    const portfolio: PortfolioDTO = {
      id: 5,
      name: "ZeroInvested",
      color: "#000",
      targetMonthlyContribution: 0,
      startingValue: 0,
      startingDate: null,
      entries: [entry(2024, 1, 0, 500)],
    }
    expect(computeKPIs(portfolio).gainPct).toBe(0)
  })

  it("UNIT-CALC-014 — cagr is 0 when invested is 0", () => {
    const portfolio: PortfolioDTO = {
      id: 5,
      name: "ZeroInvested",
      color: "#000",
      targetMonthlyContribution: 0,
      startingValue: 0,
      startingDate: null,
      entries: [entry(2024, 1, 0, 500)],
    }
    expect(computeKPIs(portfolio).cagr).toBe(0)
  })

  it("UNIT-CALC-015 — value=0 uses Math.max(value,1) in cagr denominator — result is finite", () => {
    const portfolio: PortfolioDTO = {
      id: 5,
      name: "ZeroValue",
      color: "#000",
      targetMonthlyContribution: 0,
      startingValue: 0,
      startingDate: null,
      entries: [entry(2024, 1, 100, 0)],
    }
    const cagr = computeKPIs(portfolio).cagr
    expect(isFinite(cagr)).toBe(true)
    expect(isNaN(cagr)).toBe(false)
    // With Math.max(0,1)/100 = 1/100 over 1 month (1/12 year), CAGR ≈ -100%
    expect(cagr).toBeCloseTo(-100, 0)
  })
})

// ---------------------------------------------------------------------------
// historicalAnnualReturn
// ---------------------------------------------------------------------------

describe("historicalAnnualReturn", () => {
  it("UNIT-CALC-016 — fewer than 6 entries returns 7", () => {
    const fiveEntries = [
      entry(2024, 1, 1000, 1000),
      entry(2024, 2, 0, 1010),
      entry(2024, 3, 0, 1020),
      entry(2024, 4, 0, 1030),
      entry(2024, 5, 0, 1040),
    ]
    expect(historicalAnnualReturn(fiveEntries)).toBe(7)
  })

  it("UNIT-CALC-017 — exactly 6 entries computes from data (~12.42)", () => {
    const result = historicalAnnualReturn(pureGrowthPortfolio.entries)
    expect(result).toBeCloseTo(12.42, 0)
  })

  it("UNIT-CALC-018 — skips periods where effective value is zero or negative — result is finite", () => {
    const entries: EntryDTO[] = [
      entry(2024, 1, 1000, 1000),
      entry(2024, 2, 0, 0), // eff = 0 + 0*0.5 = 0 → skip
      entry(2024, 3, 0, 0), // eff = 0 + 0*0.5 = 0 → skip
      entry(2024, 4, 0, 1000),
      entry(2024, 5, 0, 1010),
      entry(2024, 6, 0, 1020),
    ]
    const result = historicalAnnualReturn(entries)
    expect(isFinite(result)).toBe(true)
    expect(isNaN(result)).toBe(false)
  })

  it("UNIT-CALC-019 — all entries have zero effective value returns fallback (~7.44)", () => {
    const entries: EntryDTO[] = Array.from({ length: 6 }, (_, i) =>
      entry(2024, i + 1, 0, 0)
    )
    const expected = (Math.pow(1.006, 12) - 1) * 100
    const result = historicalAnnualReturn(entries)
    expect(result).toBeCloseTo(expected, 2)
  })
})

// ---------------------------------------------------------------------------
// historicalAnnualReturnWithSource
// ---------------------------------------------------------------------------

describe("historicalAnnualReturnWithSource", () => {
  it("UNIT-CALC-019a — fewer than 6 entries is flagged assumed (value 7)", () => {
    const fiveEntries = [
      entry(2024, 1, 1000, 1000),
      entry(2024, 2, 0, 1010),
      entry(2024, 3, 0, 1020),
      entry(2024, 4, 0, 1030),
      entry(2024, 5, 0, 1040),
    ]
    const result = historicalAnnualReturnWithSource(fiveEntries)
    expect(result.source).toBe("assumed")
    expect(result.value).toBe(7)
  })

  it("UNIT-CALC-019b — enough real return history is flagged derived", () => {
    const result = historicalAnnualReturnWithSource(pureGrowthPortfolio.entries)
    expect(result.source).toBe("derived")
    expect(result.value).toBeCloseTo(12.42, 0)
  })

  it("UNIT-CALC-019c — all monthly returns unusable is flagged assumed", () => {
    const entries: EntryDTO[] = Array.from({ length: 6 }, (_, i) =>
      entry(2024, i + 1, 0, 0)
    )
    const result = historicalAnnualReturnWithSource(entries)
    expect(result.source).toBe("assumed")
  })

  it("UNIT-CALC-019d — value matches historicalAnnualReturn for the same input", () => {
    const entries = pureGrowthPortfolio.entries
    expect(historicalAnnualReturnWithSource(entries).value).toBe(
      historicalAnnualReturn(entries)
    )
  })
})

// ---------------------------------------------------------------------------
// projectFuture
// ---------------------------------------------------------------------------

describe("projectFuture", () => {
  it("UNIT-CALC-020 — zero years returns empty array", () => {
    expect(
      projectFuture({
        startValue: 5000,
        monthlySaving: 500,
        years: 0,
        annualReturn: 7,
      })
    ).toEqual([])
  })

  it("UNIT-CALC-021 — output length matches years * 12", () => {
    const result = projectFuture({
      startValue: 0,
      monthlySaving: 1000,
      years: 1,
      annualReturn: 12,
    })
    expect(result.length).toBe(12)
  })

  it("UNIT-CALC-022 — month index starts at 1", () => {
    const result = projectFuture({
      startValue: 0,
      monthlySaving: 1000,
      years: 1,
      annualReturn: 12,
    })
    expect(result[0].month).toBe(1)
  })

  it("UNIT-CALC-023 — value at month 12 with 1%/month (12% annual) ≈ 12682.50", () => {
    const result = projectFuture({
      startValue: 0,
      monthlySaving: 1000,
      years: 1,
      annualReturn: 12,
    })
    expect(result[11].value).toBeCloseTo(12682.5, 1)
  })

  it("UNIT-CALC-024 — invested tracks cumulative monthly saving", () => {
    const result = projectFuture({
      startValue: 0,
      monthlySaving: 1000,
      years: 1,
      annualReturn: 12,
    })
    expect(result[11].invested).toBe(12000)
  })

  it("UNIT-CALC-025 — real adjusts for inflation", () => {
    const result = projectFuture({
      startValue: 0,
      monthlySaving: 1000,
      years: 1,
      annualReturn: 12,
      inflation: 6,
    })
    // nominal month-12 value deflated by (1 + 6/100/12)^12
    const nominal = result[11].value
    const deflator = Math.pow(1 + 6 / 100 / 12, 12)
    const expectedReal = nominal / deflator
    expect(result[11].real).toBeCloseTo(expectedReal, 2)
    expect(result[11].real).toBeCloseTo(11945.72, 1)
  })

  it("UNIT-CALC-026 — real equals value when inflation is 0 (default)", () => {
    const result = projectFuture({
      startValue: 1000,
      monthlySaving: 0,
      years: 1,
      annualReturn: 6,
    })
    for (const p of result) {
      expect(p.real).toBe(p.value)
    }
  })

  it("UNIT-CALC-027 — zero monthlySaving and zero annualReturn keeps value at startValue", () => {
    const result = projectFuture({
      startValue: 5000,
      monthlySaving: 0,
      years: 2,
      annualReturn: 0,
    })
    for (const p of result) {
      expect(p.value).toBeCloseTo(5000, 5)
      expect(p.invested).toBeCloseTo(5000, 5)
    }
  })

  it("UNIT-CALC-028 — startValue included in initial invested", () => {
    const result = projectFuture({
      startValue: 10000,
      monthlySaving: 500,
      years: 1,
      annualReturn: 7,
    })
    expect(result[0].invested).toBe(10500)
  })
})

// ---------------------------------------------------------------------------
// requiredMonthlyInvestment
// ---------------------------------------------------------------------------

describe("requiredMonthlyInvestment", () => {
  it("UNIT-CALC-029 — standard case ≈ 461.64", () => {
    const result = requiredMonthlyInvestment({
      goalValue: 100000,
      startValue: 10000,
      years: 10,
      annualReturn: 7,
    })
    expect(result).toBeCloseTo(461.64, 1)
  })

  it("UNIT-CALC-030 — zero interest rate uses linear formula ≈ 833.33", () => {
    const result = requiredMonthlyInvestment({
      goalValue: 50000,
      startValue: 0,
      years: 5,
      annualReturn: 0,
    })
    expect(result).toBeCloseTo(833.33, 1)
  })

  it("UNIT-CALC-031 — goal already reachable returns 0", () => {
    const result = requiredMonthlyInvestment({
      goalValue: 5000,
      startValue: 200000,
      years: 5,
      annualReturn: 7,
    })
    expect(result).toBe(0)
  })

  it("UNIT-CALC-032 — fractional years are supported", () => {
    const result = requiredMonthlyInvestment({
      goalValue: 12000,
      startValue: 0,
      years: 0.5,
      annualReturn: 0,
    })
    expect(result).toBeCloseTo(2000, 1)
  })
})

// ---------------------------------------------------------------------------
// COMBINED_PORTFOLIO_ID constant
// ---------------------------------------------------------------------------

describe("COMBINED_PORTFOLIO_ID", () => {
  it("UNIT-CALC-033 — COMBINED_PORTFOLIO_ID export value is 0", () => {
    expect(COMBINED_PORTFOLIO_ID).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// totalDividends / dividendsByMonth — derived from DividendEvents
// ---------------------------------------------------------------------------

function incomeEvent(
  id: number,
  portfolioId: number,
  holdingId: number | null,
  paidDate: string,
  amount: number,
  opts: { kind?: "dividend" | "interest"; tax?: number } = {}
): IncomeEventDTO {
  return {
    id,
    portfolioId,
    holdingId,
    holdingName: holdingId == null ? null : "Holding",
    holdingType: holdingId == null ? null : "etf",
    holdingIsin: null,
    paidDate,
    kind: opts.kind ?? "dividend",
    amount,
    tax: opts.tax ?? 0,
    sourceBroker: null,
    sourceTransactionId: null,
    note: "",
  }
}

describe("totalIncome", () => {
  const events: IncomeEventDTO[] = [
    incomeEvent(1, 1, 10, "2024-01-15", 100),
    incomeEvent(2, 1, 11, "2024-03-15", 50),
    incomeEvent(3, 2, 20, "2024-02-15", 75),
  ]

  it("UNIT-CALC-034 — sums dividend events when portfolioId omitted", () => {
    expect(totalIncome(events)).toBe(225)
  })

  it("UNIT-CALC-035 — combined sentinel (0) sums all portfolios", () => {
    expect(totalIncome(events, 0)).toBe(225)
  })

  it("UNIT-CALC-036 — scopes to a single portfolio", () => {
    expect(totalIncome(events, 1)).toBe(150)
    expect(totalIncome(events, 2)).toBe(75)
  })

  it("UNIT-CALC-037 — empty events returns 0", () => {
    expect(totalIncome([])).toBe(0)
  })

  it("UNIT-CALC-INCOME-001 — kind filter excludes interest from dividend total", () => {
    const mixed: IncomeEventDTO[] = [
      ...events,
      incomeEvent(4, 1, null, "2024-04-15", 10, { kind: "interest" }),
    ]
    expect(totalIncome(mixed, undefined, "dividend")).toBe(225)
    expect(totalIncome(mixed, undefined, "interest")).toBe(10)
    expect(totalIncome(mixed, undefined, "all")).toBe(235)
  })

  it("UNIT-CALC-INCOME-002 — net basis applies negative tax", () => {
    const e = incomeEvent(1, 1, 10, "2024-01-15", 100, { tax: -15 })
    expect(eventAmount(e, "gross")).toBe(100)
    expect(eventAmount(e, "net")).toBe(85)
  })
})

describe("incomeByMonth", () => {
  const events: IncomeEventDTO[] = [
    incomeEvent(1, 1, 10, "2024-01-15", 100),
    incomeEvent(2, 1, 11, "2024-01-20", 25), // same month → adds
    incomeEvent(3, 1, 10, "2024-03-15", 50),
    incomeEvent(4, 2, 20, "2024-01-15", 75),
  ]

  it("UNIT-CALC-038 — groups events by year-month within a portfolio", () => {
    const m = incomeByMonth(events, 1)
    expect(m.get("2024-1")).toBe(125)
    expect(m.get("2024-3")).toBe(50)
    expect(m.size).toBe(2)
  })

  it("UNIT-CALC-039 — combined sentinel includes all portfolios", () => {
    const m = incomeByMonth(events, 0)
    expect(m.get("2024-1")).toBe(200)
    expect(m.get("2024-3")).toBe(50)
  })

  it("UNIT-CALC-040 — empty events returns empty map", () => {
    expect(incomeByMonth([], 1).size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Null value handling — entries.value is nullable after migration 0009.
// "null" means "the user hasn't recorded a month-end portfolio value yet".
// ---------------------------------------------------------------------------

describe("latestKnownValue", () => {
  it("UNIT-CALC-041 — returns last entry's value when all are recorded", () => {
    const es = [entry(2024, 1, 100, 500), entry(2024, 2, 100, 700)]
    expect(latestKnownValue(es)).toBe(700)
  })

  it("UNIT-CALC-042 — walks back past trailing nulls to find latest known", () => {
    const es = [
      entry(2024, 1, 100, 500),
      entry(2024, 2, 100, 700),
      entry(2024, 3, 100, null),
      entry(2024, 4, 100, null),
    ]
    expect(latestKnownValue(es)).toBe(700)
  })

  it("UNIT-CALC-043 — returns null when every entry has null value", () => {
    const es = [entry(2024, 1, 100, null), entry(2024, 2, 100, null)]
    expect(latestKnownValue(es)).toBeNull()
  })

  it("UNIT-CALC-044 — returns null for empty input", () => {
    expect(latestKnownValue([])).toBeNull()
  })
})

describe("computeKPIs — null value handling", () => {
  it("UNIT-CALC-045 — uses latest known value when trailing months are null", () => {
    const p: PortfolioDTO = {
      id: 1,
      name: "P",
      color: "#000",
      targetMonthlyContribution: 0,
      startingValue: 0,
      startingDate: null,
      entries: [
        entry(2024, 1, 200, 1000),
        entry(2024, 2, 200, 1300),
        entry(2024, 3, 200, null), // imported, no value yet
      ],
    }
    const k = computeKPIs(p)
    // Latest known is 1300; invested = sum of contributions = 600.
    expect(k.value).toBe(1300)
    expect(k.invested).toBe(600)
    expect(k.gain).toBe(700)
  })

  it("UNIT-CALC-046 — falls back to startingValue when no entry has a recorded value", () => {
    const p: PortfolioDTO = {
      id: 1,
      name: "P",
      color: "#000",
      targetMonthlyContribution: 0,
      startingValue: 2500,
      startingDate: null,
      entries: [entry(2024, 1, 100, null), entry(2024, 2, 100, null)],
    }
    expect(computeKPIs(p).value).toBe(2500)
  })
})

describe("aggregatePortfolios — carry-forward & coverage", () => {
  it("UNIT-CALC-047 — a stopped portfolio's value is carried forward, not zeroed", () => {
    // A reports every month; B reports January only, then goes quiet.
    const a: PortfolioDTO = {
      id: 1,
      name: "A",
      color: "#000",
      targetMonthlyContribution: 0,
      startingValue: 0,
      startingDate: null,
      entries: [
        entry(2024, 1, 100, 1000),
        entry(2024, 2, 0, 1100),
        entry(2024, 3, 0, 1200),
      ],
    }
    const b: PortfolioDTO = {
      id: 2,
      name: "B",
      color: "#000",
      targetMonthlyContribution: 0,
      startingValue: 0,
      startingDate: null,
      entries: [entry(2024, 1, 100, 5000)],
    }
    const { portfolio, coverage } = aggregatePortfoliosWithCoverage([a, b])
    // B's 5000 holds across Feb/Mar instead of dropping to 0 → no false crash.
    expect(portfolio.entries.map((e) => e.value)).toEqual([6000, 6100, 6200])
    expect(coverage.map((c) => c.estimated)).toEqual([false, true, true])
    expect(coverage.map((c) => `${c.reported}/${c.started}`)).toEqual([
      "2/2",
      "1/2",
      "1/2",
    ])
  })

  it("UNIT-CALC-049 — interior null entry carries the prior value forward", () => {
    // A has a Feb row with no recorded value (e.g. a deposit-only month).
    const a: PortfolioDTO = {
      id: 1,
      name: "A",
      color: "#000",
      targetMonthlyContribution: 0,
      startingValue: 0,
      startingDate: null,
      entries: [
        entry(2024, 1, 100, 500),
        entry(2024, 2, 100, null),
        entry(2024, 3, 100, 700),
      ],
    }
    const b: PortfolioDTO = {
      id: 2,
      name: "B",
      color: "#000",
      targetMonthlyContribution: 0,
      startingValue: 0,
      startingDate: null,
      entries: [
        entry(2024, 1, 100, 300),
        entry(2024, 2, 100, 320),
        entry(2024, 3, 100, 340),
      ],
    }
    const { portfolio, coverage } = aggregatePortfoliosWithCoverage([a, b])
    // Feb: A carried 500, B fresh 320 → 820, flagged estimated (1 of 2 fresh).
    const feb = portfolio.entries.find((e) => e.month === 2)!
    expect(feb.value).toBe(820)
    expect(coverage[1]).toMatchObject({
      reported: 1,
      started: 2,
      estimated: true,
    })
  })

  it("UNIT-CALC-050 — leading gap contributes nothing (no phantom carry-forward)", () => {
    // B starts in Feb; Jan must be A-only — B has no value to carry into Jan.
    const a: PortfolioDTO = {
      id: 1,
      name: "A",
      color: "#000",
      targetMonthlyContribution: 0,
      startingValue: 0,
      startingDate: null,
      entries: [entry(2024, 1, 100, 1000), entry(2024, 2, 100, 1100)],
    }
    const b: PortfolioDTO = {
      id: 2,
      name: "B",
      color: "#000",
      targetMonthlyContribution: 0,
      startingValue: 0,
      startingDate: null,
      entries: [entry(2024, 2, 100, 200)],
    }
    const { portfolio, coverage } = aggregatePortfoliosWithCoverage([a, b])
    const jan = portfolio.entries.find((e) => e.month === 1)!
    expect(jan.value).toBe(1000)
    expect(coverage[0]).toMatchObject({
      started: 1,
      reported: 1,
      carried: 0,
      estimated: false,
    })
    const feb = portfolio.entries.find((e) => e.month === 2)!
    expect(feb.value).toBe(1300)
  })

  it("UNIT-CALC-051 — all-null leading month keeps combined value null", () => {
    const a: PortfolioDTO = {
      id: 1,
      name: "A",
      color: "#000",
      targetMonthlyContribution: 0,
      startingValue: 0,
      startingDate: null,
      entries: [entry(2024, 1, 100, null), entry(2024, 2, 100, 500)],
    }
    const { portfolio, coverage } = aggregatePortfoliosWithCoverage([a])
    expect(portfolio.entries[0].value).toBeNull() // nobody has reported yet
    expect(coverage[0].started).toBe(0)
    expect(portfolio.entries[1].value).toBe(500)
  })

  it("UNIT-CALC-052 — stale lists portfolios whose latest value predates the combined end", () => {
    const a: PortfolioDTO = {
      id: 1,
      name: "Continuing",
      color: "#aaa",
      targetMonthlyContribution: 0,
      startingValue: 0,
      startingDate: null,
      entries: [
        entry(2024, 1, 100, 1000),
        entry(2024, 2, 0, 1100),
        entry(2024, 3, 0, 1200),
      ],
    }
    const b: PortfolioDTO = {
      id: 2,
      name: "Quiet",
      color: "#bbb",
      targetMonthlyContribution: 0,
      startingValue: 0,
      startingDate: null,
      entries: [entry(2024, 1, 100, 5000)],
    }
    const { stale } = aggregatePortfoliosWithCoverage([a, b])
    expect(stale).toHaveLength(1)
    expect(stale[0]).toMatchObject({
      id: 2,
      name: "Quiet",
      lastYear: 2024,
      lastMonth: 1,
    })
  })

  it("UNIT-CALC-053 — no stale entries when every portfolio reports the latest month", () => {
    expect(aggregatePortfoliosWithCoverage([p1, p2]).stale).toEqual([])
  })
})

describe("historicalAnnualReturn — null value handling", () => {
  it("UNIT-CALC-048 — skips month pairs where either endpoint is null", () => {
    // Six clean months establish a return; inserting a null between two
    // valid endpoints just removes one data point — should not crash.
    const es = [
      entry(2024, 1, 100, 1000),
      entry(2024, 2, 100, 1110),
      entry(2024, 3, 100, null),
      entry(2024, 4, 100, 1340),
      entry(2024, 5, 100, 1460),
      entry(2024, 6, 100, 1590),
    ]
    const r = historicalAnnualReturn(es)
    expect(Number.isFinite(r)).toBe(true)
  })
})
