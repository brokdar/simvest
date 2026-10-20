import { describe, it, expect } from "vitest"
import {
  createGoalEvaluator,
  goalVerdict,
  planningTrajectories,
} from "@/lib/goal-evaluator"
import { evaluateGoal } from "@/lib/calc"
import type { GoalDTO, PortfolioDTO, SettingsDTO } from "@/lib/types"
import { labelFor } from "@/lib/types"
import { fmtEUR } from "@/lib/format"

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

// Three years of steady growth: ~€40k today, €500/mo contribution.
const portfolio: PortfolioDTO = {
  id: 1,
  name: "P1",
  color: "#000",
  targetMonthlyContribution: 500,
  startingValue: 0,
  startingDate: null,
  entries: Array.from({ length: 36 }, (_, i) => {
    const year = 2023 + Math.floor(i / 12)
    const month = (i % 12) + 1
    return {
      id: i + 1,
      year,
      month,
      day: 28,
      label: labelFor(year, month),
      invested: 500,
      value: Math.round(20_000 * Math.pow(1.006, i) + 500 * i),
      note: "",
    }
  }),
}

// Far out of reach at €500/mo: €5M by 10 years from now.
const behindGoal: GoalDTO = {
  id: 7,
  name: "Way behind",
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

const ctx = {
  portfolios: [portfolio],
  incomeEvents: [],
  settings,
  monthlySaving: () => 500,
}

describe("goal verdict — Overview and Planning agree (P5)", () => {
  it("both surfaces derive the same 'Behind' verdict for a goal that is behind", () => {
    // Overview: DataProvider.goalEvals → GoalProgressStrip → goalVerdict.
    const evaluator = createGoalEvaluator(ctx)
    const overview = goalVerdict(evaluator.evaluate(behindGoal))
    // Planning: workspace evaluates its local copy of the same goal (and the
    // goal tile reads the provider's goalEvals) → goalVerdict.
    const planningWorkspace = goalVerdict(evaluator.evaluate({ ...behindGoal }))
    const direct = goalVerdict(
      evaluateGoal(behindGoal, { ...ctx, monthlySaving: 500 })
    )

    expect(overview.label).toBe("Behind")
    expect(overview.onTrack).toBe(false)
    expect(planningWorkspace).toEqual(overview)
    expect(direct).toEqual(overview)
  })

  it("the trajectory's current-contribution line falls short while the solved line reaches the target", () => {
    const ev = createGoalEvaluator(ctx).evaluate(behindGoal)
    const t = planningTrajectories(ev, settings, 10)
    // The solved line hits the target by construction — that alone used to
    // drive "Target reached" on Planning while Overview said "Behind".
    expect(t.exp.at(-1)!.value).toBeGreaterThanOrEqual(
      ev.portfolioTargetValue * 0.99
    )
    // What actually happens at €500/mo agrees with the verdict.
    expect(t.current.at(-1)!.value).toBeLessThan(ev.portfolioTargetValue)
    expect(ev.monthlySaving).toBe(500)
    expect(ev.requiredMonthly).toBeGreaterThan(500)
  })

  it("an on-track goal reads 'On track' with its projected year", () => {
    const easy = { ...behindGoal, target: 50_000 }
    const v = goalVerdict(createGoalEvaluator(ctx).evaluate(easy))
    expect(v.label).toBe("On track")
    expect(v.text).toMatch(/^On track · reaches \d{4}$/)
  })

  it("UNIT-VERDICT-T2-001 — a behind goal leads with the fix and never says 'not within 40y'", () => {
    const ev = createGoalEvaluator(ctx).evaluate(behindGoal)
    const v = goalVerdict(ev, behindGoal.targetYear)
    expect(v.label).toBe("Behind")
    expect(v.fix).toMatch(
      new RegExp(
        `^€[\\d.,]+/mo more gets you there by ${behindGoal.targetYear}$`
      )
    )
    expect(v.fixShort).toMatch(/^€[\d.,]+\/mo more$/)
    expect(v.text.startsWith(v.fix!)).toBe(true)
    expect(v.text).not.toContain("40y")
    expect(v.text).not.toMatch(/^Behind/)
  })

  it("UNIT-VERDICT-T2-002 — an on-track goal has no fix", () => {
    const easy = { ...behindGoal, target: 50_000 }
    const v = goalVerdict(
      createGoalEvaluator(ctx).evaluate(easy),
      easy.targetYear
    )
    expect(v.fix).toBeNull()
    expect(v.fixShort).toBeNull()
  })

  it("UNIT-VERDICT-P7-001 — behind with money already going in: the fix states the monthly total", () => {
    const ev = createGoalEvaluator(ctx).evaluate(behindGoal)
    expect(ev.monthlySaving).toBe(500)
    const v = goalVerdict(ev, behindGoal.targetYear)
    expect(v.fixTotal).toBe(
      `${fmtEUR(ev.requiredMonthly, { decimals: 0 })}/mo in all`
    )
  })

  it("UNIT-VERDICT-P7-002 — behind at €0/mo: no 'in all' total, it would only repeat the fix", () => {
    const ev = createGoalEvaluator({ ...ctx, monthlySaving: () => 0 }).evaluate(
      behindGoal
    )
    expect(ev.monthlySaving).toBe(0)
    const v = goalVerdict(ev, behindGoal.targetYear)
    expect(v.fix).not.toBeNull()
    expect(v.fixTotal).toBeNull()
  })

  it("UNIT-VERDICT-P7-003 — on track: no total either", () => {
    const easy = { ...behindGoal, target: 50_000 }
    const v = goalVerdict(createGoalEvaluator(ctx).evaluate(easy))
    expect(v.fixTotal).toBeNull()
  })
})
