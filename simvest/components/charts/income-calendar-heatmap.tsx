"use client"

import { useMemo, useRef, useState } from "react"
import { filterEventsByMonth, incomeByMonth } from "@/lib/calc"
import { fmtEUR } from "@/lib/format"
import { labelFor, type DividendBasis, type IncomeEventDTO } from "@/lib/types"
import { MonthDetailTooltip } from "./month-detail-tooltip"

type Props = {
  events: IncomeEventDTO[]
  basis: DividendBasis
  selectedMonth: string | null
  onMonthSelect: (monthKey: string | null) => void
}

const MONTH_HEADERS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

const POPOVER_WIDTH = 240

export function IncomeCalendarHeatmap({
  events,
  basis,
  selectedMonth,
  onMonthSelect,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(
    null
  )

  const { years, grid, yearTotals, yearMax } = useMemo(() => {
    const map = incomeByMonth(events, undefined, "all", basis)
    const yearSet = new Set<number>()
    const cell = new Map<string, number>()
    for (const [k, v] of map.entries()) {
      const [yStr, mStr] = k.split("-")
      const year = parseInt(yStr, 10)
      const month = parseInt(mStr, 10)
      yearSet.add(year)
      cell.set(`${year}-${month}`, v)
    }
    const yearsArr = [...yearSet].sort((a, b) => b - a)
    const grid: Record<number, number[]> = {}
    const yearTotals: Record<number, number> = {}
    const yearMax: Record<number, number> = {}
    for (const y of yearsArr) {
      const months = new Array(12).fill(0) as number[]
      for (let m = 1; m <= 12; m++) {
        months[m - 1] = cell.get(`${y}-${m}`) ?? 0
      }
      grid[y] = months
      yearTotals[y] = months.reduce((s, v) => s + v, 0)
      yearMax[y] = Math.max(...months)
    }
    return { years: yearsArr, grid, yearTotals, yearMax }
  }, [events, basis])

  if (years.length === 0) {
    return (
      <div className="muted small" style={{ padding: "30px 0" }}>
        No payouts recorded yet.
      </div>
    )
  }

  const hoverParts = hoverKey ? hoverKey.split("-").map(Number) : null

  const trackCell = (e: React.SyntheticEvent<HTMLElement>, key: string) => {
    setHoverKey(key)
    const container = containerRef.current
    if (!container) return
    const cellRect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const wrapRect = container.getBoundingClientRect()
    const cx = cellRect.left + cellRect.width / 2 - wrapRect.left
    const clampedX = Math.max(
      0,
      Math.min(wrapRect.width - POPOVER_WIDTH, cx - POPOVER_WIDTH / 2)
    )
    setHoverPos({
      x: clampedX,
      y: cellRect.bottom - wrapRect.top + 6,
    })
  }
  const clearCell = () => {
    setHoverKey(null)
    setHoverPos(null)
  }

  return (
    <div
      ref={containerRef}
      data-testid="income-heatmap"
      aria-label="Income calendar heatmap by year and month"
      style={{ position: "relative" }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "44px repeat(12, 1fr) 80px",
          gap: 6,
          fontSize: 11,
          color: "var(--neutral-400)",
          marginBottom: 6,
        }}
      >
        <div />
        {MONTH_HEADERS.map((m) => (
          <div key={m} style={{ textAlign: "center" }}>
            {m}
          </div>
        ))}
        <div style={{ textAlign: "right" }}>Total</div>
      </div>
      {years.map((y) => {
        const max = yearMax[y] || 1
        return (
          <div
            key={y}
            style={{
              display: "grid",
              gridTemplateColumns: "44px repeat(12, 1fr) 80px",
              gap: 6,
              marginBottom: 6,
              alignItems: "center",
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 600 }}>{y}</div>
            {grid[y].map((v, idx) => {
              const month = idx + 1
              const key = `${y}-${String(month).padStart(2, "0")}`
              const isSelected = selectedMonth === key
              const bucket = v === 0 ? 0 : Math.min(5, Math.ceil((v / max) * 5))
              const bg =
                bucket === 0
                  ? "var(--neutral-50)"
                  : `color-mix(in srgb, var(--primary) ${bucket * 18}%, var(--surface))`
              const fg = bucket >= 4 ? "#fff" : "var(--neutral-700)"
              return (
                <button
                  key={key}
                  type="button"
                  data-testid={`income-heatmap-cell-${key}`}
                  aria-label={
                    v === 0
                      ? `No payouts in ${labelFor(y, month)}`
                      : `${labelFor(y, month)}: ${fmtEUR(v)}`
                  }
                  onMouseEnter={(e) => trackCell(e, key)}
                  onMouseLeave={clearCell}
                  onFocus={(e) => trackCell(e, key)}
                  onBlur={clearCell}
                  onClick={() => onMonthSelect(isSelected ? null : key)}
                  className="focus-ring"
                  style={{
                    border: isSelected
                      ? "2px solid var(--primary)"
                      : "1px solid var(--border)",
                    background: bg,
                    color: fg,
                    height: 30,
                    borderRadius: 4,
                    cursor: "pointer",
                    fontSize: 11,
                    fontWeight: 600,
                    padding: 0,
                    textAlign: "center",
                    touchAction: "manipulation",
                  }}
                >
                  {v === 0 ? "‒" : ""}
                </button>
              )
            })}
            <div
              className="mono"
              data-testid={`income-heatmap-year-total-${y}`}
              style={{
                textAlign: "right",
                fontSize: 12,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {fmtEUR(yearTotals[y], { compact: true })}
            </div>
          </div>
        )
      })}
      {hoverParts && hoverPos && (
        <MonthDetailTooltip
          testId="income-heatmap-detail"
          left={hoverPos.x}
          top={hoverPos.y}
          placement="below"
          width={POPOVER_WIDTH}
          year={hoverParts[0]}
          month={hoverParts[1]}
          basis={basis}
          events={filterEventsByMonth(events, hoverParts[0], hoverParts[1])}
        />
      )}
    </div>
  )
}
