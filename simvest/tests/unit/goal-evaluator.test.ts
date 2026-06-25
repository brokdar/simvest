import { describe, it, expect } from "vitest"
import { createGoalEvaluator } from "@/lib/goal-evaluator"
import type {
  GoalDTO,
  IncomeEventDTO,
  PortfolioDTO,
  SettingsDTO,
} from "@/lib/types"
import { COMBINED_PORTFOLIO_ID } from "@/lib/types"
import { labelFor } from "@/lib/types"

function makeSettings(overrides: Partial<SettingsDTO> = {}): SettingsDTO {
  return {
    id: 1,
    inflation: 2,
    conservativeReturn: 4,
    optimisticReturn: 8,
    monthlySaving: 1000,
    horizonYears: 20,
    defaultEntryDay: "last",
    defaultSwr: 4,
    dividendBasis: "gross",
    locale: null,
    ...overrides,
  }
}

function makePortfolio(
  id: number,
  entries: Array<{
    year: number
    month: number
    invested: number
    value: number | null
  }>,
  overrides: Partial<PortfolioDTO> = {}
): PortfolioDTO {
  return {
    id,
    name: `P${id}`,
    color: "#000",
    targetMonthlyContribution: 500,
    startingValue: 0,
    startingDate: null,
    entries: entries.map((e, i) => ({
      id: id * 1000 + i,
      year: e.year,
      month: e.month,
      day: 28,
      label: labelFor(e.year, e.month),
      invested: e.invested,
      value: e.value,
      note: "",
    })),
    ...overrides,
  }
}

function makeGoal(overrides: Partial<GoalDTO> = {}): GoalDTO {
  return {
    id: 1,
    name: "G1",
    color: "#000",
    kind: "portfolio_value",
    scope: "combined",
    portfolioId: null,
    target: 100000,
    targetYear: new Date().getFullYear() + 10,
    swr: null,
    yieldAssumed: null,
    ...overrides,
  }
}

const monthlySavingFromPortfolios =
  (portfolios: PortfolioDTO[]) => (id: number) => {
    if (id === COMBINED_PORTFOLIO_ID) {
      return portfolios.reduce((s, p) => s + p.targetMonthlyContribution, 0)
    }
    return portfolios.find((p) => p.id === id)?.targetMonthlyContribution ?? 0
  }

describe("createGoalEvaluator", () => {
  it("UNIT-GOAL-EVAL-001 — evaluate(combinedGoal) picks summed monthly saving from context", () => {
    const portfolios = [
      makePortfolio(1, [
        { year: 2024, month: 1, invested: 10000, value: 12000 },
      ]),
      makePortfolio(2, [{ year: 2024, month: 1, invested: 5000, value: 5500 }]),
    ]
    const ev = createGoalEvaluator({
      portfolios,
      incomeEvents: [],
      settings: makeSettings(),
      monthlySaving: monthlySavingFromPortfolios(portfolios),
    })

    const result = ev.evaluate(
      makeGoal({ scope: "combined", portfolioId: null })
    )

    expect(result.monthlySaving).toBe(1000)
    expect(result.scopedKpiValue).toBe(17500)
  })

  it("UNIT-GOAL-EVAL-002 — evaluate(portfolioGoal) picks per-portfolio saving and scoped KPI", () => {
    const portfolios = [
      makePortfolio(1, [
        { year: 2024, month: 1, invested: 10000, value: 12000 },
      ]),
      makePortfolio(
        2,
        [{ year: 2024, month: 1, invested: 5000, value: 5500 }],
        {
          targetMonthlyContribution: 250,
        }
      ),
    ]
    const ev = createGoalEvaluator({
      portfolios,
      incomeEvents: [],
      settings: makeSettings(),
      monthlySaving: monthlySavingFromPortfolios(portfolios),
    })

    const result = ev.evaluate(makeGoal({ scope: "portfolio", portfolioId: 2 }))

    expect(result.monthlySaving).toBe(250)
    expect(result.scopedKpiValue).toBe(5500)
  })

  it("UNIT-GOAL-EVAL-003 — evaluate works on a draft goal that is not in goals[]", () => {
    const portfolios = [
      makePortfolio(1, [
        { year: 2024, month: 1, invested: 10000, value: 12000 },
      ]),
    ]
    const ev = createGoalEvaluator({
      portfolios,
      incomeEvents: [],
      settings: makeSettings(),
      monthlySaving: monthlySavingFromPortfolios(portfolios),
    })

    // A scratch goal with id=-1 (not in any storage) must still evaluate.
    const draft = makeGoal({ id: -1, target: 999_999 })
    const result = ev.evaluate(draft)

    expect(result.currentValue).toBe(12000)
    expect(result.targetValue).toBe(999_999)
    expect(result.pct).toBeGreaterThanOrEqual(0)
  })

  it("UNIT-GOAL-EVAL-010 — estimateYield combined scope derives from trailing-12m income on aggregate value", () => {
    const portfolios = [
      makePortfolio(1, [
        { year: 2024, month: 1, invested: 100000, value: 100000 },
      ]),
    ]
    const incomeEvents: IncomeEventDTO[] = [
      {
        id: 1,
        portfolioId: 1,
        holdingId: 1,
        holdingName: "X",
        holdingType: "stock",
        holdingIsin: null,
        paidDate: new Date().toISOString().slice(0, 10),
        kind: "dividend",
        amount: 2500,
        tax: 0,
        note: "",
        sourceBroker: null,
        sourceTransactionId: null,
      },
    ]
    const ev = createGoalEvaluator({
      portfolios,
      incomeEvents,
      settings: makeSettings(),
      monthlySaving: monthlySavingFromPortfolios(portfolios),
    })

    const y = ev.estimateYield({ scope: "combined" })

    expect(y.source).toBe("derived")
    expect(y.value).toBeCloseTo(2.5, 1)
  })

  it("UNIT-GOAL-EVAL-011 — estimateYield falls back to 2.5% when no income / no value", () => {
    const ev = createGoalEvaluator({
      portfolios: [makePortfolio(1, [])],
      incomeEvents: [],
      settings: makeSettings(),
      monthlySaving: () => 0,
    })

    const y = ev.estimateYield({ scope: "combined" })

    expect(y.source).toBe("fallback")
    expect(y.value).toBe(2.5)
  })

  it("UNIT-GOAL-EVAL-012 — estimateYield prefers user override when supplied", () => {
    const ev = createGoalEvaluator({
      portfolios: [
        makePortfolio(1, [
          { year: 2024, month: 1, invested: 100000, value: 100000 },
        ]),
      ],
      incomeEvents: [],
      settings: makeSettings(),
      monthlySaving: () => 0,
    })

    const y = ev.estimateYield({ scope: "combined", override: 6 })

    expect(y.source).toBe("override")
    expect(y.value).toBe(6)
  })

  it("UNIT-GOAL-EVAL-020 — kpis(scope=combined) aggregates across all portfolios", () => {
    const portfolios = [
      makePortfolio(1, [
        { year: 2024, month: 1, invested: 10000, value: 12000 },
      ]),
      makePortfolio(2, [{ year: 2024, month: 1, invested: 5000, value: 5500 }]),
    ]
    const ev = createGoalEvaluator({
      portfolios,
      incomeEvents: [],
      settings: makeSettings(),
      monthlySaving: monthlySavingFromPortfolios(portfolios),
    })

    const combined = ev.kpis("combined")

    expect(combined.value).toBe(17500)
    expect(combined.invested).toBe(15000)
  })

  it("UNIT-GOAL-EVAL-021 — kpis(scope=portfolioId) returns that portfolio's KPIs", () => {
    const portfolios = [
      makePortfolio(1, [
        { year: 2024, month: 1, invested: 10000, value: 12000 },
      ]),
      makePortfolio(2, [{ year: 2024, month: 1, invested: 5000, value: 5500 }]),
    ]
    const ev = createGoalEvaluator({
      portfolios,
      incomeEvents: [],
      settings: makeSettings(),
      monthlySaving: monthlySavingFromPortfolios(portfolios),
    })

    expect(ev.kpis(2).value).toBe(5500)
  })

  it("UNIT-GOAL-EVAL-022 — kpis(COMBINED_PORTFOLIO_ID) is treated as combined", () => {
    const portfolios = [
      makePortfolio(1, [
        { year: 2024, month: 1, invested: 10000, value: 12000 },
      ]),
      makePortfolio(2, [{ year: 2024, month: 1, invested: 5000, value: 5500 }]),
    ]
    const ev = createGoalEvaluator({
      portfolios,
      incomeEvents: [],
      settings: makeSettings(),
      monthlySaving: monthlySavingFromPortfolios(portfolios),
    })

    expect(ev.kpis(COMBINED_PORTFOLIO_ID).value).toBe(17500)
  })

  it("UNIT-GOAL-EVAL-023 — historicalReturn(scope) returns annualized return for the scope", () => {
    // 1% per month growth on flat 10k invested → ~12.7% annualized.
    const portfolios = [
      makePortfolio(
        1,
        Array.from({ length: 12 }, (_, i) => ({
          year: 2023,
          month: i + 1,
          invested: 0,
          value: 10000 * Math.pow(1.01, i + 1),
        })),
        { startingValue: 10000 }
      ),
    ]
    const ev = createGoalEvaluator({
      portfolios,
      incomeEvents: [],
      settings: makeSettings(),
      monthlySaving: () => 0,
    })

    const r = ev.historicalReturn(1)
    expect(Number.isFinite(r)).toBe(true)
    expect(r).toBeGreaterThan(10)
    expect(r).toBeLessThan(15)
  })

  it("UNIT-GOAL-EVAL-023a — historicalReturnWithSource flags a thin record as assumed", () => {
    const portfolios = [
      makePortfolio(1, [
        { year: 2024, month: 1, invested: 1000, value: 1000 },
        { year: 2024, month: 2, invested: 0, value: 1010 },
      ]),
    ]
    const ev = createGoalEvaluator({
      portfolios,
      incomeEvents: [],
      settings: makeSettings(),
      monthlySaving: () => 0,
    })

    const r = ev.historicalReturnWithSource(1)
    expect(r.source).toBe("assumed")
    expect(r.value).toBe(ev.historicalReturn(1))
  })

  it("UNIT-GOAL-EVAL-030 — annual_income inflatedTargetValue exceeds targetValue when inflation > 0 and years > 0", () => {
    // Contract guarded by issue #13 Bug 1: the Planning "Inflated income" tile
    // must read evaluation.inflatedTargetValue, which compounds the nominal
    // target by inflation over the years to target.
    const portfolios = [
      makePortfolio(1, [
        { year: 2024, month: 1, invested: 100000, value: 100000 },
      ]),
    ]
    const ev = createGoalEvaluator({
      portfolios,
      incomeEvents: [],
      settings: makeSettings({ inflation: 2 }),
      monthlySaving: () => 0,
    })
    const targetYear = new Date().getFullYear() + 10
    const result = ev.evaluate(
      makeGoal({ kind: "annual_income", target: 40000, targetYear, swr: 4 })
    )

    expect(result.targetValue).toBe(40000)
    expect(result.inflatedTargetValue).toBeGreaterThan(result.targetValue)
    // 40000 * 1.02^10 ≈ 48759.79
    expect(result.inflatedTargetValue).toBeCloseTo(40000 * 1.02 ** 10, 1)
  })

  it("UNIT-GOAL-EVAL-031 — annual_income inflatedTargetValue equals targetValue when inflation is 0", () => {
    const portfolios = [
      makePortfolio(1, [
        { year: 2024, month: 1, invested: 100000, value: 100000 },
      ]),
    ]
    const ev = createGoalEvaluator({
      portfolios,
      incomeEvents: [],
      settings: makeSettings({ inflation: 0 }),
      monthlySaving: () => 0,
    })
    const targetYear = new Date().getFullYear() + 10
    const result = ev.evaluate(
      makeGoal({ kind: "annual_income", target: 40000, targetYear, swr: 4 })
    )

    expect(result.inflatedTargetValue).toBe(result.targetValue)
  })
})
