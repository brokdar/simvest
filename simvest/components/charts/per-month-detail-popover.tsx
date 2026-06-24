"use client"

import { useMemo } from "react"
import { aggregateIncomeByHoldingMonth, eventAmount } from "@/lib/calc"
import { fmtEUR } from "@/lib/format"
import { labelFor, type DividendBasis, type IncomeEventDTO } from "@/lib/types"

type Props = {
  year: number
  month: number
  basis: DividendBasis
  /** Already-narrowed to (year, month). The popover trusts the prop. */
  events: IncomeEventDTO[]
  testId?: string
}

export function PerMonthDetailPopover({
  year,
  month,
  basis,
  events,
  testId,
}: Props) {
  const rows = useMemo(
    () => aggregateIncomeByHoldingMonth(events, year, month, basis),
    [events, year, month, basis]
  )
  const total = useMemo(
    () => events.reduce((s, e) => s + eventAmount(e, basis), 0),
    [events, basis]
  )

  const count = rows.reduce((s, r) => s + r.count, 0)
  const dividendRows = rows.filter((r) => r.kind === "dividend")
  const interestRow = rows.find((r) => r.kind === "interest")

  return (
    <div
      data-testid={testId ?? "income-month-detail"}
      data-month={`${year}-${String(month).padStart(2, "0")}`}
      style={{
        // Fill the host card (MonthDetailTooltip controls width). A fixed
        // minWidth here used to exceed the card's content box and bleed past
        // its rounded border — the bug behind both broken tooltips.
        width: "100%",
        minWidth: 0,
        color: "var(--neutral-800)",
        fontSize: 12,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 8,
          paddingBottom: 8,
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 13 }}>
          {labelFor(year, month)}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700 }}>{fmtEUR(total)}</div>
          <div className="muted" style={{ fontSize: 11 }}>
            {count} {count === 1 ? "payout" : "payouts"}
          </div>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="muted small">No payouts</div>
      ) : (
        <ul
          role="list"
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {dividendRows.map((r) => (
            <li
              key={`${r.holdingId ?? "interest"}`}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              <span
                translate="no"
                title={r.holdingName}
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontWeight: 600,
                }}
              >
                {r.holdingName}
              </span>
              <span style={{ fontWeight: 600 }}>{fmtEUR(r.amount)}</span>
            </li>
          ))}
          {interestRow && (
            <li
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                paddingTop: 4,
                marginTop: 4,
                borderTop: "1px dashed var(--border)",
                color: "var(--neutral-600)",
              }}
            >
              <span style={{ fontWeight: 600 }}>Interest</span>
              <span style={{ fontWeight: 600 }}>
                {fmtEUR(interestRow.amount)}
              </span>
            </li>
          )}
        </ul>
      )}
    </div>
  )
}
