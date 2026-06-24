"use client"

type Props = {
  pct: number
  size?: number
  stroke?: number
  color?: string
  bg?: string
}

export function ProgressRing({
  pct,
  size = 48,
  stroke = 5,
  color = "var(--primary)",
  bg = "var(--neutral-200)",
}: Props) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const off = c * (1 - Math.min(1, Math.max(0, pct)))
  const pctLabel = `${Math.round(Math.min(1, Math.max(0, pct)) * 100)}%`
  return (
    <div style={{ transform: "rotate(-90deg)", width: size, height: size }}>
      <svg role="img" aria-label={pctLabel} width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={bg}
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={off}
          strokeLinecap="round"
        />
      </svg>
    </div>
  )
}
