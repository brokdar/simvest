import { eventAmount, inferCadence } from "@/lib/calc"
import { addCalendarMonths, fromISODate, toISODate } from "@/lib/dates"
import type {
  DividendBasis,
  IncomeCadence,
  IncomeEventDTO,
  IncomeKind,
} from "@/lib/types"

/**
 * The forward view of income (W5): when each source is likely to pay next
 * and roughly how much, read off its own schedule. Only sources with a
 * regular schedule get a prediction — an irregular source or one with a
 * single payout so far says so instead of inventing a date.
 */

/** Calendar step between payouts, per cadence that has one. */
const STEP: Partial<
  Record<IncomeCadence, { days: number } | { months: number }>
> = {
  daily: { days: 1 },
  weekly: { days: 7 },
  monthly: { months: 1 },
  quarterly: { months: 3 },
  "semi-annual": { months: 6 },
  annual: { months: 12 },
}

export type PayoutSource = {
  /** `h:<holdingId>` for a holding's dividends, `i:<portfolioId>` for interest. */
  key: string
  name: string
  kind: IncomeKind
  holdingId: number | null
  portfolioId: number
}

export type PayoutForecast = PayoutSource & {
  cadence: IncomeCadence
  lastPaid: string
  /** The last payout's amount — what the next one is estimated at. */
  lastAmount: number
  /**
   * Next expected payout on or after today (ISO): the source's schedule
   * rolled forward from its last payout. Null when there is no prediction —
   * no regular schedule, or the source looks like it stopped paying.
   */
  next: string | null
  /**
   * True when at least one expected payout between the last recorded one and
   * today isn't recorded (most often: not imported yet).
   */
  behind: boolean
  /** Why there is no prediction, when `next` is null. */
  reason: string | null
}

/** Rough length of one cadence step in days, for "has it stopped?" checks. */
const STEP_DAYS: Partial<Record<IncomeCadence, number>> = {
  daily: 1,
  weekly: 7,
  monthly: 30.4,
  quarterly: 91,
  "semi-annual": 182,
  annual: 365,
}

const DAY_MS = 86_400_000

function step(iso: string, s: { days: number } | { months: number }): string {
  const { year, month, day } = fromISODate(iso)
  if ("days" in s) {
    const d = new Date(Date.UTC(year, month - 1, day + s.days))
    return d.toISOString().slice(0, 10)
  }
  const n = addCalendarMonths(year, month, day, s.months)
  return toISODate(n.year, n.month, n.day)
}

/** Group payouts by source: dividends per holding, interest per account. */
export function groupBySource(
  events: IncomeEventDTO[]
): Map<string, { source: PayoutSource; events: IncomeEventDTO[] }> {
  const out = new Map<
    string,
    { source: PayoutSource; events: IncomeEventDTO[] }
  >()
  for (const e of events) {
    const isDividend = e.kind === "dividend" && e.holdingId != null
    const key = isDividend ? `h:${e.holdingId}` : `i:${e.portfolioId}`
    let g = out.get(key)
    if (!g) {
      g = {
        source: {
          key,
          name: isDividend ? (e.holdingName ?? "Dividend") : "Interest",
          kind: isDividend ? "dividend" : "interest",
          holdingId: isDividend ? e.holdingId : null,
          portfolioId: e.portfolioId,
        },
        events: [],
      }
      out.set(key, g)
    }
    g.events.push(e)
  }
  return out
}

/**
 * Next expected payout for one source. `asOf` is "today" (ISO).
 *
 * `accountLast` is the latest payout recorded for the source's account. When
 * the whole account's record stops at the same point, missing payouts are
 * "not imported yet" and the schedule still holds. When the rest of the
 * account kept paying for more than two of this source's cycles after it
 * went quiet, it most likely stopped (sold, suspended) — no prediction.
 */
export function forecastSource(
  source: PayoutSource,
  events: IncomeEventDTO[],
  asOf: string,
  basis: DividendBasis = "net",
  accountLast?: string
): PayoutForecast | null {
  if (events.length === 0) return null
  const sorted = [...events].sort((a, b) =>
    a.paidDate < b.paidDate ? -1 : a.paidDate > b.paidDate ? 1 : 0
  )
  const last = sorted[sorted.length - 1]
  const cadence = inferCadence(sorted)
  const s = STEP[cadence]
  const base = {
    ...source,
    cadence,
    lastPaid: last.paidDate,
    lastAmount: eventAmount(last, basis),
  }
  if (!s) {
    return {
      ...base,
      next: null,
      behind: false,
      reason:
        cadence === "single"
          ? "Only one payout so far — no rhythm to go on yet"
          : "No fixed schedule, so no date to expect",
    }
  }
  const quietDays =
    (Date.parse(accountLast ?? last.paidDate) - Date.parse(last.paidDate)) /
    DAY_MS
  if (quietDays > Math.max(45, 2 * STEP_DAYS[cadence]!)) {
    return {
      ...base,
      next: null,
      behind: false,
      reason: "Nothing recorded for a while, though the account kept paying",
    }
  }
  let next = step(last.paidDate, s)
  const behind = next < asOf
  while (next < asOf) next = step(next, s)
  return { ...base, next, behind, reason: null }
}

export function forecastPayouts(
  events: IncomeEventDTO[],
  asOf: string,
  basis: DividendBasis = "net"
): PayoutForecast[] {
  const accountLast = new Map<number, string>()
  for (const e of events) {
    const prev = accountLast.get(e.portfolioId)
    if (!prev || e.paidDate > prev) accountLast.set(e.portfolioId, e.paidDate)
  }
  const out: PayoutForecast[] = []
  for (const { source, events: list } of groupBySource(events).values()) {
    const f = forecastSource(
      source,
      list,
      asOf,
      basis,
      accountLast.get(source.portfolioId)
    )
    if (f) out.push(f)
  }
  // Predicted first, soonest first; sources without a schedule at the end.
  return out.sort((a, b) => {
    if (a.next === null || b.next === null) {
      if (a.next === b.next) return a.name.localeCompare(b.name)
      return a.next === null ? 1 : -1
    }
    return a.next < b.next ? -1 : a.next > b.next ? 1 : 0
  })
}

export type DueThisMonth = {
  /** Estimated total still expected in `asOf`'s calendar month. */
  amount: number
  /** Number of individual payouts that estimate is made of. */
  count: number
  /** Sources contributing to it. */
  sources: number
  /** Sources left out because they have no regular schedule. */
  unscheduled: number
}

/**
 * What's still expected in the current calendar month: every scheduled
 * payout from today to the month's end, each estimated at its source's last
 * amount. A daily interest source contributes one payout per remaining day.
 * Payouts already recorded this month aren't counted (they're in the
 * rear-view figures), and neither are dates that passed unrecorded.
 */
export function dueThisMonth(
  forecasts: PayoutForecast[],
  asOf: string
): DueThisMonth {
  const monthEnd = (() => {
    const { year, month } = fromISODate(asOf)
    const n = addCalendarMonths(year, month, 1, 1)
    return toISODate(n.year, n.month, 1)
  })()
  let amount = 0
  let count = 0
  let sources = 0
  let unscheduled = 0
  for (const f of forecasts) {
    if (f.next === null) {
      unscheduled++
      continue
    }
    const s = STEP[f.cadence]!
    let n = 0
    for (let d = f.next; d < monthEnd; d = step(d, s)) n++
    if (n > 0) {
      amount += n * f.lastAmount
      count += n
      sources++
    }
  }
  return { amount, count, sources, unscheduled }
}
