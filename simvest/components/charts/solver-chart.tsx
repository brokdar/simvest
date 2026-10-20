"use client"

import { useEffect, useRef, useState } from "react"
import { fmtAxisEUR, fmtEUR, fmtNum, fmtPct } from "@/lib/format"
import { niceTicks } from "@/lib/charts/scales"
import { useChartTouch } from "@/components/charts/use-chart-touch"
import type { PlanningTrajectories } from "@/lib/goal-evaluator"
import { svgNum } from "@/lib/charts/svg"

// Conservative tooltip half-width used to keep it inside the plot on a narrow
// chart. The real tooltip can be wider, but this prevents edge overflow.
const TOOLTIP_HALF_WIDTH = 96

export function SolverChart({
  projections,
  startValue,
  portfolioTarget,
  horizon,
  monthlySaving,
  requiredMonthly,
}: {
  projections: PlanningTrajectories
  startValue: number
  portfolioTarget: number
  horizon: number
  /** Today's contribution — drives the "what actually happens" line. */
  monthlySaving: number
  /** The solved contribution the dashed line assumes. */
  requiredMonthly: number
}) {
  type ProjectionPoint = PlanningTrajectories["exp"][number]
  // Index of the point currently shown in the tooltip (mouse, touch, or pinned
  // after a touch lift), or null. The hover payload is derived from it.
  const [activeIdx, setActiveIdx] = useState<number | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)
  const plotRef = useRef<HTMLDivElement | null>(null)
  // Measure the actual plot width so the viewBox uses real pixel coordinates
  // rather than a fixed 1000-unit box squished by preserveAspectRatio="none"
  // — that distorted the lines and warped the axis text at phone widths.
  // Mirrors the fix in entries-bar-chart.tsx.
  const [W, setW] = useState(720)
  useEffect(() => {
    if (!plotRef.current) return
    const ro = new ResizeObserver((ents) => {
      for (const e of ents) setW(Math.max(240, Math.floor(e.contentRect.width)))
    })
    ro.observe(plotRef.current)
    return () => ro.disconnect()
  }, [])

  const narrow = W < 560
  // A fixed 360px height on a ~260px-wide phone would read as a very tall,
  // cramped chart. Shrink the height (and the gutters it no longer needs to
  // clear) for narrow widths instead of stretching the same box.
  const H = narrow ? 260 : 360
  const pad = narrow
    ? { l: 60, r: 14, t: 20, b: 34 }
    : { l: 88, r: 24, t: 24, b: 44 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b

  const n = projections.exp.length
  const yMaxRaw = Math.max(
    projections.opt.at(-1)?.value ?? 0,
    projections.current.at(-1)?.value ?? 0,
    portfolioTarget * 1.1,
    startValue
  )
  const yScale = niceTicks(0, yMaxRaw, 5)
  const yMax = yScale.max
  const fmtYTick = fmtAxisEUR(yScale.ticks)

  const x = (m: number) => pad.l + (m / Math.max(1, n)) * iw
  const y = (v: number) => pad.t + ih - (v / (yMax || 1)) * ih

  const pathFor = (arr: ProjectionPoint[]) => {
    let d = `M ${pad.l} ${y(startValue)}`
    for (let i = 0; i < arr.length; i++) {
      d += ` L ${svgNum(x(i + 1))} ${svgNum(y(arr[i].value))}`
    }
    return d
  }

  const areaBetween = (upper: ProjectionPoint[], lower: ProjectionPoint[]) => {
    let d = `M ${pad.l} ${y(startValue)}`
    for (let i = 0; i < upper.length; i++) {
      d += ` L ${svgNum(x(i + 1))} ${svgNum(y(upper[i].value))}`
    }
    for (let i = lower.length - 1; i >= 0; i--) {
      d += ` L ${svgNum(x(i + 1))} ${svgNum(y(lower[i].value))}`
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

  // Nearest projection index for a client X (accounting for the SVG being
  // scaled to fit its container), or null when the pointer is outside the plot.
  // Plain functions/values (not useCallback/useMemo) so the React Compiler can
  // memoize them — a manual dep list here can't be preserved past the local
  // `pad`/scale helpers and gets the whole component's compilation skipped.
  const resolveIndex = (clientX: number, _clientY: number, rect: DOMRect) => {
    const scale = W / rect.width
    const mx = (clientX - rect.left) * scale
    if (mx < pad.l || mx > W - pad.r) return null
    return Math.max(0, Math.min(n - 1, Math.round(((mx - pad.l) / iw) * n) - 1))
  }

  const hover =
    activeIdx === null || activeIdx < 0 || activeIdx >= n
      ? null
      : {
          i: activeIdx,
          current: projections.current[activeIdx].value,
          cons: projections.cons[activeIdx].value,
          exp: projections.exp[activeIdx].value,
          opt: projections.opt[activeIdx].value,
          months: activeIdx + 1,
        }

  const onMouseMove = (ev: React.MouseEvent<SVGSVGElement>) => {
    setActiveIdx(
      resolveIndex(
        ev.clientX,
        ev.clientY,
        ev.currentTarget.getBoundingClientRect()
      )
    )
  }

  const { onTouchStart, onTouchMove, onTouchEnd } = useChartTouch({
    resolveIndex,
    activeIndex: activeIdx,
    setActiveIndex: setActiveIdx,
    containerRef: plotRef,
  })

  // Screen-reader announcement of the settled active point — parity with the
  // overview chart's live region. Debounced via a string dep (stable by value)
  // with the only setState inside the timer, so no synchronous effect cascade.
  const ariaSummary = hover
    ? `+${fmtNum(hover.months / 12, 1)} years: At your current contribution ${fmtEUR(
        hover.current,
        { compact: true }
      )}; if you add ${fmtEUR(requiredMonthly)}/mo: Optimistic ${fmtEUR(
        hover.opt,
        {
          compact: true,
        }
      )}, Expected ${fmtEUR(hover.exp, {
        compact: true,
      })}, Conservative ${fmtEUR(hover.cons, { compact: true })}`
    : ""
  const [announce, setAnnounce] = useState("")
  useEffect(() => {
    const t = setTimeout(() => setAnnounce(ariaSummary), 250)
    return () => clearTimeout(t)
  }, [ariaSummary])

  const targetY = y(portfolioTarget)
  // The marker tracks the *current-contribution* line: the solved line hits
  // the target by construction, so marking it "reached" proved nothing.
  const targetReachedExp = projections.current.findIndex(
    (p) => p.value >= portfolioTarget
  )

  // Label placement. The "Target reached" marker sits where the current
  // line crosses the target line, so the two labels share a Y and (when the target
  // is hit late in the horizon) an X — they used to overlap into an unreadable
  // smudge. Decouple them:
  //   • The "Target · €Xk" caption goes to the LEFT edge, freeing the right.
  //   • The "reached" caption anchors to avoid clipping the right edge, and
  //     drops below its dot if it would otherwise sit on the target caption.
  const reachedX = targetReachedExp >= 0 ? x(targetReachedExp + 1) : 0
  const reachedY =
    targetReachedExp >= 0 ? y(projections.current[targetReachedExp].value) : 0
  const reachedNearLeft = targetReachedExp >= 0 && reachedX < pad.l + 150
  const reachedNearRight = reachedX > W - pad.r - 96
  // A centred caption on an early crossing would spill left over the y-axis
  // tick labels; start it at the dot instead (~66px is half its width).
  const reachedNearAxis = !reachedNearRight && reachedX - 66 < pad.l + 4
  const reachedAnchor = reachedNearRight
    ? "end"
    : reachedNearAxis
      ? "start"
      : "middle"
  // Keep the target caption clear of the chart top, and clear of the reached
  // dot when that dot is over on the left where the caption lives.
  const targetLabelBelow = targetY < pad.t + 18 || reachedNearLeft
  const targetLabelY = targetLabelBelow ? targetY + 16 : targetY - 8

  return (
    <div ref={plotRef} style={{ position: "relative", width: "100%" }}>
      <svg
        ref={svgRef}
        role="img"
        aria-label={`Projection chart: growth at your current ${fmtEUR(monthlySaving)}/mo, and the conservative, expected and optimistic range if you add ${fmtEUR(requiredMonthly)}/mo`}
        viewBox={`0 0 ${W} ${H}`}
        width={W}
        height={H}
        // pan-y keeps vertical page scroll while a horizontal drag scrubs the
        // chart; no preventDefault needed. Mirrors the overview chart.
        style={{
          display: "block",
          maxWidth: "100%",
          cursor: "crosshair",
          touchAction: "pan-y",
        }}
        onMouseMove={onMouseMove}
        onMouseLeave={() => setActiveIdx(null)}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => setActiveIdx(null)}
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
          stroke="var(--primary-400)"
          strokeWidth="2"
          strokeDasharray="7 4"
          data-testid="solver-line-solved"
        />
        <path
          d={pathFor(projections.current)}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.75"
          data-testid="solver-line-current"
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
          fontSize="var(--fs-2xs)"
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
              fill="var(--surface)"
              stroke="var(--primary)"
              strokeWidth="2.5"
            />
            <text
              x={reachedX + (reachedNearRight ? 4 : reachedNearAxis ? -4 : 0)}
              y={reachedY - 12}
              textAnchor={reachedAnchor}
              fontSize="var(--fs-2xs)"
              fontWeight="600"
              fill="var(--primary)"
              fontFamily="var(--font-body)"
              paintOrder="stroke"
              stroke="var(--surface)"
              strokeWidth="3"
              strokeLinejoin="round"
              data-testid="solver-reached-label"
            >
              Reached at your pace
            </text>
          </g>
        )}

        <circle
          cx={pad.l}
          cy={y(startValue)}
          r="4"
          fill="var(--primary)"
          stroke="var(--surface)"
          strokeWidth="2"
        />

        {[
          { v: projections.opt.at(-1)?.value, c: "var(--tertiary)" },
          { v: projections.exp.at(-1)?.value, c: "var(--primary-400)" },
          { v: projections.cons.at(-1)?.value, c: "var(--secondary-400)" },
          { v: projections.current.at(-1)?.value, c: "var(--primary)" },
        ].map(
          (e, i) =>
            e.v !== undefined && (
              <circle
                key={i}
                cx={x(n)}
                cy={y(e.v)}
                r={i === 3 ? 5 : 3.5}
                fill="var(--surface)"
                stroke={e.c}
                strokeWidth={i === 3 ? 2.5 : 2}
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
              cy={y(hover.current)}
              r="4.5"
              fill="var(--surface)"
              stroke="var(--primary)"
              strokeWidth="2"
            />
            <circle
              cx={x(hover.i + 1)}
              cy={y(hover.exp)}
              r="3.5"
              fill="var(--surface)"
              stroke="var(--primary-400)"
              strokeWidth="2"
            />
            <circle
              cx={x(hover.i + 1)}
              cy={y(hover.cons)}
              r="3"
              fill="var(--surface)"
              stroke="var(--secondary-400)"
              strokeWidth="2"
            />
            <circle
              cx={x(hover.i + 1)}
              cy={y(hover.opt)}
              r="3"
              fill="var(--surface)"
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
            fontSize={narrow ? "var(--fs-3xs)" : "var(--fs-2xs)"}
            fill="var(--neutral-400)"
            fontFamily="var(--font-body)"
          >
            {fmtYTick(t)}
          </text>
        ))}

        {xTicks.map((t, i) => (
          <text
            key={`xt${i}`}
            x={x(t.m)}
            y={pad.t + ih + 22}
            textAnchor="middle"
            fontSize={narrow ? "var(--fs-3xs)" : "var(--fs-2xs)"}
            fill="var(--neutral-400)"
            fontFamily="var(--font-body)"
          >
            {t.label}
          </text>
        ))}
      </svg>

      {/* SR-only live announcement of the settled active point. The visual
          tooltip below is decorative (aria-hidden). */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </div>

      <div className="solver-legend" data-testid="solver-legend">
        <span
          className="solver-legend-item"
          data-testid="solver-legend-current"
        >
          <LegendSwatch color="var(--primary)" />
          At your current {fmtEUR(monthlySaving)}/mo
        </span>
        <span className="solver-legend-item" data-testid="solver-legend-solved">
          <LegendSwatch color="var(--primary-400)" dashed />
          Reachable if you add {fmtEUR(requiredMonthly)}/mo
        </span>
        <span className="solver-legend-item">
          <span
            aria-hidden="true"
            style={{
              width: 18,
              height: 10,
              borderRadius: 2,
              background: "color-mix(in srgb, var(--primary) 12%, transparent)",
            }}
          />
          Conservative–optimistic range
        </span>
      </div>

      {hover &&
        (() => {
          // Clamp the tooltip inside the plot so long rows don't overflow the
          // narrow chart; center it on the point unless that would clip an edge.
          const cx = x(hover.i + 1)
          const left = Math.max(
            TOOLTIP_HALF_WIDTH,
            Math.min(W - TOOLTIP_HALF_WIDTH, cx)
          )
          return (
            <div
              className="chart-tooltip"
              aria-hidden="true"
              style={{
                left,
                top: 24,
                transform: "translate(-50%, 0)",
              }}
            >
              <div className="tt-h">+{fmtNum(hover.months / 12, 1)} years</div>
              <div className="tt-row">
                <span className="l">
                  <span
                    className="d"
                    style={{ background: "var(--primary-300)" }}
                  />
                  At your pace
                </span>
                <span>{fmtEUR(hover.current, { compact: true })}</span>
              </div>
              <div className="tt-row" style={{ opacity: 0.8 }}>
                <span className="l">
                  If you add {fmtEUR(requiredMonthly, { compact: true })}/mo
                </span>
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
                    style={{ background: "var(--primary-400)" }}
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
                  borderTop: "1px solid var(--tooltip-divider)",
                  fontSize: "var(--fs-2xs)",
                  color: "var(--tooltip-fg-muted)",
                }}
              >
                Target: {fmtEUR(portfolioTarget, { compact: true })} · at your
                pace{" "}
                {hover.current >= portfolioTarget
                  ? "✓ reached"
                  : `${fmtPct((hover.current / (portfolioTarget || 1)) * 100, 0)} of target`}
              </div>
            </div>
          )
        })()}
    </div>
  )
}

function LegendSwatch({ color, dashed }: { color: string; dashed?: boolean }) {
  return (
    <svg width="20" height="8" aria-hidden="true">
      <line
        x1="1"
        x2="19"
        y1="4"
        y2="4"
        stroke={color}
        strokeWidth={dashed ? 2 : 2.75}
        strokeDasharray={dashed ? "5 3" : undefined}
      />
    </svg>
  )
}
