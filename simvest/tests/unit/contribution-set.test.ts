import { describe, it, expect } from "vitest"
import { portfolioRowToDTO } from "@/lib/db/mappers"
import {
  validatePortfolioCreate,
  validatePortfolioPatch,
} from "@/lib/validation/portfolio"
import { validateTransferFile } from "@/lib/validation/transfer-portfolio"
import { aggregatePortfolios } from "@/lib/calc"
import { createGoalEvaluator, goalVerdict } from "@/lib/goal-evaluator"
import type { Portfolio } from "@/lib/db/schema"
import type { GoalDTO, PortfolioDTO, SettingsDTO } from "@/lib/types"
import { labelFor } from "@/lib/types"

const row = (over: Partial<Portfolio> = {}): Portfolio => ({
  id: 1,
  name: "P",
  color: "#000",
  targetMonthlyContribution: 0,
  contributionSet: false,
  startingValue: 0,
  startingDate: null,
  createdAt: 0,
  ...over,
})

describe("contributionSet — DTO mapping", () => {
  it("UNIT-LO-CSET-001 — the row flag reaches the DTO in both states", () => {
    expect(portfolioRowToDTO(row(), []).contributionSet).toBe(false)
    expect(
      portfolioRowToDTO(row({ contributionSet: true }), []).contributionSet
    ).toBe(true)
  })

  it("UNIT-LO-CSET-002 — the combined portfolio is 'set' when any account is", () => {
    const a = portfolioRowToDTO(row({ id: 1 }), [])
    const b = portfolioRowToDTO(row({ id: 2, contributionSet: true }), [])
    expect(aggregatePortfolios([a]).contributionSet).toBe(false)
    expect(aggregatePortfolios([a, b]).contributionSet).toBe(true)
  })
})

describe("contributionSet — validation", () => {
  it("UNIT-LO-CSET-003 — create without a contribution is not set; with 0 it is", () => {
    const none = validatePortfolioCreate({ name: "P" })
    const zero = validatePortfolioCreate({
      name: "P",
      targetMonthlyContribution: 0,
    })
    expect(none.ok && none.data.contributionSet).toBe(false)
    expect(zero.ok && zero.data.contributionSet).toBe(true)
    expect(zero.ok && zero.data.targetMonthlyContribution).toBe(0)
  })

  it("UNIT-LO-CSET-004 — patching the contribution (even to 0) sets the flag", () => {
    const v = validatePortfolioPatch({ targetMonthlyContribution: 0 })
    expect(v.ok && v.data.contributionSet).toBe(true)
    const other = validatePortfolioPatch({ name: "Renamed" })
    expect(other.ok && other.data.contributionSet).toBeUndefined()
  })
})

describe("contributionSet — transfer file", () => {
  const file = (portfolio: Record<string, unknown>) => ({
    version: 1,
    kind: "simvest.portfolio",
    exportedAt: "2026-05-22T10:30:00Z",
    sourceAppVersion: "0.0.1",
    portfolio: {
      name: "P",
      color: "#1E40AF",
      startingValue: 0,
      startingDate: null,
      createdAt: 1,
      ...portfolio,
    },
    entries: [],
    holdings: [],
    incomeEvents: [],
    goals: [],
  })
  const flag = (portfolio: Record<string, unknown>) => {
    const r = validateTransferFile(file(portfolio))
    return r.ok ? r.data.portfolio.contributionSet : r.error
  }

  it("UNIT-LO-CSET-005 — a missing flag means set only when the contribution is above 0", () => {
    expect(flag({ targetMonthlyContribution: 250 })).toBe(true)
    expect(flag({ targetMonthlyContribution: 0 })).toBe(false)
  })

  it("UNIT-LO-CSET-006 — an explicit flag wins", () => {
    expect(flag({ targetMonthlyContribution: 0, contributionSet: true })).toBe(
      true
    )
  })
})

describe("contributionSet — goal copy", () => {
  const settings: SettingsDTO = {
    id: 1,
    inflation: 2,
    conservativeReturn: 4,
    optimisticReturn: 8,
    monthlySaving: 500,
    horizonYears: 20,
    defaultEntryDay: "last",
    defaultSwr: 4,
    dividendBasis: "gross",
    locale: null,
  }
  const portfolio: PortfolioDTO = {
    id: 1,
    name: "P1",
    color: "#000",
    targetMonthlyContribution: 0,
    contributionSet: false,
    startingValue: 0,
    startingDate: null,
    entries: Array.from({ length: 24 }, (_, i) => {
      const year = 2024 + Math.floor(i / 12)
      const month = (i % 12) + 1
      return {
        id: i + 1,
        year,
        month,
        day: 28,
        label: labelFor(year, month),
        invested: 0,
        value: 20_000 + i * 100,
        note: "",
      }
    }),
  }
  const goal: GoalDTO = {
    id: 1,
    name: "Big",
    color: "#1E40AF",
    kind: "portfolio_value",
    scope: "combined",
    portfolioId: null,
    target: 5_000_000,
    targetYear: new Date().getFullYear() + 10,
    swr: null,
    yieldAssumed: null,
    returnAssumed: null,
  }
  const evaluate = (set: boolean) =>
    createGoalEvaluator({
      portfolios: [portfolio],
      incomeEvents: [],
      settings,
      monthlySaving: () => 0,
      contributionSet: () => set,
    }).evaluate(goal)

  it("UNIT-LO-CSET-007 — never set: the verdict says 'no contribution set', not today's pace", () => {
    const v = goalVerdict(evaluate(false), goal.targetYear)
    expect(v.text).toContain("with no contribution set")
    expect(v.text).not.toContain("today’s pace")
    expect(v.text).not.toContain("€0")
  })

  it("UNIT-LO-CSET-008 — deliberate €0: the verdict keeps 'at today's pace'", () => {
    const v = goalVerdict(evaluate(true), goal.targetYear)
    expect(v.text).toContain("at today’s pace")
    expect(v.text).not.toContain("no contribution set")
  })

  it("UNIT-LO-CSET-009 — the evaluation carries the flag", () => {
    expect(evaluate(false).contributionSet).toBe(false)
    expect(evaluate(true).contributionSet).toBe(true)
  })
})
