"use client"

/**
 * Shared SVG axis primitives for hand-rolled charts. The codebase deliberately
 * avoids Recharts / Visx / D3 — these components render the gridlines + tick
 * labels every chart was already drawing inline.
 *
 * Tick math (positions, "nice" upper bound) lives in `lib/charts/scales.ts`;
 * these components only render what the chart hands them.
 */

import type { ReactElement } from "react"

/**
 * Same shape as `AxisTick` from `lib/charts/scales.ts` — `screen` carries the
 * Y pixel coordinate. Kept structural so callers can pass `axisLayout()`
 * output directly without an adapter `.map`.
 */
export type YAxisTick = { value: number; screen: number }

/**
 * Horizontal gridlines + left-edge labels. Each tick draws a dashed line
 * across the plot area and a right-aligned label outside the left margin.
 */
export function YAxis({
  ticks,
  left,
  right,
  formatLabel,
}: {
  ticks: YAxisTick[]
  left: number
  right: number
  formatLabel: (value: number) => string
}): ReactElement {
  return (
    <g aria-hidden="true">
      {ticks.map((t, i) => (
        <g key={`y${i}`}>
          <line
            x1={left}
            x2={right}
            y1={t.screen}
            y2={t.screen}
            stroke="var(--border)"
            strokeDasharray="2 3"
          />
          <text
            x={left - 8}
            y={t.screen + 3}
            textAnchor="end"
            fontSize="11"
            fill="var(--neutral-400)"
            fontFamily="var(--font-body)"
          >
            {formatLabel(t.value)}
          </text>
        </g>
      ))}
    </g>
  )
}

export type XAxisTick = { x: number; label: string }

/**
 * Bottom-edge axis: short tick marks on the baseline plus centered labels.
 * The chart owns tick placement (year stride, etc.) — this just renders.
 */
export function XAxis({
  ticks,
  baseline,
}: {
  ticks: XAxisTick[]
  baseline: number
}): ReactElement {
  return (
    <g aria-hidden="true">
      {ticks.map((t, i) => (
        <g key={`x${i}`}>
          <line
            x1={t.x}
            x2={t.x}
            y1={baseline}
            y2={baseline + 4}
            stroke="var(--border)"
          />
          <text
            x={t.x}
            y={baseline + 18}
            textAnchor="middle"
            fontSize="11"
            fill="var(--neutral-400)"
            fontFamily="var(--font-body)"
          >
            {t.label}
          </text>
        </g>
      ))}
    </g>
  )
}
