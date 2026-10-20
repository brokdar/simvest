import {
  eventAmount,
  type GoalEvaluation,
  type LatestMonthChange,
} from "./calc"
import { fmtMonth } from "./dates"
import { fmtCompactEUR, fmtEUR, fmtPct, plural } from "./format"
import { goalVerdict } from "./goal-evaluator"
import { fromMonthIdx, monthIdx, type IncomeWindow } from "./income-window"
import type { DividendBasis, GoalDTO, IncomeEventDTO } from "./types"

/**
 * The one plain-language sentence each key screen opens with (P7). Every
 * function here takes numbers the views already compute and returns a
 * sentence — or null when there is nothing honest to say yet. No I/O, no
 * React; the claims are only ever ones the data supports.
 */

type MonthRef = { year: number; month: number }

const eur0 = (v: number) => fmtEUR(v, { decimals: 0 })

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function monthsBetween(a: MonthRef, b: MonthRef): number {
  return monthIdx(b.year, b.month) - monthIdx(a.year, a.month)
}

/** A move counts as a change only when it rounds to at least a euro. */
const NOISE = 0.5

// ─── Overview ───────────────────────────────────────────────────────────

export type OverviewHeadlineInput = {
  /** `monthMoves(entries, coverage)` for the scope, oldest first. */
  moves: LatestMonthChange[]
  /** How many entries in the scope have a recorded value. */
  valuedCount: number
  /** Net gain today (value − invested). */
  gain: number
  /** Today, for "that was 6 months ago". */
  now: MonthRef
  /**
   * Combined only: the newest month any account has a value for. When it is
   * newer than the latest move, the move is from the last month *every*
   * account reported, and the sentence says so.
   */
  newestReported?: MonthRef | null
}

/** How long ago a latest value has to be before the headline mentions it. */
const STALE_MONTHS = 3

/**
 * "Up €3.590 in Apr ’26, €1.890 of it from the market — your best month
 * since Mar ’25." Ranks only true one-month moves against earlier true
 * one-month moves, by the market's part (the same figure as Best month).
 */
export function overviewHeadline(input: OverviewHeadlineInput): string | null {
  const { moves, valuedCount, gain, now, newestReported } = input
  if (valuedCount === 0) return null
  const last = moves.at(-1)
  if (!last) {
    return valuedCount === 1
      ? "Your first month is in — log next month’s value and you’ll see how it moved."
      : null
  }

  const m = fmtMonth(last.year, last.month)
  const span =
    last.gapMonths > 1 ? `over the ${last.gapMonths} months to ${m}` : `in ${m}`
  const ago = monthsBetween(last, now)
  // Combined: a newer month exists, but not every account has reported it.
  const partial =
    newestReported != null && monthsBetween(last, newestReported) > 0
  const note = partial
    ? " (the latest month all your accounts reported)"
    : ago >= STALE_MONTHS
      ? ` (${ago} months ago)`
      : ""
  const when = `${span}${note}`

  const market = last.marketDelta
  if (market < -NOISE) {
    const offset =
      last.added > NOISE
        ? `, partly offset by the ${eur0(last.added)} you added`
        : ""
    const standing =
      gain >= 0
        ? `you’re still ${eur0(gain)} ahead of everything you’ve put in`
        : `that leaves you ${eur0(-gain)} below what you’ve put in`
    return `The market took ${eur0(-market)} off ${when}${offset}; ${standing}.`
  }

  if (market <= NOISE) {
    return `Flat ${when}: the value moved only by what you added.`
  }

  const rank = rankMove(moves)
  const rankText = rank ? ` — ${rank}` : ""
  // The market part is "of it" only when it really is part of a bigger rise.
  if (last.valueDelta > market + NOISE && last.added > NOISE) {
    return `Up ${eur0(last.valueDelta)} ${when}, ${eur0(market)} of it from the market${rankText}.`
  }
  return `The market added ${eur0(market)} ${when}${rankText}.`
}

/**
 * "your best month yet" / "your best month since Mar ’25" for the latest
 * move, or null. Only true one-month moves are compared, and "since" is only
 * worth saying when the previous better month is more than two months back.
 */
function rankMove(moves: LatestMonthChange[]): string | null {
  const last = moves.at(-1)
  if (!last || last.gapMonths !== 1) return null
  const earlier = moves.slice(0, -1).filter((x) => x.gapMonths === 1)
  if (earlier.length < 3) return null
  for (let k = earlier.length - 1; k >= 0; k--) {
    const prev = earlier[k]
    if (prev.marketDelta >= last.marketDelta) {
      return monthsBetween(prev, last) > 2
        ? `your best month since ${fmtMonth(prev.year, prev.month)}`
        : null
    }
  }
  return "your best month on record"
}

// ─── Goals ──────────────────────────────────────────────────────────────

export type GoalHeadlineItem = {
  goal: GoalDTO
  ev: GoalEvaluation
  /** The portfolio's name for a portfolio-scoped goal. */
  portfolioName?: string | null
}

/** "€1,0M" / "€100/mo in dividends from Deutsche Bank". */
export function goalTargetPhrase(
  goal: Pick<GoalDTO, "kind" | "target" | "scope">,
  portfolioName?: string | null
): string {
  const from =
    goal.scope === "portfolio" && portfolioName ? portfolioName : null
  switch (goal.kind) {
    case "portfolio_value":
      return `${fmtCompactEUR(goal.target)}${from ? ` in ${from}` : ""}`
    case "annual_income":
      return `${fmtCompactEUR(goal.target)}/yr of income${from ? ` from ${from}` : ""}`
    case "dividend_annual":
      return `${fmtCompactEUR(goal.target)}/yr in dividends${from ? ` from ${from}` : ""}`
    case "dividend_monthly":
      return `${eur0(goal.target)}/mo in dividends${from ? ` from ${from}` : ""}`
  }
}

/**
 * One goal as a clause, lower-case so it can lead or follow. The numbers
 * come from `goalVerdict`, so the sentence can never disagree with the
 * goal's tile ("reaches 2034", "€24/mo more").
 */
export function goalClause(item: GoalHeadlineItem): string {
  const { goal, ev } = item
  const what = goalTargetPhrase(goal, item.portfolioName)
  const verdict = goalVerdict(ev, goal.targetYear)
  if (ev.targetValue > 0 && ev.currentValue >= ev.targetValue) {
    return `you’ve already reached ${what}`
  }
  if (ev.onTrack && ev.projectedYear !== null) {
    const year = Math.round(ev.projectedYear)
    const ahead = goal.targetYear - year
    return ahead >= 1
      ? `at this pace you’ll reach ${what} around ${year}, ${ahead === 1 ? "a year" : `${ahead} years`} ahead of your ${goal.targetYear} goal`
      : `at this pace you’ll reach ${what} in ${year}, right on time for your goal`
  }
  if (verdict.fixShort) {
    return `you need ${verdict.fixShort}, starting now, to reach ${what} by ${goal.targetYear}`
  }
  if (ev.projectedYear !== null) {
    return `at this pace ${what} arrives around ${Math.round(ev.projectedYear)}, just after your ${goal.targetYear} goal`
  }
  return `at today’s pace ${what} is more than 40 years away`
}

const isAhead = (x: GoalHeadlineItem) =>
  x.ev.onTrack ||
  (x.ev.targetValue > 0 && x.ev.currentValue >= x.ev.targetValue)

/**
 * The Goals page sentence: the soonest goal that's on track, then the
 * soonest that needs help. "At this pace you’ll reach €1,0M around 2034, a
 * year ahead of your 2035 goal — and you need €24/mo more, starting now, to
 * reach €100/mo in dividends by 2032."
 */
export function goalsHeadline(items: GoalHeadlineItem[]): string | null {
  if (items.length === 0) return null
  const byYear = [...items].sort(
    (a, b) => a.goal.targetYear - b.goal.targetYear
  )
  const ahead = byYear.filter(isAhead)
  const behind = byYear.filter((x) => !isAhead(x))
  if (items.length === 1) return `${capitalize(goalClause(items[0]))}.`
  if (behind.length === 0) {
    return `All ${items.length} goals are on track — ${goalClause(ahead[0])}.`
  }
  if (ahead.length === 0) {
    const more = behind.length - 1
    return `${capitalize(goalClause(behind[0]))} — and ${more} more ${plural(more, "goal needs", "goals need")} a nudge.`
  }
  return `${capitalize(goalClause(ahead[0]))} — and ${goalClause(behind[0])}.`
}

// ─── Income ─────────────────────────────────────────────────────────────

export type IncomeHeadlineInput = {
  /** Payouts in scope (portfolio and kind already applied). */
  events: IncomeEventDTO[]
  basis: DividendBasis
  /** `incomeWindow(...)` for the same scope. */
  window: IncomeWindow
  now: Date
  /** "income" / "dividends" / "interest" — what the filter shows. */
  noun?: string
  /** Names of `window.lagging` portfolios, with their last month, for the caveat. */
  lagging?: { name: string }[]
}

/**
 * The Income sentence. Leads with the biggest true thing: this year already
 * past all of last year; else the last 12 recorded months against the 12
 * before (like-for-like, from `incomeWindow`); else the total so far.
 */
export function incomeHeadline(input: IncomeHeadlineInput): string | null {
  const { events, basis, window, now, noun = "income", lagging = [] } = input
  if (events.length === 0 || window.anchor === null) return null

  const year = now.getFullYear()
  const nowIdx = monthIdx(year, now.getMonth() + 1)
  let ytd = 0
  let lastYear = 0
  let first = Infinity
  for (const e of events) {
    const y = Number(e.paidDate.slice(0, 4))
    const idx = monthIdx(y, Number(e.paidDate.slice(5, 7)))
    if (idx > nowIdx) continue
    if (idx < first) first = idx
    if (y === year) ytd += eventAmount(e, basis)
    else if (y === year - 1) lastYear += eventAmount(e, basis)
  }

  if (lastYear > 0 && ytd > lastYear) {
    const left = 12 - (now.getMonth() + 1)
    const tail =
      left === 0
        ? "and December isn’t over yet"
        : `with ${left === 1 ? "a month" : `${left} months`} still to come`
    return `${year} has already beaten all of ${year - 1} — ${eur0(ytd)} so far against ${eur0(lastYear)}, ${tail}.`
  }

  const through = fromMonthIdx(window.anchor)
  const to = fmtMonth(through.year, through.month)
  const caveat =
    lagging.length > 0
      ? ` (${joinNames(lagging.map((l) => l.name))} counted only up to ${lagging.length === 1 ? "its" : "their"} last recorded payout)`
      : ""

  if (window.deltaPct !== null) {
    const pct = window.deltaPct
    const compare =
      Math.abs(pct) < 1
        ? "about the same as the 12 months before"
        : pct > 0
          ? `up ${fmtPct(pct, 1)} on the 12 months before`
          : `${fmtPct(-pct, 1)} less than the 12 months before`
    return `${eur0(window.last12)} of ${noun} came in over the 12 months to ${to} — ${compare}${caveat}.`
  }

  const start = fromMonthIdx(first)
  const total = events.reduce(
    (s, e) =>
      monthIdx(
        Number(e.paidDate.slice(0, 4)),
        Number(e.paidDate.slice(5, 7))
      ) <= nowIdx
        ? s + eventAmount(e, basis)
        : s,
    0
  )
  return `${eur0(total)} of ${noun} so far, since your first payout in ${fmtMonth(start.year, start.month)} — recorded through ${to}.`
}

/** "A", "A and B", "A, B and C". */
function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? ""
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
}
