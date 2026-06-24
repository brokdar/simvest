"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { aggregateIncomeByMonthSource, filterEventsByMonth } from "@/lib/calc"
import { niceTicks } from "@/lib/charts/scales"
import { fmtEUR } from "@/lib/format"
import {
  type DividendBasis,
  type IncomeEventDTO,
  type IncomeKind,
} from "@/lib/types"
import { MonthDetailTooltip } from "./month-detail-tooltip"
import { buildSourceColors, OTHERS_COLOR } from "./income-source-palette"

type Props = {
  events: IncomeEventDTO[]
  basis: DividendBasis
  kindFilter: IncomeKind | "all"
  selectedMonth: string | null
  onMonthSelect: (monthKey: string | null) => void
  /** Hovered/selected holding from the table or donut — dims the rest. */
  highlightedHoldingId: number | "interest" | null
  height?: number
}

type Segment = {
  id: number | "interest" | "others"
  color: string
  amount: number
  rank: number
}

const TOOLTIP_WIDTH = 240

export function MonthlyPayoutsChart({
  events,
  basis,
  kindFilter,
  selectedMonth,
  onMonthSelect,
  highlightedHoldingId,
  height = 260,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [W, setW] = useState(640)
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((ents) => {
      for (const e of ents) setW(Math.max(320, Math.floor(e.contentRect.width)))
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const buckets = useMemo(
    () => aggregateIncomeByMonthSource(events, basis),
    [events, basis]
  )
  // Same ranking the donut uses, so a holding owns one color across the page.
  const colors = useMemo(
    () => buildSourceColors(events, kindFilter, basis),
    [events, kindFilter, basis]
  )

  // Fold each month into top-N colored segments + one "Others" segment,
  // stacked in a stable order (rank 0 at the baseline) so a holding occupies
  // the same band every month.
  const segmented = useMemo(
    () =>
      buckets.map((b) => {
        let others = 0
        const segs: Segment[] = []
        for (const s of b.sources) {
          if (colors.isTop(s.id)) {
            segs.push({
              id: s.id,
              color: colors.colorFor(s.id),
              amount: s.amount,
              rank: colors.rankOf(s.id),
            })
          } else {
            others += s.amount
          }
        }
        segs.sort((a, c) => a.rank - c.rank)
        if (others > 0) {
          segs.push({
            id: "others",
            color: OTHERS_COLOR,
            amount: others,
            rank: Number.POSITIVE_INFINITY,
          })
        }
        return { ...b, segs }
      }),
    [buckets, colors]
  )

  // Sliding-window trailing-12mo sum — O(n).
  const trailing12: number[] = useMemo(() => {
    const out: number[] = []
    let sum = 0
    const window: number[] = []
    for (const b of buckets) {
      window.push(b.total)
      sum += b.total
      if (window.length > 12) sum -= window.shift()!
      out.push(sum)
    }
    return out
  }, [buckets])

  const H = height
  const pad = { l: 52, r: 48, t: 16, b: 32 }
  const iw = Math.max(0, W - pad.l - pad.r)
  const ih = Math.max(0, H - pad.t - pad.b)
  const n = buckets.length
  const baseY = pad.t + ih

  // Two independent scales: monthly bars get the left axis, the trailing-12mo
  // line gets the right. Sharing one axis (the old bug) flattened the bars to
  // a sliver because a 12-month sum dwarfs any single month.
  const maxBarRaw = Math.max(0, ...segmented.map((b) => b.total))
  const maxLineRaw = Math.max(0, ...trailing12)
  const barScale = niceTicks(0, maxBarRaw || 1, 3)
  const lineScale = niceTicks(0, maxLineRaw || 1, 3)
  const barMax = Math.max(1, barScale.max)
  const lineMax = Math.max(1, lineScale.max)

  // Band scale: each month owns a slot of width `band`, and everything tied to
  // that month (bar, line vertex, tick label, hit target) is centered on the
  // slot. The old point scale pinned the first/last vertices to the plot edges,
  // so the outer bars' outer halves spilled into the axis gutters and painted
  // over the €-value labels. Centering on bands keeps every bar inside the plot
  // while the line simply insets by half a slot on each end.
  const band = iw / Math.max(1, n)
  const x = (i: number) => pad.l + (i + 0.5) * band
  const yBar = (v: number) => baseY - (v / barMax) * ih
  const yLine = (v: number) => baseY - (v / lineMax) * ih
  const barW = Math.max(4, Math.min(40, band * 0.6))

  const tickStride = Math.max(1, Math.ceil(n / 6))

  const linePath = trailing12
    .map(
      (v, i) =>
        (i === 0 ? "M" : "L") + x(i).toFixed(1) + " " + yLine(v).toFixed(1)
    )
    .join(" ")
  const areaPath =
    trailing12.length > 0
      ? `${linePath} L ${x(trailing12.length - 1).toFixed(1)} ${baseY.toFixed(1)} L ${x(0).toFixed(1)} ${baseY.toFixed(1)} Z`
      : ""

  const highlightActive = highlightedHoldingId !== null
  const highlightColor =
    highlightedHoldingId !== null && colors.isTop(highlightedHoldingId)
      ? colors.colorFor(highlightedHoldingId)
      : "var(--primary)"

  const hoverBucket = hoverIdx !== null ? buckets[hoverIdx] : null

  // Tooltip follows the hovered bar's x (clamped inside the chart) and sits
  // above the bar top when there's room, else hangs below it — so it reads as
  // attached to what you're pointing at instead of floating at the top.
  // Derived inline rather than memoized: it's consumed in the same render and
  // depends only on `x()`/`yBar()` (pure layout fns), so there's no identity
  // worth preserving and no deps list to keep honest.
  const tooltip = (() => {
    if (hoverIdx === null) return null
    const total = segmented[hoverIdx]?.total ?? 0
    const barTopPx = yBar(total)
    const rawLeft = x(hoverIdx) - TOOLTIP_WIDTH / 2
    const left = Math.max(
      8,
      Math.min(Math.max(8, W - TOOLTIP_WIDTH - 8), rawLeft)
    )
    // Drop the card below the bar top when the bar reaches into the upper
    // half of the plot (an above-placed card would clip the chart top).
    // Proportional to height so it holds when the `height` prop changes,
    // instead of a magic pixel threshold tied to today's card size.
    const placement: "above" | "below" =
      barTopPx < pad.t + ih * 0.5 ? "below" : "above"
    const top = placement === "above" ? barTopPx - 8 : barTopPx + 8
    return { left, top, placement }
  })()

  if (n === 0) {
    return (
      <div
        ref={containerRef}
        data-testid="income-monthly-chart"
        className="muted small"
        style={{ padding: "40px 0" }}
      >
        No income recorded yet.
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      data-testid="income-monthly-chart"
      data-highlighted-source={
        highlightedHoldingId === null ? undefined : String(highlightedHoldingId)
      }
      style={{ position: "relative" }}
    >
      <svg
        role="img"
        aria-label="Monthly payouts by holding, with trailing 12-month income line"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="xMidYMid meet"
        style={{ display: "block" }}
        onMouseLeave={() => setHoverIdx(null)}
      >
        {/* Left-axis gridlines + labels (bar scale). */}
        {barScale.ticks.map((t) => (
          <g key={`gl-${t}`}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={yBar(t)}
              y2={yBar(t)}
              stroke="var(--border)"
              opacity={t === 0 ? 1 : 0.5}
            />
            <text
              x={pad.l - 8}
              y={yBar(t) + 3}
              textAnchor="end"
              fontSize="10"
              fill="var(--neutral-400)"
              fontFamily="var(--font-body)"
            >
              {fmtEUR(t, { compact: true })}
            </text>
          </g>
        ))}
        {/* Right-axis labels (line scale) — no gridlines, to keep it clean. */}
        {lineScale.ticks.map((t) => (
          <text
            key={`rl-${t}`}
            x={W - pad.r + 6}
            y={yLine(t) + 3}
            textAnchor="start"
            fontSize="10"
            fill="var(--primary-500)"
            fontFamily="var(--font-body)"
          >
            {fmtEUR(t, { compact: true })}
          </text>
        ))}

        {/* Hover guide line — connects the tooltip to the hovered month. */}
        {hoverIdx !== null && (
          <line
            x1={x(hoverIdx)}
            x2={x(hoverIdx)}
            y1={pad.t}
            y2={baseY}
            stroke="var(--primary)"
            strokeWidth={1}
            opacity={0.25}
          />
        )}

        {/* Stacked bars, by holding. Dimmed to ghost when a holding is held. */}
        <g
          style={{
            opacity: highlightActive ? 0.18 : 1,
            transition: "opacity 120ms ease",
          }}
        >
          {segmented.map((b, i) => {
            const isSelected = selectedMonth === b.key
            let acc = 0
            return (
              <g key={b.key} data-testid={`income-bar-${b.key}`}>
                {b.segs.map((seg) => {
                  const yTop = yBar(acc + seg.amount)
                  const h = yBar(acc) - yTop
                  acc += seg.amount
                  return (
                    <rect
                      key={String(seg.id)}
                      x={x(i) - barW / 2}
                      y={yTop}
                      width={barW}
                      height={Math.max(1.5, h)}
                      fill={seg.color}
                      rx="1.5"
                    />
                  )
                })}
                {isSelected && (
                  <rect
                    x={x(i) - barW / 2 - 2}
                    y={yBar(b.total) - 2}
                    width={barW + 4}
                    height={Math.max(4, baseY - yBar(b.total) + 4)}
                    fill="none"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    rx="3"
                  />
                )}
              </g>
            )
          })}
        </g>

        {/* Highlighted holding's own monthly bars, drawn on top at full color. */}
        {highlightActive && (
          <g data-testid="income-bar-highlight">
            {buckets.map((b, i) => {
              const amt =
                b.sources.find((s) => s.id === highlightedHoldingId)?.amount ??
                0
              if (amt <= 0) return null
              const yTop = yBar(amt)
              return (
                <rect
                  key={b.key}
                  x={x(i) - barW / 2}
                  y={yTop}
                  width={barW}
                  height={Math.max(1.5, baseY - yTop)}
                  fill={highlightColor}
                  rx="1.5"
                />
              )
            })}
          </g>
        )}

        {/* Trailing-12mo income — area + line on the right axis. */}
        {areaPath && (
          <path
            d={areaPath}
            fill="var(--primary-500)"
            opacity={highlightActive ? 0.04 : 0.08}
          />
        )}
        <path
          d={linePath}
          fill="none"
          stroke="var(--primary-500)"
          strokeWidth={2}
          opacity={highlightActive ? 0.25 : 1}
          style={{ transition: "opacity 120ms ease" }}
        />
        {trailing12.length > 0 && !highlightActive && (
          <circle
            cx={x(trailing12.length - 1)}
            cy={yLine(trailing12[trailing12.length - 1])}
            r={3.5}
            fill="var(--primary-500)"
          />
        )}

        {/* Month axis labels. */}
        {buckets.map((b, i) =>
          i % tickStride === 0 || i === n - 1 ? (
            <text
              key={`tk-${b.key}`}
              x={x(i)}
              y={baseY + 18}
              textAnchor="middle"
              fontSize="11"
              fill="var(--neutral-400)"
              fontFamily="var(--font-body)"
            >
              {b.label}
            </text>
          ) : null
        )}

        {/* Invisible hit targets — one per month. */}
        {buckets.map((b, i) => (
          <rect
            key={`hit-${b.key}`}
            x={x(i) - band / 2}
            y={pad.t}
            width={band}
            height={ih}
            fill="transparent"
            data-testid={`income-bar-hit-${b.key}`}
            className="focus-ring-svg"
            style={{ touchAction: "manipulation", cursor: "pointer" }}
            onMouseEnter={() => setHoverIdx(i)}
            onFocus={() => setHoverIdx(i)}
            onBlur={() => setHoverIdx(null)}
            onClick={() =>
              onMonthSelect(selectedMonth === b.key ? null : b.key)
            }
            onKeyDown={(e) => {
              // role="button" promises Enter/Space activation — a native
              // <rect> doesn't provide it, so wire it explicitly.
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault()
                onMonthSelect(selectedMonth === b.key ? null : b.key)
              }
            }}
            tabIndex={0}
            role="button"
            aria-label={`${b.label}: ${fmtEUR(b.total)}`}
          />
        ))}
      </svg>

      {hoverBucket && tooltip && (
        <MonthDetailTooltip
          testId="income-monthly-detail"
          left={tooltip.left}
          top={tooltip.top}
          placement={tooltip.placement}
          width={TOOLTIP_WIDTH}
          year={hoverBucket.year}
          month={hoverBucket.month}
          basis={basis}
          events={filterEventsByMonth(
            events,
            hoverBucket.year,
            hoverBucket.month
          )}
        />
      )}

      <div className="legend" style={{ marginTop: 8 }}>
        <span className="it">
          <span
            className="sw line"
            style={{ background: "var(--primary-500)" }}
          />
          Income · trailing 12 mo
        </span>
      </div>
      <div className="muted small" style={{ marginTop: 4 }}>
        Bars stack each month’s payouts by holding (colors match{" "}
        <strong>By Source</strong>). The line is your total income over the
        trailing 12 months — an annual run-rate, read against the right axis.
      </div>
    </div>
  )
}
