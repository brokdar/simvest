"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { filterEventsByMonth, incomeByMonth } from "@/lib/calc"
import { fmtEUR } from "@/lib/format"
import {
  heatBucket,
  heatBucketBounds,
  HEAT_BUCKETS,
} from "@/lib/charts/heatmap"
import {
  dateMonthIdx,
  monthIdx,
  monthStatus,
  recordedSpan,
  type MonthStatus,
} from "@/lib/income-window"
import { fmtMonthLong, MONTH_SHORT } from "@/lib/dates"
import type { DividendBasis, IncomeEventDTO } from "@/lib/types"
import { ScrollFade } from "@/components/ui/scroll-fade"
import { MonthDetailTooltip } from "./month-detail-tooltip"

type Props = {
  events: IncomeEventDTO[]
  basis: DividendBasis
  selectedMonth: string | null
  onMonthSelect: (monthKey: string | null) => void
  /** SSR-anchored "now" — months after it are "still to come". */
  asOf: Date
}

const heatBg = (bucket: number) =>
  `color-mix(in srgb, var(--primary) ${bucket * 18}%, var(--surface))`

const STATUS_LABEL: Record<Exclude<MonthStatus, "paid">, string> = {
  none: "No payouts",
  unrecorded: "Nothing recorded yet",
  before: "Before your first payout",
  future: "Still to come",
}

const POPOVER_WIDTH = 240
/** Generous upper bound of the detail card height, for the flip decision. */
const POPOVER_HEIGHT = 240

export function IncomeCalendarHeatmap({
  events,
  basis,
  selectedMonth,
  onMonthSelect,
  asOf,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Transient mouse hover only — touch drives the popover through `touchKey`
  // (see the pointer guard on the cells) so a tap doesn't pin a synthetic hover.
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  // A tap pins the month's breakdown inline (M3), the same as the other
  // charts: it never selects the month, so the URL, the payouts ledger and the
  // scroll position stay put. Tap the cell again, or anywhere else, to close.
  const [touchKey, setTouchKey] = useState<string | null>(null)
  const lastPointer = useRef<string>("mouse")
  const [pos, setPos] = useState<{
    x: number
    y: number
    placement: "above" | "below"
  } | null>(null)

  // Hover wins, then a touch pin; otherwise the selected month shows its
  // breakdown.
  const activeKey = hoverKey ?? touchKey ?? selectedMonth

  useEffect(() => {
    if (touchKey === null) return
    const onDocTouch = (ev: Event) => {
      const target = ev.target as Element | null
      if (target?.closest?.("[data-heatmap-cell], [data-month-detail]")) return
      setTouchKey(null)
    }
    document.addEventListener("touchstart", onDocTouch, true)
    return () => document.removeEventListener("touchstart", onDocTouch, true)
  }, [touchKey])

  // Position the popover from the active cell's *rendered* rect rather than its
  // grid slot, and recompute on scroll/resize — the grid lives in a horizontal
  // scroll track (`.heatmap-scroll`), so a cell's on-screen x shifts as it
  // scrolls. The popover itself renders outside the track (not clipped).
  useEffect(() => {
    const container = containerRef.current
    if (!activeKey || !container) {
      setPos(null)
      return
    }
    const compute = () => {
      const cell = container.querySelector(
        `[data-testid="income-heatmap-cell-${activeKey}"]`
      )
      if (!cell) {
        setPos(null)
        return
      }
      const cellRect = cell.getBoundingClientRect()
      const wrapRect = container.getBoundingClientRect()
      const cx = cellRect.left + cellRect.width / 2 - wrapRect.left
      const clampedX = Math.max(
        0,
        Math.min(wrapRect.width - POPOVER_WIDTH, cx - POPOVER_WIDTH / 2)
      )
      // Flip above the cell when the card wouldn't fit under it in the
      // viewport (and there's more room above) instead of clipping off-screen.
      const spaceBelow = window.innerHeight - cellRect.bottom
      const flip = spaceBelow < POPOVER_HEIGHT && cellRect.top > spaceBelow
      setPos({
        x: clampedX,
        y: flip
          ? cellRect.top - wrapRect.top - 6
          : cellRect.bottom - wrapRect.top + 6,
        placement: flip ? "above" : "below",
      })
    }
    compute()
    const scroller = container.querySelector(".heatmap-scroll")
    scroller?.addEventListener("scroll", compute, { passive: true })
    window.addEventListener("resize", compute)
    window.addEventListener("scroll", compute, { passive: true })
    return () => {
      window.removeEventListener("scroll", compute)
      scroller?.removeEventListener("scroll", compute)
      window.removeEventListener("resize", compute)
    }
  }, [activeKey])

  const { years, grid, yearTotals, max, statusOf } = useMemo(() => {
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
    // One scale for every year (N11): a cell is measured against the largest
    // month on screen, not against its own year's peak.
    let max = 0
    for (const y of yearsArr) {
      const months = new Array(12).fill(0) as number[]
      for (let m = 1; m <= 12; m++) {
        months[m - 1] = cell.get(`${y}-${m}`) ?? 0
      }
      grid[y] = months
      yearTotals[y] = months.reduce((s, v) => s + v, 0)
      max = Math.max(max, ...months)
    }
    // A month after the last recorded payout is "not recorded yet", never a
    // €0 month (N5); one before the first payout or after today isn't data.
    const span = recordedSpan(events)
    const now = dateMonthIdx(asOf)
    const statusOf = (y: number, m: number, v: number): MonthStatus =>
      span ? monthStatus(monthIdx(y, m), v, { ...span, now }) : "none"
    return { years: yearsArr, grid, yearTotals, max, statusOf }
  }, [events, basis, asOf])

  if (years.length === 0) {
    return (
      <div className="muted small" style={{ padding: "30px 0" }}>
        No payouts recorded yet.
      </div>
    )
  }

  const activeParts = activeKey ? activeKey.split("-").map(Number) : null

  return (
    <div
      ref={containerRef}
      data-testid="income-heatmap"
      aria-label="Income calendar heatmap by year and month"
      style={{ position: "relative" }}
    >
      {/* On phones the 14-column grid can't shrink to fit ~390px without the
          month cells collapsing to ~10px (untappable) and the headers
          overlapping. Rather than transpose the grid — which would mean
          rewriting the row/label generation and forfeiting the data-testids —
          we keep the exact grid intact and let it scroll horizontally inside
          a min-width inner track (`.heatmap-track`), so each cell stays a
          legible, tappable ~34px. Desktop is unaffected (no min-width). */}
      <ScrollFade className="heatmap-scroll" testId="income-heatmap-scroll">
        <div className="heatmap-track">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "44px repeat(12, 1fr) 80px",
              gap: 6,
              fontSize: "var(--fs-2xs)",
              color: "var(--neutral-400)",
              marginBottom: 6,
            }}
          >
            <div />
            {MONTH_SHORT.map((m) => (
              <div key={m} style={{ textAlign: "center" }}>
                {m}
              </div>
            ))}
            <div style={{ textAlign: "right" }}>Total</div>
          </div>
          {years.map((y) => {
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
                <div style={{ fontSize: "var(--fs-xs)", fontWeight: 600 }}>
                  {y}
                </div>
                {grid[y].map((v, idx) => {
                  const month = idx + 1
                  const key = `${y}-${String(month).padStart(2, "0")}`
                  const isSelected = selectedMonth === key
                  const status = statusOf(y, month, v)
                  const bucket = heatBucket(v, max)
                  const bg =
                    status === "paid"
                      ? heatBg(bucket)
                      : status === "none"
                        ? "var(--neutral-50)"
                        : "transparent"
                  const fg =
                    bucket >= 4
                      ? "var(--primary-foreground)"
                      : "var(--neutral-600)"
                  const border = isSelected
                    ? "2px solid var(--primary)"
                    : status === "unrecorded"
                      ? "1px dashed var(--neutral-300)"
                      : status === "before" || status === "future"
                        ? "1px solid transparent"
                        : "1px solid var(--border)"
                  return (
                    <button
                      key={key}
                      type="button"
                      data-testid={`income-heatmap-cell-${key}`}
                      data-status={status}
                      aria-label={
                        status === "paid"
                          ? `${fmtMonthLong(y, month)}: ${fmtEUR(v)}`
                          : `${fmtMonthLong(y, month)}: ${STATUS_LABEL[status]}`
                      }
                      // Only a real mouse hover is transient; touch taps drive
                      // the popover through the selected month (below) so a tap
                      // doesn't leave a synthetic hover pinned.
                      data-heatmap-cell=""
                      onPointerDown={(e) => {
                        lastPointer.current = e.pointerType
                      }}
                      onKeyDown={() => {
                        lastPointer.current = "keyboard"
                      }}
                      onPointerEnter={(e) => {
                        if (e.pointerType === "mouse") setHoverKey(key)
                      }}
                      onMouseLeave={() => setHoverKey(null)}
                      onFocus={() => {
                        if (lastPointer.current !== "touch") setHoverKey(key)
                      }}
                      onBlur={() => setHoverKey(null)}
                      onClick={() => {
                        if (lastPointer.current === "touch") {
                          setTouchKey((k) => (k === key ? null : key))
                          return
                        }
                        onMonthSelect(isSelected ? null : key)
                      }}
                      className="heatmap-cell focus-ring"
                      style={{
                        border,
                        background: bg,
                        color: fg,
                        borderRadius: 4,
                        cursor: "pointer",
                        fontSize: "var(--fs-2xs)",
                        fontWeight: 600,
                        padding: 0,
                        textAlign: "center",
                        touchAction: "manipulation",
                      }}
                    >
                      {status === "none" ? "‒" : ""}
                    </button>
                  )
                })}
                <div
                  className="mono"
                  data-testid={`income-heatmap-year-total-${y}`}
                  style={{
                    textAlign: "right",
                    fontSize: "var(--fs-xs)",
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmtEUR(yearTotals[y], { compact: true })}
                </div>
              </div>
            )
          })}
        </div>
      </ScrollFade>
      <HeatLegend max={max} />
      {activeParts && pos && (
        <MonthDetailTooltip
          testId="income-heatmap-detail"
          left={pos.x}
          top={pos.y}
          placement={pos.placement}
          width={POPOVER_WIDTH}
          onShowMonth={
            touchKey !== null && hoverKey === null
              ? () => {
                  onMonthSelect(touchKey)
                  setTouchKey(null)
                }
              : undefined
          }
          year={activeParts[0]}
          month={activeParts[1]}
          basis={basis}
          events={filterEventsByMonth(events, activeParts[0], activeParts[1])}
          emptyText={(() => {
            const st = statusOf(
              activeParts[0],
              activeParts[1],
              grid[activeParts[0]]?.[activeParts[1] - 1] ?? 0
            )
            return st === "paid" ? undefined : STATUS_LABEL[st]
          })()}
        />
      )}
    </div>
  )
}

/** Shade key for the one shared scale, plus the two non-amount states. */
function HeatLegend({ max }: { max: number }) {
  const bounds = heatBucketBounds(max)
  return (
    <div
      className="heatmap-legend muted"
      data-testid="income-heatmap-legend"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        gap: "6px 14px",
        marginTop: 10,
        fontSize: "var(--fs-2xs)",
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <span>{fmtEUR(0, { compact: true })}</span>
        {Array.from({ length: HEAT_BUCKETS }, (_, i) => (
          <span
            key={i}
            aria-hidden="true"
            title={`up to ${fmtEUR(bounds[i], { compact: true })}`}
            style={{
              width: 14,
              height: 14,
              borderRadius: 3,
              border: "1px solid var(--border)",
              background: heatBg(i + 1),
            }}
          />
        ))}
        <span data-testid="income-heatmap-legend-max">
          {fmtEUR(max, { compact: true })} / month
        </span>
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <span
          aria-hidden="true"
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            border: "1px solid var(--border)",
            background: "var(--neutral-50)",
            textAlign: "center",
            lineHeight: "12px",
          }}
        >
          ‒
        </span>
        No payouts
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
        <span
          aria-hidden="true"
          style={{
            width: 14,
            height: 14,
            borderRadius: 3,
            border: "1px dashed var(--neutral-300)",
          }}
        />
        Not recorded yet
      </span>
    </div>
  )
}
