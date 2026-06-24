"use client"

import { useRef, useState } from "react"
import { fmtEUR, fmtPct } from "@/lib/format"
import { niceTicks } from "@/lib/charts/scales"
import type { ProjectionPoint } from "@/lib/calc"

export function SolverChart({
  projections,
  startValue,
  portfolioTarget,
  horizon,
}: {
  projections: {
    cons: ProjectionPoint[]
    exp: ProjectionPoint[]
    opt: ProjectionPoint[]
  }
  startValue: number
  portfolioTarget: number
  horizon: number
}) {
  const [hover, setHover] = useState<{
    i: number
    cons: number
    exp: number
    opt: number
    months: number
  } | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const W = 1000
  const H = 360
  const pad = { l: 88, r: 24, t: 24, b: 44 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b

  const n = projections.exp.length
  const yMaxRaw = Math.max(
    projections.opt.at(-1)?.value ?? 0,
    portfolioTarget * 1.1,
    startValue
  )
  const yScale = niceTicks(0, yMaxRaw, 5)
  const yMax = yScale.max

  const x = (m: number) => pad.l + (m / Math.max(1, n)) * iw
  const y = (v: number) => pad.t + ih - (v / (yMax || 1)) * ih

  const pathFor = (arr: ProjectionPoint[]) => {
    let d = `M ${pad.l} ${y(startValue)}`
    for (let i = 0; i < arr.length; i++) {
      d += ` L ${x(i + 1).toFixed(1)} ${y(arr[i].value).toFixed(1)}`
    }
    return d
  }

  const areaBetween = (upper: ProjectionPoint[], lower: ProjectionPoint[]) => {
    let d = `M ${pad.l} ${y(startValue)}`
    for (let i = 0; i < upper.length; i++) {
      d += ` L ${x(i + 1).toFixed(1)} ${y(upper[i].value).toFixed(1)}`
    }
    for (let i = lower.length - 1; i >= 0; i--) {
      d += ` L ${x(i + 1).toFixed(1)} ${y(lower[i].value).toFixed(1)}`
    }
    d += ` L ${pad.l} ${y(startValue)} Z`
    return d
  }

  const maxLabels = Math.max(3, Math.floor(iw / 70))
  const yearStrideRaw = Math.ceil(horizon / maxLabels)
  const niceSteps = [1, 2, 3, 5, 10]
  const yearStride = niceSteps.find((s) => s >= yearStrideRaw) ?? yearStrideRaw
  const xTicks: { m: number; label: string }[] = []
  for (let yr = 0; yr <= horizon; yr += yearStride) {
    xTicks.push({ m: yr * 12, label: yr === 0 ? "Now" : `+${yr}y` })
  }
  if (xTicks.at(-1)?.m !== horizon * 12) {
    xTicks.push({ m: horizon * 12, label: `+${horizon}y` })
  }

  const onMove = (ev: React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const scale = W / rect.width
    const mx = (ev.clientX - rect.left) * scale
    if (mx < pad.l || mx > W - pad.r) {
      setHover(null)
      return
    }
    const i = Math.max(
      0,
      Math.min(n - 1, Math.round(((mx - pad.l) / iw) * n) - 1)
    )
    setHover({
      i,
      cons: projections.cons[i].value,
      exp: projections.exp[i].value,
      opt: projections.opt[i].value,
      months: i + 1,
    })
  }

  const targetY = y(portfolioTarget)
  const targetReachedExp = projections.exp.findIndex(
    (p) => p.value >= portfolioTarget
  )

  // Label placement. The "Target reached" marker sits where the expected line
  // crosses the target line, so the two labels share a Y and (when the target
  // is hit late in the horizon) an X — they used to overlap into an unreadable
  // smudge. Decouple them:
  //   • The "Target · €Xk" caption goes to the LEFT edge, freeing the right.
  //   • The "reached" caption anchors to avoid clipping the right edge, and
  //     drops below its dot if it would otherwise sit on the target caption.
  const reachedX = targetReachedExp >= 0 ? x(targetReachedExp + 1) : 0
  const reachedY =
    targetReachedExp >= 0 ? y(projections.exp[targetReachedExp].value) : 0
  const reachedNearLeft = targetReachedExp >= 0 && reachedX < pad.l + 150
  const reachedNearRight = reachedX > W - pad.r - 96
  const reachedAnchor = reachedNearRight ? "end" : "middle"
  // Keep the target caption clear of the chart top, and clear of the reached
  // dot when that dot is over on the left where the caption lives.
  const targetLabelBelow = targetY < pad.t + 18 || reachedNearLeft
  const targetLabelY = targetLabelBelow ? targetY + 16 : targetY - 8

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <svg
        ref={svgRef}
        role="img"
        aria-label="Projection chart showing conservative, expected, and optimistic portfolio growth"
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        style={{ display: "block", cursor: "crosshair" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onTouchMove={(e) => {
          const t = e.touches[0]
          onMove({
            clientX: t.clientX,
            clientY: t.clientY,
          } as unknown as React.MouseEvent<SVGSVGElement>)
        }}
        onTouchEnd={() => setHover(null)}
        data-testid="solver-chart-svg"
      >
        {yScale.ticks.map((t, i) => (
          <line
            key={`g${i}`}
            x1={pad.l}
            x2={W - pad.r}
            y1={y(t)}
            y2={y(t)}
            stroke="var(--border)"
            strokeDasharray={t === 0 ? undefined : "2 3"}
          />
        ))}

        <path
          d={areaBetween(projections.opt, projections.cons)}
          fill="var(--primary)"
          fillOpacity="0.08"
        />

        <path
          d={pathFor(projections.cons)}
          fill="none"
          stroke="var(--secondary-400)"
          strokeWidth="2"
          strokeDasharray="2 3"
        />
        <path
          d={pathFor(projections.opt)}
          fill="none"
          stroke="var(--tertiary)"
          strokeWidth="2"
          strokeDasharray="2 3"
        />
        <path
          d={pathFor(projections.exp)}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.75"
        />

        <line
          x1={pad.l}
          x2={W - pad.r}
          y1={targetY}
          y2={targetY}
          stroke="var(--neutral-800)"
          strokeWidth="1.5"
          strokeDasharray="6 4"
        />
        <text
          x={pad.l + 8}
          y={targetLabelY}
          textAnchor="start"
          fontSize="11"
          fontWeight="600"
          fill="var(--neutral-800)"
          fontFamily="var(--font-body)"
          paintOrder="stroke"
          stroke="var(--surface)"
          strokeWidth="3"
          strokeLinejoin="round"
        >
          Target · {fmtEUR(portfolioTarget, { compact: true })}
        </text>

        {targetReachedExp >= 0 && (
          <g>
            <circle
              cx={reachedX}
              cy={reachedY}
              r="5"
              fill="#fff"
              stroke="var(--primary)"
              strokeWidth="2.5"
            />
            <text
              x={reachedX + (reachedNearRight ? 4 : 0)}
              y={reachedY - 12}
              textAnchor={reachedAnchor}
              fontSize="10.5"
              fontWeight="600"
              fill="var(--primary)"
              fontFamily="var(--font-body)"
              paintOrder="stroke"
              stroke="var(--surface)"
              strokeWidth="3"
              strokeLinejoin="round"
            >
              Target reached
            </text>
          </g>
        )}

        <circle
          cx={pad.l}
          cy={y(startValue)}
          r="4"
          fill="var(--primary)"
          stroke="#fff"
          strokeWidth="2"
        />

        {[
          { v: projections.opt.at(-1)?.value, c: "var(--tertiary)" },
          { v: projections.exp.at(-1)?.value, c: "var(--primary)" },
          { v: projections.cons.at(-1)?.value, c: "var(--secondary-400)" },
        ].map(
          (e, i) =>
            e.v !== undefined && (
              <circle
                key={i}
                cx={x(n)}
                cy={y(e.v)}
                r={i === 1 ? 5 : 3.5}
                fill="#fff"
                stroke={e.c}
                strokeWidth={i === 1 ? 2.5 : 2}
              />
            )
        )}

        {hover && (
          <>
            <line
              x1={x(hover.i + 1)}
              x2={x(hover.i + 1)}
              y1={pad.t}
              y2={pad.t + ih}
              stroke="var(--neutral-400)"
              strokeDasharray="2 3"
            />
            <circle
              cx={x(hover.i + 1)}
              cy={y(hover.exp)}
              r="4.5"
              fill="#fff"
              stroke="var(--primary)"
              strokeWidth="2"
            />
            <circle
              cx={x(hover.i + 1)}
              cy={y(hover.cons)}
              r="3"
              fill="#fff"
              stroke="var(--secondary-400)"
              strokeWidth="2"
            />
            <circle
              cx={x(hover.i + 1)}
              cy={y(hover.opt)}
              r="3"
              fill="#fff"
              stroke="var(--tertiary)"
              strokeWidth="2"
            />
          </>
        )}

        {yScale.ticks.map((t, i) => (
          <text
            key={`yt${i}`}
            x={pad.l - 12}
            y={y(t) + 4}
            textAnchor="end"
            fontSize="11"
            fill="var(--neutral-400)"
            fontFamily="var(--font-body)"
          >
            {fmtEUR(t, { compact: true })}
          </text>
        ))}

        {xTicks.map((t, i) => (
          <text
            key={`xt${i}`}
            x={x(t.m)}
            y={pad.t + ih + 22}
            textAnchor="middle"
            fontSize="11"
            fill="var(--neutral-400)"
            fontFamily="var(--font-body)"
          >
            {t.label}
          </text>
        ))}
      </svg>

      {hover &&
        (() => {
          const leftPct = (x(hover.i + 1) / W) * 100
          const right = leftPct > 65
          return (
            <div
              className="chart-tooltip"
              style={{
                left: `${leftPct}%`,
                top: 24,
                transform: right ? "translate(-100%, 0)" : "none",
                marginLeft: right ? -8 : 8,
              }}
            >
              <div className="tt-h">
                +{(hover.months / 12).toFixed(1)} years
              </div>
              <div className="tt-row">
                <span className="l">
                  <span
                    className="d"
                    style={{ background: "var(--tertiary)" }}
                  />
                  Optimistic
                </span>
                <span>{fmtEUR(hover.opt, { compact: true })}</span>
              </div>
              <div className="tt-row">
                <span className="l">
                  <span
                    className="d"
                    style={{ background: "var(--primary)" }}
                  />
                  Expected
                </span>
                <span>{fmtEUR(hover.exp, { compact: true })}</span>
              </div>
              <div className="tt-row">
                <span className="l">
                  <span
                    className="d"
                    style={{ background: "var(--secondary-400)" }}
                  />
                  Conservative
                </span>
                <span>{fmtEUR(hover.cons, { compact: true })}</span>
              </div>
              <div
                style={{
                  marginTop: 6,
                  paddingTop: 6,
                  borderTop: "1px solid rgba(255,255,255,0.15)",
                  fontSize: 11,
                  color: "rgba(255,255,255,0.7)",
                }}
              >
                Target: {fmtEUR(portfolioTarget, { compact: true })} ·{" "}
                {hover.exp >= portfolioTarget
                  ? "✓ reached"
                  : `${fmtPct((hover.exp / (portfolioTarget || 1)) * 100, 0)} of target`}
              </div>
            </div>
          )
        })()}
    </div>
  )
}
