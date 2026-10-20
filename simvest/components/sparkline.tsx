"use client"

import { svgNum } from "@/lib/charts/svg"

type Props = {
  data: number[]
  color?: string
  width?: number
  height?: number
  filled?: boolean
  /**
   * Fixed value range. Pass one shared domain to every sparkline in a column
   * so equal heights mean equal amounts (N12); omitted, the line auto-scales
   * to its own min/max.
   */
  domain?: { min: number; max: number }
}

export function Sparkline({
  data,
  color = "var(--primary)",
  width = 120,
  height = 36,
  filled = true,
  domain,
}: Props) {
  if (!data.length) return null
  const min = domain?.min ?? Math.min(...data)
  const max = domain?.max ?? Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => [
    (i / Math.max(1, data.length - 1)) * width,
    height - ((v - min) / range) * (height - 4) - 2,
  ])
  const path = pts
    .map((p, i) => (i === 0 ? "M" : "L") + svgNum(p[0]) + " " + svgNum(p[1]))
    .join(" ")
  const area = path + ` L ${width} ${height} L 0 ${height} Z`
  return (
    <svg
      className="spark"
      aria-hidden="true"
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
    >
      {filled && (
        <path d={area} fill={color} fillOpacity="0.08" stroke="none" />
      )}
      <path d={path} stroke={color} />
    </svg>
  )
}
