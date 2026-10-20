import type { IncomeEventDTO } from "./types"

/**
 * One line of the Recent Payouts list: a single payout, or a run of
 * interest payouts from one account in one month folded into a summary
 * ("Bondora interest · 31 payouts · €77,81 · May 2026").
 */
export type PayoutItem =
  | { type: "event"; event: IncomeEventDTO }
  | {
      type: "run"
      /** `${portfolioId}-${YYYY-MM}` — stable across renders. */
      key: string
      portfolioId: number
      /** "YYYY-MM" */
      month: string
      events: IncomeEventDTO[]
    }

/**
 * T3: daily interest (933 rows of €2,51) buried every real dividend. Fold all
 * interest payouts from the same account in the same month into one item —
 * placed where the month's first one would be — once there are at least
 * `minRun` of them; dividends and the odd interest payment pass through
 * untouched. Order is otherwise preserved, so pass the list already sorted
 * the way it will be shown. Keys are unique: one run per account-month.
 */
export function groupInterestRuns(
  events: IncomeEventDTO[],
  minRun = 3
): PayoutItem[] {
  const keyOf = (e: IncomeEventDTO) =>
    `${e.portfolioId}-${e.paidDate.slice(0, 7)}`
  const groups = new Map<string, IncomeEventDTO[]>()
  for (const e of events) {
    if (e.kind !== "interest") continue
    const k = keyOf(e)
    const list = groups.get(k)
    if (list) list.push(e)
    else groups.set(k, [e])
  }
  const out: PayoutItem[] = []
  const emitted = new Set<string>()
  for (const e of events) {
    const group = e.kind === "interest" ? groups.get(keyOf(e)) : undefined
    if (!group || group.length < minRun) {
      out.push({ type: "event", event: e })
      continue
    }
    const k = keyOf(e)
    if (emitted.has(k)) continue
    emitted.add(k)
    out.push({
      type: "run",
      key: k,
      portfolioId: e.portfolioId,
      month: e.paidDate.slice(0, 7),
      events: group,
    })
  }
  return out
}
