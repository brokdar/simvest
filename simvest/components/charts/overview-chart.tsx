"use client"

import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type TouchEvent as ReactTouchEvent,
} from "react"
import { fmtEUR } from "@/lib/format"
import { axisLayout, niceMax } from "@/lib/charts/scales"
import { XAxis, YAxis } from "@/components/charts/axis"
import type { EntryDTO } from "@/lib/types"

// Mirrors the GrowthChart precedent — narrow initial width avoids a horizontal
// page scroll on the mobile first paint (393px viewport - 64px sidebar ≈ 329px).
const DEFAULT_CHART_WIDTH = 320
const PAD = { l: 56, r: 20, t: 16, b: 36 } as const
const Y_TICK_COUNT = 5
const NICE_STEPS = [1, 2, 3, 5, 10] as const
// Half-width used to clamp the tooltip away from the chart edges. Conservative —
// the actual tooltip can be wider for very long EUR values, but this prevents
// the common overflow at the left/right edge.
const TOOLTIP_HALF_WIDTH = 110

type Props = {
  entries: EntryDTO[]
  values: (number | null)[]
  invested: number[]
  height?: number
}

// `dotColor` carries the semantic accent (primary/secondary/green/red);
// `valueColor` is what the value text actually renders in — usually white
// for readability against the dark tooltip background. Decoupling them
// lets us keep red/green semantics in the swatch without the dark blue
// "Value" amount disappearing into a navy background.
type TooltipRow = {
  k: string
  v: string
  dotColor: string
  valueColor: string
}

type ActivePoint = {
  i: number
  x: number
  y: number | null
  label: string
  rows: TooltipRow[]
}

const containerStyle = {
  position: "relative",
  width: "100%",
} as const

// touch-action: pan-y lets vertical page scroll pass through the chart while
// horizontal hover-scrubbing is captured. Without this, scrolling a tall page
// fights the chart's hover handler on touch devices.
const svgStyle = {
  display: "block",
  maxWidth: "100%",
  touchAction: "pan-y",
} as const

const emptyStateStyle = {
  width: "100%",
  display: "grid",
  placeItems: "center",
} as const

// Single-pass max over both series. Replaces `Math.max(0, ...values, ...invested)`,
// which blows the JS argument-count limit (~10k on V8) once the entry history
// grows large — same reason the view's outer useMemo avoids the spread.
function rawMaxOf(
  values: readonly (number | null)[],
  invested: readonly number[]
): number {
  let m = 0
  for (let i = 0; i < values.length; i++) {
    const v = values[i]
    if (v !== null && v > m) m = v
  }
  for (let i = 0; i < invested.length; i++) {
    if (invested[i] > m) m = invested[i]
  }
  return m
}

export const OverviewChart = memo(function OverviewChart({
  entries,
  values,
  invested,
  height = 220,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [W, setW] = useState(DEFAULT_CHART_WIDTH)
  // Stable IDs so multiple charts on the same page don't share clip regions.
  const reactId = useId()
  const clipAboveId = `ov-above-${reactId}`
  const clipBelowId = `ov-below-${reactId}`
  // Single source of truth for which point is currently shown in the tooltip —
  // driven by mouse, touch, or keyboard. Decoupling the index from the rendered
  // coordinates keeps the hover state JSON-serialisable and easy to derive from.
  const [activeIdx, setActiveIdx] = useState<number | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((ents) => {
      for (const e of ents) setW(Math.floor(e.contentRect.width))
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const H = height
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const n = entries.length

  const { lastIdx, lastValue } = useMemo(() => {
    for (let i = n - 1; i >= 0; i--) {
      const v = values[i]
      if (v !== null) return { lastIdx: i, lastValue: v }
    }
    return { lastIdx: -1, lastValue: null as number | null }
  }, [values, n])

  const yMax = useMemo(
    () => niceMax(rawMaxOf(values, invested) * 1.05),
    [values, invested]
  )

  const scaleX = useCallback(
    (i: number) => (n <= 1 ? PAD.l + iw / 2 : PAD.l + (i / (n - 1)) * iw),
    [n, iw]
  )
  const scaleY = useCallback(
    (v: number) => PAD.t + ih - (v / (yMax || 1)) * ih,
    [ih, yMax]
  )

  const investedPath = useMemo(() => {
    const parts: string[] = []
    for (let i = 0; i < invested.length; i++) {
      parts.push(
        (i === 0 ? "M" : "L") +
          scaleX(i).toFixed(1) +
          " " +
          scaleY(invested[i]).toFixed(1)
      )
    }
    return parts.join(" ")
  }, [invested, scaleX, scaleY])

  const valuesPath = useMemo(() => {
    let needsMove = true
    const parts: string[] = []
    for (let i = 0; i < values.length; i++) {
      const v = values[i]
      if (v === null) {
        needsMove = true
        continue
      }
      parts.push(
        (needsMove ? "M" : "L") +
          scaleX(i).toFixed(1) +
          " " +
          scaleY(v).toFixed(1)
      )
      needsMove = false
    }
    return parts.join(" ")
  }, [values, scaleX, scaleY])

  // Profit/loss area: contiguous runs of non-null values form closed polygons
  // between the value line (top) and the matching invested line (bottom).
  // The whole polygon is rendered twice — once green, once red — and SVG
  // clip-paths bisected by the invested polyline reveal each color only on
  // the side it belongs to. That handles arbitrary crossovers without any
  // segment-by-segment intersection math.
  const areaSegments = useMemo(() => {
    const parts: string[] = []
    let runStart = -1
    for (let i = 0; i <= n; i++) {
      const v = i < n ? values[i] : null
      if (v === null) {
        if (runStart >= 0 && i - 1 > runStart) {
          const end = i - 1
          const top: string[] = []
          for (let k = runStart; k <= end; k++) {
            top.push(
              (k === runStart ? "M" : "L") +
                scaleX(k).toFixed(1) +
                " " +
                scaleY(values[k]!).toFixed(1)
            )
          }
          const bot: string[] = []
          for (let k = end; k >= runStart; k--) {
            bot.push(
              "L" + scaleX(k).toFixed(1) + " " + scaleY(invested[k]).toFixed(1)
            )
          }
          parts.push(top.join(" ") + " " + bot.join(" ") + " Z")
        }
        runStart = -1
      } else if (runStart < 0) {
        runStart = i
      }
    }
    return parts.join(" ")
  }, [values, invested, n, scaleX, scaleY])

  // Region strictly above the invested polyline — used to mask the green
  // tint so it only paints where value > invested.
  const clipAboveD = useMemo(() => {
    if (n === 0) return ""
    const left = scaleX(0).toFixed(1)
    const right = scaleX(n - 1).toFixed(1)
    const parts = [`M${left} ${PAD.t}`, `L${right} ${PAD.t}`]
    for (let i = n - 1; i >= 0; i--) {
      parts.push(
        "L" + scaleX(i).toFixed(1) + " " + scaleY(invested[i]).toFixed(1)
      )
    }
    parts.push("Z")
    return parts.join(" ")
  }, [n, invested, scaleX, scaleY])

  // Region strictly below the invested polyline — used to mask the red tint.
  const clipBelowD = useMemo(() => {
    if (n === 0) return ""
    const left = scaleX(0).toFixed(1)
    const right = scaleX(n - 1).toFixed(1)
    const bottom = (PAD.t + ih).toFixed(1)
    const parts: string[] = []
    for (let i = 0; i < n; i++) {
      parts.push(
        (i === 0 ? "M" : "L") +
          scaleX(i).toFixed(1) +
          " " +
          scaleY(invested[i]).toFixed(1)
      )
    }
    parts.push(`L${right} ${bottom}`, `L${left} ${bottom}`, "Z")
    return parts.join(" ")
  }, [n, ih, invested, scaleX, scaleY])

  const yTicks = useMemo(
    () =>
      axisLayout({
        min: 0,
        max: yMax,
        count: Y_TICK_COUNT,
        range: [PAD.t + ih, PAD.t],
      }),
    [yMax, ih]
  )

  const xTicks = useMemo(() => {
    if (n === 0) return [] as { x: number; label: string }[]
    const yearsTotal = n / 12
    const maxLabels = Math.max(3, Math.floor(iw / 70))
    const yearStrideRaw = Math.max(1, Math.ceil(yearsTotal / maxLabels))
    const yearStride =
      NICE_STEPS.find((s) => s >= yearStrideRaw) ??
      Math.ceil(yearStrideRaw / 5) * 5
    const monthStride = yearStride * 12
    const out: { x: number; label: string }[] = []
    for (let i = 0; i < n; i += monthStride) {
      out.push({ x: scaleX(i), label: `’${String(entries[i].year).slice(-2)}` })
    }
    return out
  }, [entries, n, iw, scaleX])

  const anchor = useMemo(
    () =>
      lastIdx >= 0 && lastValue !== null
        ? { x: scaleX(lastIdx), y: scaleY(lastValue) }
        : null,
    [lastIdx, lastValue, scaleX, scaleY]
  )

  const active: ActivePoint | null = useMemo(() => {
    if (activeIdx === null || activeIdx < 0 || activeIdx >= n) return null
    const e = entries[activeIdx]
    const value = values[activeIdx]
    const inv = invested[activeIdx]
    const net = value !== null ? value - inv : null
    // Net row uses brighter palette tints (tertiary-400 / a rose tint) so the
    // text passes WCAG contrast against the navy tooltip background. The
    // semantic dot stays in the deeper accent for color-coded identification.
    const netDotColor =
      net !== null && net < 0 ? "var(--destructive)" : "var(--tertiary)"
    const netValueColor =
      net !== null && net < 0 ? "#fca5a5" : "var(--tertiary-400)"
    return {
      i: activeIdx,
      x: scaleX(activeIdx),
      y: value !== null ? scaleY(value) : null,
      label: e.label,
      rows: [
        {
          k: "Value",
          v: fmtEUR(value),
          // Use the lighter primary tint for the swatch — #1E40AF on
          // --neutral-800 has ~2:1 contrast, which makes the dot disappear.
          dotColor: "var(--primary-400)",
          valueColor: "#ffffff",
        },
        {
          k: "Invested",
          v: fmtEUR(inv),
          dotColor: "var(--secondary-400)",
          valueColor: "rgba(255, 255, 255, 0.92)",
        },
        {
          k: "Net",
          v: net !== null ? fmtEUR(net, { sign: true }) : "—",
          dotColor: netDotColor,
          valueColor: netValueColor,
        },
      ],
    }
  }, [activeIdx, entries, values, invested, n, scaleX, scaleY])

  const ariaSummary = useMemo(() => {
    if (n === 0) return "No portfolio data."
    if (lastIdx < 0 || lastValue === null) {
      return `${n} months of portfolio history, no recorded values yet.`
    }
    const inv = invested[lastIdx]
    const delta = lastValue - inv
    const status = delta >= 0 ? "in profit" : "in loss"
    return `${n} months of portfolio history. Latest value ${fmtEUR(lastValue)} versus ${fmtEUR(inv)} cumulatively invested (${status} by ${fmtEUR(Math.abs(delta))}).`
  }, [n, lastIdx, lastValue, invested])

  // Debounce the live-region announcement so a mouse scrub doesn't queue an
  // announcement for every pixel it passes over. Keyboard navigation also
  // benefits — it lands on a point, settles, and gets a single announcement.
  // 250 ms is short enough that a deliberate stop feels responsive but long
  // enough that "fly the cursor across the chart" produces nothing.
  const [announce, setAnnounce] = useState("")
  useEffect(() => {
    if (!active) {
      setAnnounce("")
      return
    }
    const text = `${active.label}: ${active.rows
      .map((r) => `${r.k} ${r.v}`)
      .join(", ")}`
    const t = setTimeout(() => setAnnounce(text), 250)
    return () => clearTimeout(t)
  }, [active])

  const setNearest = useCallback(
    (clientX: number, clientY: number, rect: DOMRect) => {
      const mx = clientX - rect.left
      const my = clientY - rect.top
      // Null on vertical edges too — without this the crosshair sticks when a
      // pointer enters/exits through the top/bottom of the SVG.
      if (
        mx < PAD.l ||
        mx > W - PAD.r ||
        my < PAD.t ||
        my > H - PAD.b ||
        n === 0
      ) {
        setActiveIdx(null)
        return
      }
      let best = 0
      let bestDist = Infinity
      for (let k = 0; k < n; k++) {
        const d = Math.abs(scaleX(k) - mx)
        if (d < bestDist) {
          bestDist = d
          best = k
        }
      }
      setActiveIdx(best)
    },
    [n, scaleX, W, H]
  )

  const onMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      setNearest(e.clientX, e.clientY, e.currentTarget.getBoundingClientRect())
    },
    [setNearest]
  )

  const onTouchMove = useCallback(
    (e: ReactTouchEvent<SVGSVGElement>) => {
      const t = e.touches[0]
      if (!t) {
        setActiveIdx(null)
        return
      }
      setNearest(t.clientX, t.clientY, e.currentTarget.getBoundingClientRect())
    },
    [setNearest]
  )

  const clearActive = useCallback(() => setActiveIdx(null), [])

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent<SVGSVGElement>) => {
      if (n === 0) return
      const start = activeIdx ?? (lastIdx >= 0 ? lastIdx : 0)
      let next: number | null
      switch (e.key) {
        case "ArrowRight":
          next = Math.min(n - 1, start + 1)
          break
        case "ArrowLeft":
          next = Math.max(0, start - 1)
          break
        case "Home":
          next = 0
          break
        case "End":
          next = n - 1
          break
        case "Escape":
          next = null
          break
        default:
          return
      }
      e.preventDefault()
      setActiveIdx(next)
    },
    [n, activeIdx, lastIdx]
  )

  const sizedContainerStyle = useMemo(
    () => ({ ...containerStyle, height: H }),
    [H]
  )
  const sizedEmptyStateStyle = useMemo(
    () => ({ ...emptyStateStyle, height: H }),
    [H]
  )

  if (n === 0) {
    return (
      <div ref={containerRef} style={sizedEmptyStateStyle}>
        <div className="muted small">No entries yet</div>
      </div>
    )
  }

  const tooltipLeft =
    active === null
      ? 0
      : Math.max(TOOLTIP_HALF_WIDTH, Math.min(W - TOOLTIP_HALF_WIDTH, active.x))

  return (
    <div
      ref={containerRef}
      style={sizedContainerStyle}
      data-testid="overview-chart-container"
    >
      <svg
        width={W}
        height={H}
        role="img"
        aria-label="Portfolio value vs cumulative invested over time"
        tabIndex={0}
        onMouseMove={onMouseMove}
        onMouseLeave={clearActive}
        onTouchMove={onTouchMove}
        onTouchEnd={clearActive}
        onTouchCancel={clearActive}
        onBlur={clearActive}
        onKeyDown={onKeyDown}
        style={svgStyle}
        className="focus-ring-svg"
        data-testid="overview-chart-svg"
      >
        <desc>{ariaSummary}</desc>

        <YAxis
          ticks={yTicks}
          left={PAD.l}
          right={W - PAD.r}
          formatLabel={(v) => fmtEUR(v, { compact: true })}
        />

        <XAxis ticks={xTicks} baseline={PAD.t + ih} />

        {areaSegments && (
          <>
            <defs>
              <clipPath id={clipAboveId}>
                <path d={clipAboveD} />
              </clipPath>
              <clipPath id={clipBelowId}>
                <path d={clipBelowD} />
              </clipPath>
            </defs>
            <path
              d={areaSegments}
              fill="var(--tertiary)"
              fillOpacity="0.14"
              clipPath={`url(#${clipAboveId})`}
            />
            <path
              d={areaSegments}
              fill="var(--destructive)"
              fillOpacity="0.14"
              clipPath={`url(#${clipBelowId})`}
            />
          </>
        )}

        <path
          d={investedPath}
          fill="none"
          stroke="var(--secondary-400)"
          strokeWidth="2"
          strokeDasharray="5 4"
        />
        <path
          d={valuesPath}
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2"
        />

        {active && (
          <g aria-hidden="true">
            <line
              x1={active.x}
              x2={active.x}
              y1={PAD.t}
              y2={PAD.t + ih}
              stroke="var(--neutral-400)"
              strokeDasharray="2 2"
            />
            {active.y !== null && (
              <circle
                cx={active.x}
                cy={active.y}
                r="4.5"
                fill="var(--surface)"
                stroke="var(--primary)"
                strokeWidth="2"
              />
            )}
          </g>
        )}

        {/* Static anchor pulse is hidden while the user is hovering so it
            doesn't fight the hover circle and crosshair for attention. */}
        {anchor && !active && (
          <g aria-hidden="true">
            <circle
              cx={anchor.x}
              cy={anchor.y}
              r="11"
              fill="var(--primary)"
              fillOpacity="0.18"
            />
            <circle
              cx={anchor.x}
              cy={anchor.y}
              r="5"
              fill="var(--primary)"
              stroke="var(--surface)"
              strokeWidth="2"
            />
          </g>
        )}
      </svg>

      {/* Screen-reader-only announcement of the *settled* active point. The
          visual tooltip below is decorative (aria-hidden) so polite live
          updates aren't repeated for sighted users. role=status implies
          aria-live=polite — using only aria-live keeps the contract explicit
          and avoids the double-announce some AT engines emit when both are
          set. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {announce}
      </div>

      <div aria-hidden="true">
        {active && (
          <div
            className="chart-tooltip"
            style={{
              left: tooltipLeft,
              top: Math.max(30, (active.y ?? 40) - 10),
              transform: "translate(-50%, -100%)",
            }}
          >
            <div className="tt-h">{active.label}</div>
            {active.rows.map((r, i) => (
              <div className="tt-row" key={i}>
                <span className="l">
                  <span className="d" style={{ background: r.dotColor }} />
                  {r.k}
                </span>
                <span style={{ color: r.valueColor }}>{r.v}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
})
