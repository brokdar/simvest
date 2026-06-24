"use client"

import { useRef, useState } from "react"
import { fmtEUR } from "@/lib/format"
import { niceTicks } from "@/lib/charts/scales"
import { entryTimestamp } from "@/lib/dates"
import type { EntryDTO } from "@/lib/types"

type Hover = {
  i: number
  ent: EntryDTO
  delta: number
  hasPrev: boolean
  dividends: number
}

export function EntriesBarChart({
  entries,
  color = "var(--primary)",
  dividendsByMonth,
}: {
  entries: EntryDTO[]
  color?: string
  /** Lookup of dividend totals keyed by `${year}-${month}`. */
  dividendsByMonth?: Map<string, number>
}) {
  const [windowMonths, setWindowMonths] = useState(36)
  const [hover, setHover] = useState<Hover | null>(null)
  const svgRef = useRef<SVGSVGElement | null>(null)

  if (!entries.length) {
    return (
      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="muted small">No entries yet.</div>
      </div>
    )
  }

  const W = 1000
  const H = 280
  const pad = { l: 88, r: 88, t: 24, b: 44 }
  const visible = entries.slice(-Math.min(windowMonths, entries.length))
  const n = visible.length
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b

  const knownValues = visible
    .map((e) => e.value)
    .filter((v): v is number => v !== null)
  const rawValueMax = knownValues.length ? Math.max(...knownValues) : 0
  const rawInvestMax = Math.max(...visible.map((e) => e.invested))
  const rawInvestMin = Math.min(0, ...visible.map((e) => e.invested))
  const valueScale = niceTicks(0, rawValueMax, 5)
  const investScale = niceTicks(rawInvestMin, rawInvestMax, 5)
  const valueMax = valueScale.max
  const investMin = investScale.min
  const investMax = investScale.max
  const investDomain = investMax - investMin || 1

  const ts = visible.map((e) => entryTimestamp(e.year, e.month, e.day))
  const tMin = ts[0]
  const tMax = ts[n - 1]
  const avgStep = n > 1 ? (tMax - tMin) / (n - 1) : 0
  const tStart = tMin - avgStep * 0.5
  const tEnd = tMax + avgStep * 0.5
  const tWindow = Math.max(1, tEnd - tStart)
  const xT = (t: number) =>
    n === 1 ? pad.l + iw / 2 : pad.l + ((t - tStart) / tWindow) * iw
  const x = (i: number) => xT(ts[i])

  let minGap = avgStep || 1
  for (let i = 1; i < n; i++) {
    const g = ts[i] - ts[i - 1]
    if (g > 0 && g < minGap) minGap = g
  }
  const barW =
    n === 1 ? 18 : Math.max(4, Math.min(18, (minGap / tWindow) * iw * 0.62))

  const yValue = (v: number) => pad.t + ih - ((v - 0) / (valueMax || 1)) * ih
  const yInv = (v: number) => pad.t + ih - ((v - investMin) / investDomain) * ih
  const zeroY = yInv(0)

  // Build the value line. Break the path (insert a new `M`) wherever value
  // is null so the line doesn't draw through unrecorded months.
  let needsMove = true
  const vPathParts: string[] = []
  for (let i = 0; i < n; i++) {
    const v = visible[i].value
    if (v === null) {
      needsMove = true
      continue
    }
    vPathParts.push(
      (needsMove ? "M" : "L") + x(i).toFixed(1) + " " + yValue(v).toFixed(1)
    )
    needsMove = false
  }
  const vPath = vPathParts.join(" ")
  const firstKnown = visible.findIndex((e) => e.value !== null)
  const lastKnown = (() => {
    for (let i = n - 1; i >= 0; i--) if (visible[i].value !== null) return i
    return -1
  })()

  const xLabelEvery = Math.max(
    1,
    Math.ceil(n / Math.max(3, Math.floor(iw / 80)))
  )
  const windowOptions =
    entries.length <= 12
      ? [entries.length]
      : [12, 24, 36, 60]
          .filter((w) => w < entries.length)
          .concat(entries.length)

  // Hit-test: pick the entry whose timestamp is nearest the mouse position.
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
    let best = 0
    let bestDist = Infinity
    for (let i = 0; i < n; i++) {
      const d = Math.abs(x(i) - mx)
      if (d < bestDist) {
        bestDist = d
        best = i
      }
    }
    const ent = visible[best]
    const prev = best > 0 ? visible[best - 1] : null
    const delta =
      prev && ent.value !== null && prev.value !== null
        ? ent.value - prev.value - ent.invested
        : 0
    const dividends = dividendsByMonth?.get(`${ent.year}-${ent.month}`) ?? 0
    setHover({ i: best, ent, delta, hasPrev: !!prev, dividends })
  }

  const tooltipX = hover ? x(hover.i) : 0

  // Hover band: extend halfway to neighbours in pixel space.
  const hoverBandBounds = (i: number): { left: number; width: number } => {
    if (n === 1) return { left: pad.l, width: iw }
    const cx = x(i)
    const leftMid = i > 0 ? (x(i - 1) + cx) / 2 : pad.l
    const rightMid = i < n - 1 ? (cx + x(i + 1)) / 2 : W - pad.r
    return { left: leftMid, width: Math.max(2, rightMid - leftMid) }
  }

  return (
    <div
      className="card card-pad"
      style={{ marginBottom: 16 }}
      data-testid="entries-bar-chart"
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: 10,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3 style={{ fontSize: 15 }}>
            Monthly contributions vs portfolio value
          </h3>
          <div className="muted small" style={{ marginTop: 2 }}>
            Bars: monthly invested (withdrawals below zero). Line: portfolio
            value at month-end.
          </div>
        </div>
        <div
          style={{
            display: "flex",
            gap: 14,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div className="legend">
            <div className="it">
              <span
                className="sw"
                style={{ background: color, opacity: 0.75 }}
              />
              Invested (left)
            </div>
            <div className="it">
              <span
                className="sw line"
                style={{ background: "var(--neutral-800)" }}
              />
              Portfolio value (right)
            </div>
          </div>
          <div className="seg" data-testid="entries-window-selector">
            {windowOptions.map((w, i) => {
              const label =
                w === entries.length ? "All" : w >= 12 ? `${w / 12}y` : `${w}m`
              return (
                <button
                  type="button"
                  key={i}
                  aria-pressed={windowMonths === w}
                  aria-label={label}
                  className={windowMonths === w ? "on" : ""}
                  onClick={() => setWindowMonths(w)}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      </div>

      <div style={{ width: "100%", position: "relative" }}>
        <svg
          ref={svgRef}
          role="img"
          aria-label="Monthly investment and portfolio value bar chart"
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={H}
          preserveAspectRatio="none"
          style={{ display: "block", cursor: "crosshair" }}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          onTouchMove={(e) => {
            const t = e.touches[0]
            const rect = svgRef.current!.getBoundingClientRect()
            onMove({
              clientX: t.clientX,
              clientY: t.clientY,
              currentTarget: { getBoundingClientRect: () => rect },
            } as unknown as React.MouseEvent<SVGSVGElement>)
          }}
          onTouchEnd={() => setHover(null)}
          data-testid="entries-bar-chart-svg"
        >
          {investScale.ticks.map((t, i) => (
            <line
              key={`g${i}`}
              x1={pad.l}
              x2={W - pad.r}
              y1={yInv(t)}
              y2={yInv(t)}
              stroke="var(--border)"
              strokeDasharray={t === 0 ? undefined : "2 3"}
              strokeWidth="1"
            />
          ))}

          {hover &&
            (() => {
              const band = hoverBandBounds(hover.i)
              return (
                <rect
                  x={band.left}
                  y={pad.t}
                  width={band.width}
                  height={ih}
                  fill="var(--primary-50)"
                  opacity="0.6"
                />
              )
            })()}

          {visible.map((e, i) => {
            const top = yInv(Math.max(e.invested, 0))
            const bot = yInv(Math.min(e.invested, 0))
            const height = Math.max(1, Math.abs(top - bot))
            const yTop = e.invested >= 0 ? top : zeroY
            const isNeg = e.invested < 0
            const isHovered = hover?.i === i
            return (
              <rect
                key={`b${i}`}
                x={x(i) - barW / 2}
                y={yTop}
                width={barW}
                height={height}
                fill={isNeg ? "var(--danger)" : color}
                fillOpacity={isHovered ? 1 : isNeg ? 0.8 : 0.75}
                rx="2"
              />
            )
          })}

          <path
            d={vPath}
            fill="none"
            stroke="var(--neutral-800)"
            strokeWidth="2.25"
          />

          {firstKnown >= 0 && (
            <circle
              cx={x(firstKnown)}
              cy={yValue(visible[firstKnown].value!)}
              r="3"
              fill="var(--neutral-800)"
            />
          )}
          {lastKnown >= 0 && (
            <circle
              cx={x(lastKnown)}
              cy={yValue(visible[lastKnown].value!)}
              r="4"
              fill="var(--neutral-800)"
              stroke="#fff"
              strokeWidth="2"
            />
          )}

          {hover && hover.ent.value !== null && (
            <circle
              cx={x(hover.i)}
              cy={yValue(hover.ent.value)}
              r="5"
              fill="#fff"
              stroke="var(--neutral-800)"
              strokeWidth="2"
            />
          )}

          {investScale.ticks.map((t, i) => (
            <text
              key={`lt${i}`}
              x={pad.l - 12}
              y={yInv(t) + 4}
              textAnchor="end"
              fontSize="11"
              fill="var(--neutral-400)"
              fontFamily="var(--font-body)"
            >
              {t === 0 ? "€0" : fmtEUR(t, { compact: true, sign: true })}
            </text>
          ))}
          {valueScale.ticks.map((t, i) => (
            <text
              key={`rt${i}`}
              x={W - pad.r + 12}
              y={yValue(t) + 4}
              textAnchor="start"
              fontSize="11"
              fill="var(--neutral-400)"
              fontFamily="var(--font-body)"
            >
              {fmtEUR(t, { compact: true })}
            </text>
          ))}

          {visible.map((e, i) =>
            i % xLabelEvery === 0 || i === n - 1 ? (
              <text
                key={`xl${i}`}
                x={x(i)}
                y={pad.t + ih + 22}
                textAnchor="middle"
                fontSize="11"
                fill="var(--neutral-400)"
                fontFamily="var(--font-body)"
              >
                {e.label}
              </text>
            ) : null
          )}

          <text
            x={pad.l - 12}
            y={pad.t - 10}
            textAnchor="end"
            fontSize="10"
            fill="var(--neutral-400)"
            fontFamily="var(--font-body)"
            letterSpacing="0.08em"
            fontWeight="600"
          >
            INVESTED
          </text>
          <text
            x={W - pad.r + 12}
            y={pad.t - 10}
            textAnchor="start"
            fontSize="10"
            fill="var(--neutral-400)"
            fontFamily="var(--font-body)"
            letterSpacing="0.08em"
            fontWeight="600"
          >
            VALUE
          </text>
        </svg>

        {hover &&
          (() => {
            const leftPct = (tooltipX / W) * 100
            const anchorRight = leftPct > 70
            return (
              <div
                className="chart-tooltip"
                style={{
                  left: `${leftPct}%`,
                  top: 24,
                  transform: anchorRight
                    ? "translate(-100%, 0)"
                    : "translate(0, 0)",
                  marginLeft: anchorRight ? -8 : 8,
                }}
              >
                <div className="tt-h">{hover.ent.label}</div>
                <div className="tt-row">
                  <span className="l">
                    <span
                      className="d"
                      style={{ background: "var(--neutral-800)" }}
                    />
                    Portfolio value
                  </span>
                  <span>{fmtEUR(hover.ent.value)}</span>
                </div>
                <div className="tt-row">
                  <span className="l">
                    <span
                      className="d"
                      style={{
                        background:
                          hover.ent.invested < 0 ? "var(--danger)" : color,
                      }}
                    />
                    {hover.ent.invested < 0 ? "Withdrawn" : "Invested"}
                  </span>
                  <span>{fmtEUR(hover.ent.invested, { sign: true })}</span>
                </div>
                {hover.hasPrev && (
                  <div className="tt-row">
                    <span className="l">
                      <span
                        className="d"
                        style={{
                          background: "transparent",
                          border: "1px solid rgba(255,255,255,0.4)",
                        }}
                      />
                      M/M change
                    </span>
                    <span
                      style={{
                        color: hover.delta >= 0 ? "#86EFAC" : "#FCA5A5",
                      }}
                    >
                      {fmtEUR(hover.delta, { sign: true })}
                    </span>
                  </div>
                )}
                {hover.dividends > 0 && (
                  <div className="tt-row">
                    <span className="l">
                      <span
                        className="d"
                        style={{ background: "var(--tertiary)" }}
                      />
                      Dividends
                    </span>
                    <span>{fmtEUR(hover.dividends)}</span>
                  </div>
                )}
                {hover.ent.note && (
                  <div
                    style={{
                      marginTop: 6,
                      paddingTop: 6,
                      borderTop: "1px solid rgba(255,255,255,0.15)",
                      color: "rgba(255,255,255,0.7)",
                      fontSize: 11,
                      maxWidth: 240,
                      whiteSpace: "normal",
                    }}
                  >
                    {hover.ent.note}
                  </div>
                )}
              </div>
            )
          })()}
      </div>
    </div>
  )
}
