"use client"

type Props = {
  data: number[]
  color?: string
  width?: number
  height?: number
  filled?: boolean
}

export function Sparkline({
  data,
  color = "var(--primary)",
  width = 120,
  height = 36,
  filled = true,
}: Props) {
  if (!data.length) return null
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1
  const pts = data.map((v, i) => [
    (i / Math.max(1, data.length - 1)) * width,
    height - ((v - min) / range) * (height - 4) - 2,
  ])
  const path = pts
    .map(
      (p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)
    )
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
