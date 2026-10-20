import {
  aggregatePortfoliosWithCoverage,
  eventAmount,
  monthMoves,
  type MonthCoverage,
} from "./calc"
import { fmtMonth } from "./dates"
import { fmtCompactEUR, fmtEUR } from "./format"
import {
  eventMonthIdx,
  fromMonthIdx,
  monthIdx,
  trailing12ByCalendar,
} from "./income-window"
import type {
  DividendBasis,
  EntryDTO,
  GoalDTO,
  IncomeEventDTO,
  PortfolioDTO,
} from "./types"

/**
 * Milestones (T4): moments in the user's own record worth a calm "nice".
 * Detected from data the app already has — nothing is stored except which
 * ones the user dismissed (localStorage, see `components/use-milestones.ts`).
 * Every detector dates its milestone to the month it happened, so only
 * recent ones are surfaced and old news doesn't hang around forever.
 */

export type MilestoneFamily =
  | "income-total"
  | "dividends-total"
  | "value"
  | "record-income-month"
  | "market-beat-contributions"
  | `goal-${number}`

export type Milestone = {
  /** Stable across renders and reloads — the dismissal key. */
  id: string
  /** Only the newest milestone per family is shown. */
  family: MilestoneFamily
  title: string
  detail: string
  year: number
  month: number
  /** Where to look at it. */
  href: string
}

const eur0 = (v: number) => fmtEUR(v, { decimals: 0 })
const label = (idx: number) => {
  const { year, month } = fromMonthIdx(idx)
  return fmtMonth(year, month)
}
const at = (idx: number) => fromMonthIdx(idx)
/** "2026-04" — readable ids for dated milestones. */
const monthKey = (idx: number) => {
  const { year, month } = fromMonthIdx(idx)
  return `${year}-${String(month).padStart(2, "0")}`
}

export const INCOME_THRESHOLDS = [
  500, 1_000, 2_500, 5_000, 10_000, 25_000, 50_000, 100_000, 250_000,
]
export const VALUE_THRESHOLDS = [
  10_000, 25_000, 50_000, 100_000, 150_000, 200_000, 250_000, 300_000, 400_000,
  500_000, 750_000, 1_000_000, 1_500_000, 2_000_000, 3_000_000, 5_000_000,
]

/** Monthly totals of a set of payouts, keyed by month index, ascending. */
function monthlyTotals(
  events: IncomeEventDTO[],
  basis: DividendBasis
): Array<{ idx: number; total: number }> {
  const by = new Map<number, number>()
  for (const e of events) {
    const m = eventMonthIdx(e)
    by.set(m, (by.get(m) ?? 0) + eventAmount(e, basis))
  }
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([idx, total]) => ({ idx, total }))
}

/**
 * Lifetime income crossing a round number — "Your first €1.000 of
 * dividends". `kind` "all" counts dividends and interest together.
 */
export function incomeTotalMilestones(
  events: IncomeEventDTO[],
  basis: DividendBasis,
  kind: "all" | "dividend"
): Milestone[] {
  const scoped = kind === "all" ? events : events.filter((e) => e.kind === kind)
  const months = monthlyTotals(scoped, basis)
  if (months.length === 0) return []
  const family = kind === "all" ? "income-total" : "dividends-total"
  const what = kind === "all" ? "passive income" : "dividends"
  const out: Milestone[] = []
  let sum = 0
  let t = 0
  for (const { idx, total } of months) {
    sum += total
    while (t < INCOME_THRESHOLDS.length && sum >= INCOME_THRESHOLDS[t]) {
      const threshold = INCOME_THRESHOLDS[t]
      out.push({
        id: `${family}-${threshold}`,
        family,
        title:
          t === 0 || threshold === 1_000
            ? `Your first ${eur0(threshold)} of ${what}`
            : `${eur0(threshold)} of ${what}, all told`,
        detail: `Passed in ${label(idx)} — ${eur0(sum)} since your first payout in ${label(months[0].idx)}.`,
        ...at(idx),
        href: "/income",
      })
      t++
    }
  }
  return out
}

/**
 * The best single month of income so far, when it beats every earlier month
 * and there's at least a year of record to beat.
 */
export function recordIncomeMonth(
  events: IncomeEventDTO[],
  basis: DividendBasis
): Milestone[] {
  const months = monthlyTotals(events, basis)
  if (months.length === 0) return []
  const firstIdx = months[0].idx
  const out: Milestone[] = []
  let best: { idx: number; total: number } | null = null
  for (const m of months) {
    if (best && m.total > best.total && m.idx - firstIdx >= 12) {
      out.push({
        id: `record-income-month-${monthKey(m.idx)}`,
        family: "record-income-month",
        title: "Your biggest income month yet",
        detail: `${eur0(m.total)} in ${label(m.idx)} — the previous best was ${eur0(best.total)} in ${label(best.idx)}.`,
        ...at(m.idx),
        href: "/income",
      })
    }
    if (!best || m.total > best.total) best = m
  }
  return out
}

/** Months the value is fully reported in (Combined), or every valued month. */
function reportedValues(
  entries: EntryDTO[],
  coverage?: MonthCoverage[]
): Array<{ idx: number; value: number }> {
  const out: Array<{ idx: number; value: number }> = []
  entries.forEach((e, i) => {
    if (e.value === null) return
    if (coverage && coverage[i]?.estimated !== false) return
    out.push({ idx: monthIdx(e.year, e.month), value: e.value })
  })
  return out
}

/**
 * The portfolio's value passing a round number for the first time. With
 * `coverage`, only months every account reported count, so a crossing is
 * never an artefact of one account's balance being carried forward.
 */
export function valueMilestones(
  entries: EntryDTO[],
  coverage?: MonthCoverage[],
  scopeName = "your portfolio"
): Milestone[] {
  const values = reportedValues(entries, coverage)
  const out: Milestone[] = []
  let t = 0
  for (const { idx, value } of values) {
    let crossed: number | null = null
    while (t < VALUE_THRESHOLDS.length && value >= VALUE_THRESHOLDS[t]) {
      crossed = VALUE_THRESHOLDS[t]
      t++
    }
    // A jump over several thresholds in one month is one milestone.
    if (crossed !== null) {
      out.push({
        id: `value-${crossed}`,
        family: "value",
        title: `${capitalize(scopeName)} passed ${fmtCompactEUR(crossed)}`,
        detail: `${eur0(value)} in ${label(idx)} — the first time on record.`,
        ...at(idx),
        href: "/",
      })
    }
  }
  // The first reported month isn't a "crossing" — it's where the record starts.
  const first = values[0]
  return first
    ? out.filter((m) => monthIdx(m.year, m.month) !== first.idx)
    : out
}

/**
 * A calendar year in which the market added more than the user did — the
 * moment, within that year, the year-to-date market gain overtook the
 * year-to-date contributions. "For the first time" when no earlier year did.
 */
export function marketBeatContributions(
  entries: EntryDTO[],
  coverage?: MonthCoverage[]
): Milestone[] {
  const moves = monthMoves(entries, coverage)
  const out: Milestone[] = []
  let year: number | null = null
  let market = 0
  let added = 0
  let done = false
  let firstMonthOfYear = 1
  for (const mv of moves) {
    if (mv.year !== year) {
      year = mv.year
      market = 0
      added = 0
      done = false
      firstMonthOfYear = mv.month
    }
    market += mv.marketDelta
    added += mv.added
    if (!done && added > 0 && market > added) {
      done = true
      const first = out.length === 0
      out.push({
        id: `market-beat-contributions-${mv.year}`,
        family: "market-beat-contributions",
        title: first
          ? "For the first time, the market added more than you did"
          : `The market added more than you did in ${mv.year}`,
        detail: `${eur0(market)} from the market against ${eur0(added)} you put in, ${
          firstMonthOfYear === mv.month
            ? `in ${fmtMonth(mv.year, mv.month)}`
            : `${fmtMonth(mv.year, firstMonthOfYear)}–${fmtMonth(mv.year, mv.month)}`
        }.`,
        year: mv.year,
        month: mv.month,
        href: "/projection",
      })
    }
  }
  return out
}

const QUARTERS: Array<{ q: number; title: (n: string) => string }> = [
  { q: 0.25, title: (n) => `A quarter of the way to “${n}”` },
  { q: 0.5, title: (n) => `Halfway to “${n}”` },
  { q: 0.75, title: (n) => `Three quarters of the way to “${n}”` },
  { q: 1, title: (n) => `You reached “${n}”` },
]

/**
 * A goal's progress crossing 25 / 50 / 75 / 100 %, dated by the month it
 * happened — value goals from the scope's reported values, income goals
 * from trailing-12-month payouts. Progress is measured the way the goal
 * tile measures it (`evaluateGoal`'s `pct`).
 */
export function goalQuarterMilestones(args: {
  goal: GoalDTO
  portfolios: PortfolioDTO[]
  incomeEvents: IncomeEventDTO[]
  basis: DividendBasis
  defaultSwr: number
}): Milestone[] {
  const { goal, portfolios, incomeEvents, basis, defaultSwr } = args
  if (!(goal.target > 0)) return []
  const scoped =
    goal.scope === "portfolio" && goal.portfolioId != null
      ? portfolios.find((p) => p.id === goal.portfolioId)
      : null
  if (goal.scope === "portfolio" && !scoped) return []

  let series: Array<{ idx: number; pct: number }>
  if (goal.kind === "portfolio_value" || goal.kind === "annual_income") {
    const { entries, coverage } = scoped
      ? { entries: scoped.entries, coverage: undefined }
      : (() => {
          const agg = aggregatePortfoliosWithCoverage(portfolios)
          return { entries: agg.portfolio.entries, coverage: agg.coverage }
        })()
    const swr = (goal.swr ?? defaultSwr) / 100
    series = reportedValues(entries, coverage).map(({ idx, value }) => ({
      idx,
      pct:
        goal.kind === "portfolio_value"
          ? value / goal.target
          : (value * swr) / goal.target,
    }))
  } else {
    const events = incomeEvents.filter(
      (e) => e.kind === "dividend" && (!scoped || e.portfolioId === scoped.id)
    )
    const months = monthlyTotals(events, basis)
    const t12 = trailing12ByCalendar(months)
    const perPeriod = goal.kind === "dividend_monthly" ? 12 : 1
    series = months.map((m, i) => ({
      idx: m.idx,
      pct: t12[i] / perPeriod / goal.target,
    }))
  }

  const out: Milestone[] = []
  let q = 0
  series.forEach(({ idx, pct }, i) => {
    let crossed: (typeof QUARTERS)[number] | null = null
    while (q < QUARTERS.length && pct >= QUARTERS[q].q) {
      crossed = QUARTERS[q]
      q++
    }
    // Already past a quarter when the record starts: not a crossing.
    if (!crossed || i === 0) return
    out.push({
      id: `goal-${goal.id}-q${crossed.q * 100}`,
      family: `goal-${goal.id}`,
      title: crossed.title(goal.name),
      // The share at that month only — today’s tile can differ as trailing
      // income moves, so the detail names the threshold, not a live figure.
      detail: `Passed ${crossed.q * 100}% of the goal in ${label(idx)}.`,
      ...at(idx),
      href: `/goals?goal=${goal.id}`,
    })
  })
  return out
}

export type MilestoneInput = {
  portfolios: PortfolioDTO[]
  incomeEvents: IncomeEventDTO[]
  goals: GoalDTO[]
  basis: DividendBasis
  defaultSwr: number
}

/** Every milestone in the record, oldest first. */
export function detectMilestones(input: MilestoneInput): Milestone[] {
  const { portfolios, incomeEvents, goals, basis, defaultSwr } = input
  const agg = aggregatePortfoliosWithCoverage(portfolios)
  const scopeName =
    portfolios.length > 1 ? "your combined portfolio" : "your portfolio"
  const all = [
    ...incomeTotalMilestones(incomeEvents, basis, "all"),
    ...incomeTotalMilestones(incomeEvents, basis, "dividend"),
    ...recordIncomeMonth(incomeEvents, basis),
    ...valueMilestones(agg.portfolio.entries, agg.coverage, scopeName),
    ...marketBeatContributions(agg.portfolio.entries, agg.coverage),
    ...goals.flatMap((goal) =>
      goalQuarterMilestones({
        goal,
        portfolios,
        incomeEvents,
        basis,
        defaultSwr,
      })
    ),
  ]
  return all.sort(
    (a, b) => monthIdx(a.year, a.month) - monthIdx(b.year, b.month)
  )
}

/** How far back a milestone still counts as news. */
export const RECENT_MONTHS = 6

/**
 * The milestones worth showing now: no more than `RECENT_MONTHS` months old
 * (so April still counts in October), not dismissed, newest per family,
 * newest first.
 */
export function recentMilestones(
  all: Milestone[],
  now: { year: number; month: number },
  dismissed: ReadonlySet<string> = new Set(),
  months = RECENT_MONTHS
): Milestone[] {
  const nowIdx = monthIdx(now.year, now.month)
  const newest = new Map<MilestoneFamily, Milestone>()
  for (const m of all) {
    const age = nowIdx - monthIdx(m.year, m.month)
    if (age < 0 || age > months || dismissed.has(m.id)) continue
    const prev = newest.get(m.family)
    if (!prev || monthIdx(m.year, m.month) >= monthIdx(prev.year, prev.month))
      newest.set(m.family, m)
  }
  return [...newest.values()].sort(
    (a, b) => monthIdx(b.year, b.month) - monthIdx(a.year, a.month)
  )
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}
