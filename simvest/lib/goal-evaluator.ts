import {
  aggregatePortfolios,
  computeKPIs,
  estimatedYield,
  evaluateGoal,
  historicalAnnualReturnWithSource,
  projectFuture,
  type GoalEvaluation,
  type ProjectionPoint,
  type KPIs,
  type ReturnEstimate,
  type YieldEstimate,
} from "./calc"
import type {
  GoalDTO,
  GoalKind,
  IncomeEventDTO,
  PortfolioDTO,
  SettingsDTO,
} from "./types"
import { COMBINED_PORTFOLIO_ID } from "./types"
import { fmtEUR } from "./format"

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

export type GoalVerdict = {
  onTrack: boolean
  /** "On track" / "Behind" — the one wording every surface shows. */
  label: "On track" | "Behind"
  /** "reaches 2038" / "not in the next 40 years" — at the current contribution. */
  reach: string
  /**
   * What closes the gap, when the goal is behind and more money per month
   * would do it: "€324/mo more gets you there by 2032". Null when on track.
   */
  fix: string | null
  /** Short form of `fix` for chips: "€324/mo more". */
  fixShort: string | null
  /**
   * The whole monthly amount the fix adds up to — "€1.124/mo in all" — only
   * when something already goes in each month. At €0/mo the total is the
   * fix itself, so saying it twice would just repeat the number.
   */
  fixTotal: string | null
  /**
   * One line for every surface. On track: "On track · reaches 2034". Behind,
   * it leads with the fix — "€324/mo more gets you there by 2032 · at
   * today’s pace, not in the next 40 years" — never with the alarm.
   */
  text: string
}

/** How far ahead the projection looks (`evaluateGoal` caps it at 40 years). */
const HORIZON_YEARS = 40

/**
 * The single verdict for a goal, read off its evaluation. Every surface that
 * says "on track" or "behind" (Overview and Income goal progress, Goals tiles
 * and headline, notifications) goes through this, so they can never disagree.
 * Pass the goal's `targetYear` so the fix can say "by 2032".
 */
export function goalVerdict(
  ev: GoalEvaluation,
  targetYear?: number
): GoalVerdict {
  const reach =
    ev.projectedYear !== null
      ? `reaches ${Math.round(ev.projectedYear)}`
      : `not in the next ${HORIZON_YEARS} years`
  const label = ev.onTrack ? "On track" : "Behind"
  const gap = ev.requiredMonthly - ev.monthlySaving
  const hasFix = !ev.onTrack && gap >= 0.5
  const more = `${fmtEUR(gap, { decimals: 0 })}/mo more`
  const fix = hasFix
    ? `${more} gets you there${targetYear ? ` by ${targetYear}` : ""}`
    : null
  const text = ev.onTrack
    ? `${label} · ${reach}`
    : fix
      ? `${fix} · at today’s pace, ${ev.projectedYear !== null ? `it ${reach}` : reach}`
      : `${label} · ${reach}`
  return {
    onTrack: ev.onTrack,
    label,
    reach,
    fix,
    fixShort: hasFix ? more : null,
    fixTotal:
      hasFix && ev.monthlySaving >= 0.5
        ? `${fmtEUR(ev.requiredMonthly, { decimals: 0 })}/mo in all`
        : null,
    text,
  }
}

export type PlanningTrajectories = {
  /** What happens at the contribution you make today, expected return. */
  current: ProjectionPoint[]
  /** Solved backwards from the target: expected return at `requiredMonthly`. */
  exp: ProjectionPoint[]
  /** Solved line's conservative / optimistic band. */
  cons: ProjectionPoint[]
  opt: ProjectionPoint[]
}

/**
 * The Planning trajectory chart's lines. The solved lines (`exp` and its
 * band) reach the target by construction — they answer "what would it take".
 * `current` answers "what actually happens if nothing changes", and is the
 * line the goal's verdict agrees with.
 */
export function planningTrajectories(
  ev: GoalEvaluation,
  settings: Pick<SettingsDTO, "conservativeReturn" | "optimisticReturn">,
  years: number
): PlanningTrajectories {
  const at = (monthlySaving: number, annualReturn: number) =>
    projectFuture({
      startValue: ev.scopedKpiValue,
      monthlySaving,
      years,
      annualReturn,
    })
  return {
    current: at(ev.monthlySaving, ev.expectedReturn),
    exp: at(ev.requiredMonthly, ev.expectedReturn),
    cons: at(ev.requiredMonthly, settings.conservativeReturn),
    opt: at(ev.requiredMonthly, settings.optimisticReturn),
  }
}

/** A sensible starting amount for a fresh goal of each kind. */
export function defaultGoalTarget(kind: GoalKind): number {
  switch (kind) {
    case "portfolio_value":
      return 1_000_000
    case "annual_income":
      return 30_000
    case "dividend_annual":
      return 12_000
    case "dividend_monthly":
      return 1_000
  }
}

/** Per-year (12) or per-month (1) for the income kinds; null for a stock. */
function periodMonths(kind: GoalKind): 12 | 1 | null {
  if (kind === "portfolio_value") return null
  return kind === "dividend_monthly" ? 1 : 12
}

export type GoalTargetConversion = {
  target: number
  /** How the amount was carried over, for the editor to say out loud. */
  how: "kept" | "converted" | "reset"
}

/**
 * Carry a typed target across a goal-kind switch (N17). Keeping the bare
 * number reinterprets it — €30.000/yr income became €30.000/mo dividends, a
 * 12× goal. Yearly ↔ monthly converts the amount; yearly ↔ yearly keeps it;
 * a portfolio value and an income are different quantities, so switching
 * between them resets to that kind's default rather than guessing.
 */
export function convertGoalTarget(
  target: number,
  from: GoalKind,
  to: GoalKind
): GoalTargetConversion {
  if (from === to) return { target, how: "kept" }
  const a = periodMonths(from)
  const b = periodMonths(to)
  if (a === null || b === null) {
    return { target: defaultGoalTarget(to), how: "reset" }
  }
  if (a === b) return { target, how: "kept" }
  return { target: Math.round((target / a) * b * 100) / 100, how: "converted" }
}
