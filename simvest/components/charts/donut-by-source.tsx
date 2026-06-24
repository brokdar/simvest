"use client"

import { useId, useMemo } from "react"
import { aggregateIncomeBySource } from "@/lib/calc"
import { fmtEUR, fmtPct } from "@/lib/format"
import type { DividendBasis, IncomeEventDTO, IncomeKind } from "@/lib/types"
import { OTHERS_COLOR, SOURCE_PALETTE } from "./income-source-palette"

type Props = {
  events: IncomeEventDTO[]
  basis: DividendBasis
  kindFilter: IncomeKind | "all"
  highlightedHoldingId: number | "interest" | null
  onHighlightChange: (id: number | "interest" | null) => void
  onSelect: (id: number | "interest") => void
}

type DonutSlice =
  | {
      kind: "holding"
      key: string
      id: number | "interest"
      name: string
      total: number
      pct: number
      color: string
    }
  | {
      kind: "others"
      key: "others"
      name: "Others"
      total: number
      pct: number
      color: string
    }

// Palette + Others color are shared with the monthly bars (see
// income-source-palette) so a holding keeps one color across the page.
const PALETTE = SOURCE_PALETTE

export function DonutBySource({
  events,
  basis,
  kindFilter,
  highlightedHoldingId,
  onHighlightChange,
  onSelect,
}: Props) {
  const legendId = useId()

  const slices: DonutSlice[] = useMemo(() => {
    const raw = aggregateIncomeBySource(events, kindFilter, basis)
    if (raw.length === 0) return []
    const top = raw.slice(0, 6).map<DonutSlice>((s, i) => ({
      kind: "holding",
      key: s.holdingId === null ? "interest" : `holding:${s.holdingId}`,
      id: s.holdingId === null ? "interest" : s.holdingId,
      name: s.name,
      total: s.total,
      pct: s.pct,
      color: PALETTE[i % PALETTE.length],
    }))
    if (raw.length > 6) {
      const restTotal = raw.slice(6).reduce((sum, s) => sum + s.total, 0)
      const restPct = raw.slice(6).reduce((sum, s) => sum + s.pct, 0)
      top.push({
        kind: "others",
        key: "others",
        name: "Others",
        total: restTotal,
        pct: restPct,
        color: OTHERS_COLOR,
      })
    }
    return top
  }, [events, basis, kindFilter])

  if (slices.length === 0) {
    return (
      <div
        className="muted small"
        data-testid="income-donut-empty"
        style={{ padding: "30px 0" }}
      >
        No payouts recorded yet — record your first to populate this view.
      </div>
    )
  }

  return (
    <div
      data-testid="income-donut"
      style={{
        display: "flex",
        gap: 16,
        alignItems: "center",
        flexWrap: "wrap",
      }}
    >
      <Donut
        slices={slices}
        highlightedHoldingId={highlightedHoldingId}
        onHighlightChange={onHighlightChange}
        onSelect={onSelect}
        legendId={legendId}
      />
      <ul
        role="list"
        id={legendId}
        data-testid="income-donut-legend"
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: 6,
          flex: 1,
          minWidth: 160,
        }}
      >
        {slices.map((s) => {
          const isOthers = s.kind === "others"
          const dim =
            highlightedHoldingId !== null &&
            !isOthers &&
            highlightedHoldingId !== s.id
          return (
            <li key={s.key}>
              <button
                type="button"
                data-testid={`income-donut-legend-${s.key}`}
                onMouseEnter={() =>
                  s.kind === "holding" && onHighlightChange(s.id)
                }
                onMouseLeave={() => onHighlightChange(null)}
                onFocus={() => s.kind === "holding" && onHighlightChange(s.id)}
                onBlur={() => onHighlightChange(null)}
                onClick={() => s.kind === "holding" && onSelect(s.id)}
                disabled={isOthers}
                className="focus-ring"
                aria-label={`${s.name}, ${fmtEUR(s.total)}, ${fmtPct(s.pct, 1)}`}
                style={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "10px minmax(0, 1fr) auto",
                  alignItems: "center",
                  gap: 8,
                  padding: "4px 6px",
                  borderRadius: 6,
                  border: "1px solid transparent",
                  background: "transparent",
                  cursor: isOthers ? "default" : "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                  fontSize: 12,
                  opacity: dim ? 0.45 : 1,
                  transition: "opacity 120ms ease, background-color 120ms ease",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    background: s.color,
                    display: "inline-block",
                  }}
                />
                <span
                  translate="no"
                  title={s.name}
                  style={{
                    fontWeight: 600,
                    color: "var(--neutral-800)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {s.name}
                </span>
                <span
                  className="mono muted"
                  style={{ fontSize: 11, whiteSpace: "nowrap" }}
                >
                  {fmtPct(s.pct, 1)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function Donut({
  slices,
  highlightedHoldingId,
  onHighlightChange,
  onSelect,
  legendId,
}: {
  slices: DonutSlice[]
  highlightedHoldingId: number | "interest" | null
  onHighlightChange: (id: number | "interest" | null) => void
  onSelect: (id: number | "interest") => void
  legendId: string
}) {
  const size = 220
  const cx = size / 2
  const cy = size / 2
  const radius = 90
  const innerRadius = 60

  const grandTotal = slices.reduce((s, sl) => s + sl.total, 0) || 1
  // Precompute slice arc ranges so we don't mutate a render-scoped cursor.
  const arcs = (() => {
    const out: Array<{ start: number; end: number }> = []
    let acc = -Math.PI / 2
    for (const sl of slices) {
      const angle = (sl.total / grandTotal) * Math.PI * 2
      out.push({ start: acc, end: acc + angle })
      acc += angle
    }
    return out
  })()

  return (
    <svg
      role="img"
      aria-label="Income by source"
      aria-describedby={legendId}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
    >
      <title>Income by source</title>
      <g transform={`translate(${cx} ${cy})`}>
        {slices.map((s, i) => {
          const { start, end } = arcs[i]
          const path = donutSlicePath(start, end, radius, innerRadius)
          const isOthers = s.kind === "others"
          const isActive =
            !isOthers &&
            (highlightedHoldingId === null ||
              (s.kind === "holding" && highlightedHoldingId === s.id))
          return (
            <path
              key={s.key}
              d={path}
              fill={s.color}
              stroke="var(--surface)"
              strokeWidth={2}
              data-testid={`income-donut-slice-${s.key}`}
              aria-hidden="true"
              style={{
                opacity: isActive ? 1 : 0.3,
                cursor: isOthers ? "default" : "pointer",
                transition: "opacity 120ms ease",
                touchAction: "manipulation",
              }}
              onMouseEnter={() =>
                s.kind === "holding" && onHighlightChange(s.id)
              }
              onMouseLeave={() => onHighlightChange(null)}
              onClick={() => s.kind === "holding" && onSelect(s.id)}
            />
          )
        })}
      </g>
      <text
        x={cx}
        y={cy - 6}
        textAnchor="middle"
        fontSize="11"
        fill="var(--neutral-400)"
        fontFamily="var(--font-body)"
        style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}
      >
        Total
      </text>
      <text
        x={cx}
        y={cy + 16}
        textAnchor="middle"
        fontSize="18"
        fontWeight={700}
        fill="var(--neutral-800)"
        fontFamily="var(--font-head)"
        style={{ fontVariantNumeric: "tabular-nums" }}
      >
        {fmtEUR(grandTotal, { compact: true })}
      </text>
    </svg>
  )
}

function donutSlicePath(
  start: number,
  end: number,
  outerR: number,
  innerR: number
): string {
  const largeArc = end - start > Math.PI ? 1 : 0
  const x1 = Math.cos(start) * outerR
  const y1 = Math.sin(start) * outerR
  const x2 = Math.cos(end) * outerR
  const y2 = Math.sin(end) * outerR
  const x3 = Math.cos(end) * innerR
  const y3 = Math.sin(end) * innerR
  const x4 = Math.cos(start) * innerR
  const y4 = Math.sin(start) * innerR
  return [
    `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `L ${x3.toFixed(2)} ${y3.toFixed(2)}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
    "Z",
  ].join(" ")
}
