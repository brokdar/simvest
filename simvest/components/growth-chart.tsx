"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { fmtEUR } from "@/lib/format"
import { addCalendarMonths, entryTimestamp } from "@/lib/dates"
import { axisLayout, niceMax } from "@/lib/charts/scales"
import { XAxis, YAxis } from "@/components/charts/axis"
import type { EntryDTO } from "@/lib/types"
import type { MonthCoverage, ProjectionPoint } from "@/lib/calc"

export type GrowthChartOptions = {
  showDividends: boolean
  inflationAdjusted: boolean
}

/** Pre-evaluated target line — caller resolves goal kind/scope and supplies the EUR value. */
export type GoalLine = {
  id: number
  name: string
  color: string
  /** Portfolio value (EUR) that satisfies the goal — already in chart units. */
  value: number
}

type Props = {
  entries: EntryDTO[]
  projection: {
    base: ProjectionPoint[]
    conservative: ProjectionPoint[]
    optimistic: ProjectionPoint[]
  }
  monthlySaving: number
  inflation: number
  options: GrowthChartOptions
  goalLines?: GoalLine[]
  height?: number
  /** Dividend totals keyed by `${year}-${month}` for the active portfolio. */
  dividendsByMonth?: Map<string, number>
  /**
   * Per-month data coverage for the combined view, aligned 1:1 with `entries`.
   * Months flagged `estimated` (a portfolio's value carried forward) render the
   * value line dashed so a stale contributor reads as "missing data", not loss.
   * Omit for single-portfolio charts.
   */
  coverage?: MonthCoverage[]
}

type HoverPayload = {
  x: number
  // null when the hovered month has no recorded value — the crosshair still
  // shows but the value-line dot is suppressed so we don't imply a y position
  // that doesn't exist.
  y: number | null
  label: string
  rows: { k: string; v: string; c: string }[]
}

export function GrowthChart({
  entries,
  projection,
  monthlySaving,
  inflation,
  options,
  goalLines = [],
  height = 420,
  dividendsByMonth,
  coverage,
}: Props) {
  const lookupDividends = (e: EntryDTO) =>
    dividendsByMonth?.get(`${e.year}-${e.month}`) ?? 0
  const containerRef = useRef<HTMLDivElement | null>(null)
  // Initialize narrow enough that the first paint never causes horizontal page
  // scroll on mobile (393px viewport - 64px sidebar = ~329px). ResizeObserver
  // expands this to the actual container width after first paint.
  const [W, setW] = useState(320)
  const [hover, setHover] = useState<HoverPayload | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((ents) => {
      for (const e of ents) setW(Math.floor(e.contentRect.width))
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const H = height
  const pad = { l: 60, r: 20, t: 16, b: 36 }
  const iw = W - pad.l - pad.r
  const ih = H - pad.t - pad.b

  const histCount = entries.length
  const projCount = projection.base.length
  const totalMonths = histCount + projCount
  const lastHist = entries[histCount - 1]

  const histCumInvested = useMemo(
    () =>
      entries.reduce<number[]>(
        (acc, e) => [...acc, (acc.at(-1) ?? 0) + e.invested],
        []
      ),
    [entries]
  )

  const lastInvested = histCumInvested[histCumInvested.length - 1] || 0
  const projInvested = useMemo(() => {
    const out: number[] = []
    let cum = lastInvested
    for (let i = 0; i < projection.base.length; i++) {
      cum += monthlySaving
      out.push(cum)
    }
    return out
  }, [projection.base, monthlySaving, lastInvested])

  // Months with no recorded value can't contribute a real point — null
  // breaks the chart path so the line interrupts cleanly.
  const valueHist: (number | null)[] = entries.map((e) => e.value)
  const adjust = (v: number, monthIndex: number) => {
    if (!options.inflationAdjusted) return v
    if (monthIndex < histCount) return v
    const yearsFromNow = (monthIndex - histCount + 1) / 12
    return v / Math.pow(1 + inflation / 100, yearsFromNow)
  }

  const valueBase = projection.base.map((p, i) =>
    adjust(p.value, histCount + i)
  )
  const valueCons = projection.conservative.map((p, i) =>
    adjust(p.value, histCount + i)
  )
  const valueOpt = projection.optimistic.map((p, i) =>
    adjust(p.value, histCount + i)
  )

  const allValues: number[] = [
    ...valueHist.filter((v): v is number => v !== null),
    ...histCumInvested,
    ...valueBase,
    ...valueCons,
    ...valueOpt,
    ...projInvested,
    0,
  ]
  let yMax = Math.max(...allValues)
  const yMin = 0
  yMax = niceMax(yMax * 1.05)

  // Build a unified real-time axis. Historical points use each entry's real date;
  // projection points step forward in calendar months from the last entry's date,
  // preserving its day (clamped to month length).
  const timestamps = useMemo(() => {
    const ts: number[] = entries.map((e) =>
      entryTimestamp(e.year, e.month, e.day)
    )
    if (lastHist) {
      for (let i = 0; i < projCount; i++) {
        const d = addCalendarMonths(
          lastHist.year,
          lastHist.month,
          lastHist.day,
          i + 1
        )
        ts.push(entryTimestamp(d.year, d.month, d.day))
      }
    }
    return ts
  }, [entries, projCount, lastHist])

  const tMin = timestamps[0] ?? 0
  const tMax = timestamps[timestamps.length - 1] ?? tMin + 1
  const tSpan = Math.max(1, tMax - tMin)
  const x = (i: number) =>
    totalMonths <= 1
      ? pad.l + iw / 2
      : pad.l + ((timestamps[i] - tMin) / tSpan) * iw
  const y = (v: number) => pad.t + ih - ((v - yMin) / (yMax - yMin || 1)) * ih

  const linePath = (arr: (number | null)[], start = 0) => {
    // Null values break the line so unrecorded months don't drag the curve.
    let needsMove = true
    const parts: string[] = []
    for (let i = 0; i < arr.length; i++) {
      const v = arr[i]
      if (v === null) {
        needsMove = true
        continue
      }
      parts.push(
        (needsMove ? "M" : "L") +
          x(start + i).toFixed(1) +
          " " +
          y(v).toFixed(1)
      )
      needsMove = false
    }
    return parts.join(" ")
  }
  // Draw only the segments (i-1 → i) the predicate selects, as standalone
  // move-line pairs. Used to split the historical value line into solid
  // (fully reported) and dashed (carried-forward) stretches.
  const isEstimated = (i: number) => coverage?.[i]?.estimated ?? false
  const hasEstimated = coverage?.some((c) => c.estimated) ?? false
  const segmentPath = (
    arr: (number | null)[],
    pick: (i: number) => boolean
  ) => {
    const parts: string[] = []
    for (let i = 1; i < arr.length; i++) {
      const a = arr[i - 1]
      const b = arr[i]
      if (a === null || b === null || !pick(i)) continue
      parts.push(
        `M${x(i - 1).toFixed(1)} ${y(a).toFixed(1)} L${x(i).toFixed(1)} ${y(b).toFixed(1)}`
      )
    }
    return parts.join(" ")
  }
  const areaBetween = (topArr: number[], botArr: number[], start = 0) => {
    const top = topArr
      .map(
        (v, i) =>
          (i === 0 ? "M" : "L") +
          x(start + i).toFixed(1) +
          " " +
          y(v).toFixed(1)
      )
      .join(" ")
    const bot = botArr
      .map(
        (_, i) =>
          "L" +
          x(start + botArr.length - 1 - i).toFixed(1) +
          " " +
          y(botArr[botArr.length - 1 - i]).toFixed(1)
      )
      .join(" ")
    return top + " " + bot + " Z"
  }
  const areaToZero = (arr: number[], start = 0) => {
    const top = arr
      .map(
        (v, i) =>
          (i === 0 ? "M" : "L") +
          x(start + i).toFixed(1) +
          " " +
          y(v).toFixed(1)
      )
      .join(" ")
    return (
      top +
      ` L ${x(start + arr.length - 1).toFixed(1)} ${y(0).toFixed(1)} L ${x(start).toFixed(1)} ${y(0).toFixed(1)} Z`
    )
  }

  const yTicks = axisLayout({
    min: yMin,
    max: yMax,
    count: 5,
    range: [pad.t + ih, pad.t],
  })

  const xTicks: { i: number; label: string }[] = []
  if (entries.length > 0) {
    const yearsTotal = totalMonths / 12
    const maxLabels = Math.max(3, Math.floor(iw / 70))
    const yearStrideRaw = Math.ceil(yearsTotal / maxLabels)
    const niceSteps = [1, 2, 3, 5, 10]
    const yearStride =
      niceSteps.find((s) => s >= yearStrideRaw) ??
      Math.ceil(yearStrideRaw / 5) * 5
    const monthStride = yearStride * 12
    for (let i = 0; i < totalMonths; i += monthStride) {
      let label: string
      if (i < histCount) {
        label = `’${String(entries[i].year).slice(-2)}`
      } else if (lastHist) {
        const proj = i - histCount
        const target = addCalendarMonths(
          lastHist.year,
          lastHist.month,
          lastHist.day,
          proj + 1
        )
        label = `’${String(target.year).slice(-2)}`
      } else {
        label = ""
      }
      xTicks.push({ i, label })
    }
  }

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const mx = e.clientX - rect.left
    if (mx < pad.l || mx > W - pad.r || totalMonths === 0) {
      setHover(null)
      return
    }
    // Pick the nearest data point on the real-time axis.
    let i = 0
    let bestDist = Infinity
    for (let k = 0; k < totalMonths; k++) {
      const d = Math.abs(x(k) - mx)
      if (d < bestDist) {
        bestDist = d
        i = k
      }
    }
    if (i < histCount) {
      const e2 = entries[i]
      const monthDividends = lookupDividends(e2)
      const cov = coverage?.[i]
      setHover({
        x: x(i),
        // Suppress the value dot on unrecorded months — the tooltip's
        // "Value: —" row already communicates the absence, so a dot would
        // be a lie about where the value line sits.
        y: e2.value !== null ? y(e2.value) : null,
        label: cov?.estimated ? `${e2.label} · estimated` : e2.label,
        rows: [
          { k: "Value", v: fmtEUR(e2.value), c: "var(--primary)" },
          {
            k: "Invested",
            v: fmtEUR(histCumInvested[i]),
            c: "var(--secondary-400)",
          },
          ...(monthDividends > 0
            ? [
                {
                  k: "Dividends",
                  v: fmtEUR(monthDividends),
                  c: "var(--tertiary)",
                },
              ]
            : []),
          // Disclose partial coverage: how many portfolios actually reported a
          // value this month vs. how many are being carried forward.
          ...(cov?.estimated
            ? [
                {
                  k: "Reported",
                  v: `${cov.reported} of ${cov.started}`,
                  c: "var(--neutral-400)",
                },
              ]
            : []),
        ],
      })
    } else {
      const pi = i - histCount
      const base = valueBase[pi]
      const cons = valueCons[pi]
      const opt = valueOpt[pi]
      const inv = projInvested[pi]
      const dYears = ((pi + 1) / 12).toFixed(1)
      setHover({
        x: x(i),
        y: y(base),
        label: `+${dYears}y · projected`,
        rows: [
          { k: "Optimistic", v: fmtEUR(opt), c: "var(--tertiary)" },
          { k: "Base", v: fmtEUR(base), c: "var(--primary)" },
          { k: "Conservative", v: fmtEUR(cons), c: "var(--secondary-400)" },
          { k: "Invested", v: fmtEUR(inv), c: "var(--neutral-400)" },
        ],
      })
    }
  }

  const visibleGoalLines = goalLines.filter((g) => g.value <= yMax * 1.1)

  const dividerX = x(Math.max(0, histCount - 1))

  return (
    <div
      ref={containerRef}
      style={{ position: "relative", width: "100%", height: H }}
      data-testid="growth-chart-container"
    >
      <svg
        width={W}
        height={H}
        role="img"
        aria-label="Portfolio growth chart showing historical and projected values"
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
        style={{ display: "block", maxWidth: "100%" }}
        data-testid="growth-chart-svg"
      >
        <YAxis
          ticks={yTicks}
          left={pad.l}
          right={W - pad.r}
          formatLabel={(v) => fmtEUR(v, { compact: true })}
        />

        <XAxis
          ticks={xTicks.map((t) => ({ x: x(t.i), label: t.label }))}
          baseline={pad.t + ih}
        />

        <rect
          x={dividerX}
          y={pad.t}
          width={Math.max(0, W - pad.r - dividerX)}
          height={ih}
          fill="var(--secondary-50)"
          opacity="0.5"
        />

        {visibleGoalLines.map((g) => (
          <g key={g.id}>
            <line
              x1={pad.l}
              x2={W - pad.r}
              y1={y(g.value)}
              y2={y(g.value)}
              stroke={g.color}
              strokeDasharray="4 4"
              strokeWidth="1.5"
              opacity="0.7"
            />
            <g transform={`translate(${W - pad.r - 4}, ${y(g.value) - 6})`}>
              <rect
                x="-92"
                y="-12"
                width="92"
                height="20"
                rx="4"
                fill={g.color}
              />
              <text
                x="-86"
                y="3"
                fontSize="11"
                fill="#fff"
                fontWeight="600"
                fontFamily="var(--font-body)"
              >
                {g.name} · {fmtEUR(g.value, { compact: true })}
              </text>
            </g>
          </g>
        ))}

        {/* Historical invested baseline */}
        <path
          d={areaToZero(histCumInvested)}
          fill="var(--secondary-400)"
          fillOpacity="0.06"
        />

        {/* Dividends bars */}
        {options.showDividends &&
          entries.map((e, i) => {
            const amount = lookupDividends(e)
            if (amount <= 0) return null
            const h = Math.max(2, Math.min(40, amount / 30))
            return (
              <rect
                key={`d${i}`}
                x={x(i) - 2}
                y={y(0) - h}
                width="4"
                height={h}
                fill="var(--tertiary)"
                opacity="0.85"
                rx="1"
              />
            )
          })}

        <path
          d={linePath(histCumInvested)}
          fill="none"
          stroke="var(--secondary-400)"
          strokeWidth="2"
          strokeDasharray="5 4"
        />
        {hasEstimated ? (
          <>
            {/* Solid where every started portfolio reported this month… */}
            <path
              d={segmentPath(valueHist, (i) => !isEstimated(i))}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* …dashed + faded where a portfolio's balance is carried forward. */}
            <path
              d={segmentPath(valueHist, isEstimated)}
              fill="none"
              stroke="var(--primary)"
              strokeWidth="2.5"
              strokeDasharray="3 4"
              opacity="0.45"
            />
          </>
        ) : (
          <path
            d={linePath(valueHist)}
            fill="none"
            stroke="var(--primary)"
            strokeWidth="2.5"
          />
        )}

        {/* Fan projection */}
        <path
          d={areaBetween(valueOpt, valueCons, histCount)}
          fill="var(--primary)"
          fillOpacity="0.10"
          stroke="none"
        />
        <path
          d={linePath(valueOpt, histCount)}
          fill="none"
          stroke="var(--tertiary)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <path
          d={linePath(valueCons, histCount)}
          fill="none"
          stroke="var(--secondary-400)"
          strokeWidth="1.5"
          strokeDasharray="4 3"
        />
        <path
          d={linePath(valueBase, histCount)}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
        />
        <path
          d={linePath(projInvested, histCount)}
          fill="none"
          stroke="var(--secondary-400)"
          strokeWidth="1.5"
          strokeDasharray="5 4"
        />

        {/* History/projection divider */}
        <line
          x1={dividerX}
          x2={dividerX}
          y1={pad.t}
          y2={pad.t + ih}
          stroke="var(--neutral-300)"
          strokeDasharray="2 3"
        />
        <g transform={`translate(${dividerX + 6}, ${pad.t + 14})`}>
          <rect
            x="0"
            y="-10"
            rx="4"
            width="54"
            height="18"
            fill="var(--neutral-800)"
          />
          <text
            x="27"
            y="3"
            textAnchor="middle"
            fontSize="10.5"
            fontWeight="700"
            fill="#fff"
            fontFamily="var(--font-body)"
            letterSpacing="0.04em"
          >
            NOW
          </text>
        </g>

        {hover && (
          <>
            <line
              x1={hover.x}
              x2={hover.x}
              y1={pad.t}
              y2={pad.t + ih}
              stroke="var(--neutral-400)"
              strokeDasharray="2 2"
            />
            {hover.y !== null && (
              <circle
                cx={hover.x}
                cy={hover.y}
                r="4.5"
                fill="#fff"
                stroke="var(--primary)"
                strokeWidth="2"
              />
            )}
          </>
        )}

        {lastHist && lastHist.value !== null && (
          <circle
            cx={x(histCount - 1)}
            cy={y(lastHist.value)}
            r="4"
            fill="var(--primary)"
            stroke="#fff"
            strokeWidth="2"
          />
        )}
      </svg>

      {hover && (
        <div
          className="chart-tooltip"
          style={{
            left: hover.x,
            // Fallback: when hovering an unrecorded month (no dot to anchor
            // to), float the tooltip at a comfortable top position.
            top: Math.max(30, (hover.y ?? 40) - 10),
            transform: "translate(-50%, -100%)",
          }}
        >
          <div className="tt-h">{hover.label}</div>
          {hover.rows.map((r, i) => (
            <div className="tt-row" key={i}>
              <span className="l">
                <span className="d" style={{ background: r.c }} />
                {r.k}
              </span>
              <span>{r.v}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
