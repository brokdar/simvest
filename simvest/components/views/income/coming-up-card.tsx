"use client"

import { useMemo, useState } from "react"
import { dueThisMonth, forecastPayouts } from "@/lib/payout-forecast"
import { fmtDate, fmtMonthLong, fromISODate } from "@/lib/dates"
import { fmtCount, fmtEUR, plural } from "@/lib/format"
import {
  CADENCE_HINT,
  CADENCE_LABEL,
  type DividendBasis,
  type IncomeEventDTO,
} from "@/lib/types"

const VISIBLE = 6

/**
 * The forward view of income (W5): what's still expected this month and
 * when each source is likely to pay next. Every figure is an estimate read
 * off the source's own schedule and last payout; a source with no regular
 * schedule gets no date rather than a made-up one.
 */
export function ComingUpCard({
  events,
  basis,
  today,
  portfolioName,
}: {
  events: IncomeEventDTO[]
  /** Names an interest row's account ("Interest · Bondora"). */
  portfolioName: (id: number) => string
  basis: DividendBasis
  /** SSR-anchored ISO date — see DataProvider.today. */
  today: string
}) {
  const [showAll, setShowAll] = useState(false)
  const forecasts = useMemo(
    () => forecastPayouts(events, today, basis),
    [events, today, basis]
  )
  const due = useMemo(() => dueThisMonth(forecasts, today), [forecasts, today])
  if (forecasts.length === 0) return null

  const { year, month } = fromISODate(today)
  const monthName = fmtMonthLong(year, month).split(" ")[0]
  const scheduled = forecasts.filter((f) => f.next !== null)
  const unscheduled = forecasts.filter((f) => f.next === null)
  const list = showAll ? forecasts : forecasts.slice(0, VISIBLE)

  return (
    <div className="card card-pad coming-up" data-testid="income-coming-up">
      <div className="coming-up-head">
        <div style={{ minWidth: 0 }}>
          <h3 style={{ fontSize: "var(--fs-lg)" }}>Coming up</h3>
          <div className="muted small">
            Estimated from each source’s own rhythm and its last payout — a
            guide, not a promise.
          </div>
        </div>
        <div className="coming-up-due" data-testid="income-due-this-month">
          <div className="coming-up-due-label">
            Still expected in {monthName}
          </div>
          <div className="mono coming-up-due-value">
            {due.count > 0 ? `≈ ${fmtEUR(due.amount)}` : fmtEUR(0)}
          </div>
          <div className="muted small">
            {due.count > 0
              ? `${fmtCount(due.count, "payout", "payouts")} from ${fmtCount(due.sources, "source", "sources")}`
              : scheduled.length > 0
                ? `Nothing else is due before the month ends`
                : "No source has a regular schedule yet"}
          </div>
        </div>
      </div>

      <ul className="coming-up-list" data-testid="income-coming-up-list">
        {list.map((f) => {
          const next = f.next ? fromISODate(f.next) : null
          const name =
            f.kind === "interest"
              ? `Interest · ${portfolioName(f.portfolioId)}`
              : f.name
          return (
            <li
              key={f.key}
              className="coming-up-row"
              data-testid={`coming-up-${f.key}`}
              data-behind={f.behind ? "true" : undefined}
            >
              <div className="coming-up-name" title={name}>
                <span translate="no">{name}</span>
                <span
                  className="chip"
                  title={CADENCE_HINT[f.cadence]}
                  style={{ marginLeft: 6 }}
                >
                  {CADENCE_LABEL[f.cadence]}
                </span>
              </div>
              <div
                className="small coming-up-when"
                data-testid={`coming-up-when-${f.key}`}
              >
                {next === null ? (
                  <span className="muted">{f.reason}</span>
                ) : (
                  <>
                    Next around {fmtDate(next.year, next.month, next.day)}
                    {f.behind && (
                      <span className="muted">
                        {" "}
                        · last one recorded {fmtDate(f.lastPaid)}
                      </span>
                    )}
                  </>
                )}
              </div>
              <div className="mono small coming-up-amount">
                {next === null ? (
                  <span className="muted">—</span>
                ) : (
                  <>≈ {fmtEUR(f.lastAmount)}</>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      {(forecasts.length > VISIBLE || unscheduled.length > 0) && (
        <div className="coming-up-foot muted small">
          {unscheduled.length > 0 && (
            <span data-testid="income-coming-up-unscheduled">
              {fmtCount(unscheduled.length, "source has", "sources have")} no
              date to expect, so{" "}
              {plural(unscheduled.length, "it isn’t", "they aren’t")} counted
              above.
            </span>
          )}
          {forecasts.length > VISIBLE && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => setShowAll((v) => !v)}
              aria-expanded={showAll}
              data-testid="income-coming-up-toggle"
            >
              {showAll ? "Show fewer" : `Show all ${forecasts.length}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
