import {
  aggregatePortfolios,
  computeKPIs,
  estimatedYield,
  evaluateGoal,
  historicalAnnualReturnWithSource,
  type GoalEvaluation,
  type KPIs,
  type ReturnEstimate,
  type YieldEstimate,
} from "./calc"
import type {
  GoalDTO,
  IncomeEventDTO,
  PortfolioDTO,
  SettingsDTO,
} from "./types"
import { COMBINED_PORTFOLIO_ID } from "./types"

/**
 * Inputs the evaluator needs to answer "where is this goal today and where
 * will it be by `targetYear`?". `monthlySaving(portfolioId)` returns the
 * sum-of-contributions for combined scope and the portfolio's own
 * contribution otherwise — same shape `DataProvider.effectiveMonthlySaving`
 * already exposes.
 */
export type GoalEvaluatorContext = {
  portfolios: PortfolioDTO[]
  incomeEvents: IncomeEventDTO[]
  settings: SettingsDTO
  monthlySaving: (portfolioId: number) => number
}

/** Scope sentinel used by `estimateYield`. */
export type EvaluatorScope = number | "combined"

export type GoalEvaluator = {
  /**
   * Evaluates a saved or draft `GoalDTO`. Picks the right `monthlySaving`
   * from the context based on `goal.scope`/`goal.portfolioId` — callers do
   * not need to thread scope-resolution themselves.
   */
  evaluate(goal: GoalDTO): GoalEvaluation
  /**
   * Resolve the dividend yield % to use for portfolio-target math. The
   * scope determines which portfolio's trailing-12m income drives the
   * derivation; the evaluator computes the scoped KPI value internally,
   * so callers do not need to call `computeKPIs` themselves.
   */
  estimateYield(args: {
    scope: EvaluatorScope
    override?: number | null
  }): YieldEstimate
  /**
   * Portfolio KPIs (value/invested/gain/gainPct/cagr) for the given scope.
   * Views call this instead of importing `computeKPIs` and re-resolving
   * combined-vs-specific portfolio themselves.
   */
  kpis(scope: EvaluatorScope): KPIs
  /**
   * Trailing annual return % plus whether it was derived from actuals or fell
   * back to the 7% assumption — lets the UI honestly label the figure. Same
   * scope-resolution as `kpis`; entries come from the resolved portfolio.
   */
  historicalReturnWithSource(scope: EvaluatorScope): ReturnEstimate
}

function resolveScopedPortfolio(
  portfolios: PortfolioDTO[],
  scope: EvaluatorScope
): PortfolioDTO {
  if (scope === "combined" || scope === COMBINED_PORTFOLIO_ID) {
    return aggregatePortfolios(portfolios)
  }
  return (
    portfolios.find((p) => p.id === scope) ?? aggregatePortfolios(portfolios)
  )
}

/**
 * Factory rather than a class so the hook can memoize the returned object by
 * `[ctx.portfolios, ctx.incomeEvents, ctx.settings, ctx.monthlySaving]` and
 * downstream `useMemo`s in views stay stable when nothing actually changed.
 */
export function createGoalEvaluator(ctx: GoalEvaluatorContext): GoalEvaluator {
  return {
    evaluate(goal) {
      const monthlySaving = ctx.monthlySaving(
        goal.scope === "portfolio" && goal.portfolioId != null
          ? goal.portfolioId
          : COMBINED_PORTFOLIO_ID
      )
      return evaluateGoal(goal, {
        portfolios: ctx.portfolios,
        incomeEvents: ctx.incomeEvents,
        settings: ctx.settings,
        monthlySaving,
      })
    },
    estimateYield({ scope, override }) {
      const scoped = resolveScopedPortfolio(ctx.portfolios, scope)
      const portfolioValue = computeKPIs(scoped).value
      return estimatedYield({
        events: ctx.incomeEvents,
        portfolioValue,
        override: override ?? undefined,
        portfolioId: scope === "combined" ? undefined : scope,
        basis: ctx.settings.dividendBasis,
      })
    },
    kpis(scope) {
      return computeKPIs(resolveScopedPortfolio(ctx.portfolios, scope))
    },
    historicalReturnWithSource(scope) {
      return historicalAnnualReturnWithSource(
        resolveScopedPortfolio(ctx.portfolios, scope).entries
      )
    },
  }
}
