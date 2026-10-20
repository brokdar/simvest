import { eventAmount } from "@/lib/calc"
import type { DividendBasis, IncomeEventDTO, IncomeKind } from "@/lib/types"
import { COMBINED_PORTFOLIO_ID } from "@/lib/types"

/**
 * Trailing income windows that know the difference between "nothing was paid"
 * and "nothing has been entered yet" (N4/N5).
 *
 * Payouts are recorded in batches (a broker export every few months), so a
 * window anchored to *today* counts every not-yet-imported month as €0 — that
 * is how a data gap became a red "−26,8% YoY". Here every window is anchored
 * to the **last month with a recorded payout** in scope, and a portfolio whose
 * own payouts stop earlier than that is compared like-for-like.
 */

/** A calendar month as one integer: year * 12 + (month - 1). */
export type MonthIdx = number

export function monthIdx(year: number, month: number): MonthIdx {
  return year * 12 + (month - 1)
}

export function fromMonthIdx(idx: MonthIdx): { year: number; month: number } {
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

export function eventMonthIdx(e: Pick<IncomeEventDTO, "paidDate">): MonthIdx {
  return monthIdx(
    parseInt(e.paidDate.slice(0, 4), 10),
    parseInt(e.paidDate.slice(5, 7), 10)
  )
}

export function dateMonthIdx(d: Date): MonthIdx {
  return monthIdx(d.getFullYear(), d.getMonth() + 1)
}

function scope(
  events: IncomeEventDTO[],
  portfolioId: number | undefined,
  kind: IncomeKind | "all"
): IncomeEventDTO[] {
  return events.filter(
    (e) =>
      (portfolioId === undefined ||
        portfolioId === COMBINED_PORTFOLIO_ID ||
        e.portfolioId === portfolioId) &&
      (kind === "all" || e.kind === kind)
  )
}

/** A portfolio whose payouts stop before the scope's last recorded month. */
export type LaggingSource = {
  portfolioId: number
  /** Its last month with a recorded payout. */
  through: MonthIdx
  /** Months between `through` and the scope anchor that look un-entered. */
  missingMonths: number
}

export type IncomeWindow = {
  /** Last month with a recorded payout in scope; null when there is none. */
  anchor: MonthIdx | null
  /** Recorded income in the 12 months ending with `anchor` (inclusive). */
  last12: number
  /** `last12` split by kind — the parts always add up to the whole. */
  last12ByKind: Record<IncomeKind, number>
  /**
   * The 12 months before that, like-for-like: a lagging portfolio's months
   * that have no counterpart in `last12` are left out. Null when the record
   * doesn't reach back far enough for a baseline (first payout inside the
   * last 12 months).
   */
  prior12: number | null
  /** last12 vs prior12, null without a baseline or when prior12 is 0. */
  deltaAbs: number | null
  deltaPct: number | null
  /** Portfolios counted only up to their own last payout. */
  lagging: LaggingSource[]
  /** Whole months between the anchor and the current month (0 = current). */
  monthsSinceAnchor: number
}

/**
 * Trailing-12 and prior-12 income for a scope, anchored to the last recorded
 * payout. A portfolio counts as *lagging* when its own payouts end before the
 * anchor although it paid in those same calendar months a year earlier — the
 * signature of "not imported yet" rather than "stopped paying". For lagging
 * portfolios the prior window is cut at the same point a year earlier, so the
 * comparison never pits 12 recorded months against 7.
 */
export function incomeWindow(
  events: IncomeEventDTO[],
  opts: {
    portfolioId?: number
    kind?: IncomeKind | "all"
    basis?: DividendBasis
    now?: Date
  } = {}
): IncomeWindow {
  const { portfolioId, kind = "all", basis = "gross", now = new Date() } = opts
  const scoped = scope(events, portfolioId, kind)
  if (scoped.length === 0) {
    return {
      anchor: null,
      last12: 0,
      last12ByKind: { dividend: 0, interest: 0 },
      prior12: null,
      deltaAbs: null,
      deltaPct: null,
      lagging: [],
      monthsSinceAnchor: 0,
    }
  }

  let anchor = -Infinity
  let first = Infinity
  const lastOwn = new Map<number, MonthIdx>()
  const monthsByPortfolio = new Map<number, Set<MonthIdx>>()
  for (const e of scoped) {
    const m = eventMonthIdx(e)
    if (m > anchor) anchor = m
    if (m < first) first = m
    if (m > (lastOwn.get(e.portfolioId) ?? -Infinity))
      lastOwn.set(e.portfolioId, m)
    let set = monthsByPortfolio.get(e.portfolioId)
    if (!set) monthsByPortfolio.set(e.portfolioId, (set = new Set()))
    set.add(m)
  }

  const lagging: LaggingSource[] = []
  for (const [pid, own] of lastOwn) {
    if (own >= anchor) continue
    const paid = monthsByPortfolio.get(pid)!
    let missing = 0
    for (let m = own + 1; m <= anchor; m++) {
      if (paid.has(m - 12)) missing++
    }
    if (missing > 0)
      lagging.push({ portfolioId: pid, through: own, missingMonths: missing })
  }
  const cutoff = new Map(lagging.map((l) => [l.portfolioId, l.through]))

  let last12 = 0
  const last12ByKind: Record<IncomeKind, number> = { dividend: 0, interest: 0 }
  let prior = 0
  for (const e of scoped) {
    const m = eventMonthIdx(e)
    const amt = eventAmount(e, basis)
    if (m > anchor - 12) {
      last12 += amt
      last12ByKind[e.kind] += amt
    } else if (m > anchor - 24) {
      const cut = cutoff.get(e.portfolioId)
      if (cut === undefined || m <= cut - 12) prior += amt
    }
  }

  const hasBaseline = first <= anchor - 12
  const prior12 = hasBaseline ? prior : null
  const deltaAbs = prior12 !== null ? last12 - prior12 : null
  const deltaPct =
    prior12 !== null && prior12 > 0
      ? ((last12 - prior12) / prior12) * 100
      : null

  return {
    anchor,
    last12,
    last12ByKind,
    prior12,
    deltaAbs,
    deltaPct,
    lagging,
    monthsSinceAnchor: Math.max(0, dateMonthIdx(now) - anchor),
  }
}

/**
 * What a calendar month means for the record (N5): `paid` has payouts;
 * `none` is inside the recorded span with nothing paid (a real zero);
 * `unrecorded` comes after the last recorded payout but isn't in the future
 * (nothing entered yet — never a zero); `before` precedes the first payout;
 * `future` is after the current month.
 */
export type MonthStatus = "paid" | "none" | "unrecorded" | "before" | "future"

export function monthStatus(
  m: MonthIdx,
  total: number,
  span: { first: MonthIdx; last: MonthIdx; now: MonthIdx }
): MonthStatus {
  if (m > span.now) return "future"
  if (m < span.first) return "before"
  if (m > span.last) return "unrecorded"
  return total !== 0 ? "paid" : "none"
}

/** First and last recorded payout month of an event set (null if empty). */
export function recordedSpan(
  events: IncomeEventDTO[]
): { first: MonthIdx; last: MonthIdx } | null {
  if (events.length === 0) return null
  let first = Infinity
  let last = -Infinity
  for (const e of events) {
    const m = eventMonthIdx(e)
    if (m < first) first = m
    if (m > last) last = m
  }
  return { first, last }
}

/**
 * Trailing-12-calendar-month sums for a month series that may skip months.
 * `points` must be sorted ascending; the result is parallel to it. (The old
 * chart line summed the last 12 *non-empty* months, which silently stretched
 * the window over gaps.)
 */
export function trailing12ByCalendar(
  points: Array<{ idx: MonthIdx; total: number }>
): number[] {
  const out: number[] = []
  let sum = 0
  let lo = 0
  for (let i = 0; i < points.length; i++) {
    sum += points[i].total
    while (points[lo].idx <= points[i].idx - 12) {
      sum -= points[lo].total
      lo++
    }
    out.push(sum)
  }
  return out
}

/**
 * Per-month totals for the `months` calendar months ending with `endIdx`
 * (inclusive) — the sparkline series. Anchor it to the last recorded month,
 * not today, so un-entered months don't draw as a cliff to zero.
 */
export function bucketByMonthEnding(
  events: IncomeEventDTO[],
  endIdx: MonthIdx,
  months = 24,
  basis: DividendBasis = "gross"
): number[] {
  const out = new Array<number>(months).fill(0)
  for (const e of events) {
    const offset = endIdx - eventMonthIdx(e)
    if (offset < 0 || offset >= months) continue
    out[months - 1 - offset] += eventAmount(e, basis)
  }
  return out
}
