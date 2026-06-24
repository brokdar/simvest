/**
 * Shared scale math for hand-rolled SVG charts. The codebase deliberately
 * avoids Recharts / Visx / D3 — these helpers cover the 10% of axis logic
 * that every chart actually shares (tick spacing, "nice" upper bound),
 * leaving each chart to render its own axis primitives.
 */

export type NiceTickScale = { ticks: number[]; min: number; max: number }

/**
 * Compute "nice" round-number ticks across a domain. Picks a step from
 * {1, 2, 5} × 10^n so labels are readable; rounds the returned `min` / `max`
 * outward to the nearest step. `count` is a *target* — the actual tick count
 * is whatever makes the rounding work out (usually count ± 1).
 */
export function niceTicks(min: number, max: number, count = 5): NiceTickScale {
  const range = max - min
  if (range === 0) return { ticks: [min], min, max }
  const rawStep = range / count
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(rawStep))))
  const norm = rawStep / mag
  const niceStep = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag
  const niceMin = Math.floor(min / niceStep) * niceStep
  const niceMax = Math.ceil(max / niceStep) * niceStep
  const ticks: number[] = []
  for (let v = niceMin; v <= niceMax + niceStep * 0.5; v += niceStep) {
    ticks.push(Math.round(v / niceStep) * niceStep)
  }
  return { ticks, min: niceMin, max: niceMax }
}

/**
 * Round a single value up to the nearest "nice" magnitude — i.e. the next
 * power-of-10 step. Used by charts whose y-axis only needs an upper bound
 * (gridlines drawn at fixed fractions of that bound) and not a full tick
 * series. The lower bound is implicitly 0.
 *
 * Example: 23 → 30, 230 → 300, 2300 → 3000.
 */
export function niceMax(v: number): number {
  if (v <= 0) return 0
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  return Math.ceil(v / pow) * pow
}

export type AxisTick = { value: number; screen: number }

/**
 * Lay out evenly spaced ticks between two domain values and their screen
 * positions. Each tick is positioned by linear interpolation, so the chart
 * doesn't need to repeat the same `for (let i = 0; i <= count; i++) …` loop.
 *
 * Used by both growth-chart and overview-chart for their Y axis. `count` is
 * the number of *intervals* — the returned array has `count + 1` ticks.
 */
export function axisLayout(args: {
  min: number
  max: number
  count: number
  range: [number, number]
}): AxisTick[] {
  const { min, max, count, range } = args
  const [start, end] = range
  const ticks: AxisTick[] = []
  for (let i = 0; i <= count; i++) {
    const t = count === 0 ? 0 : i / count
    const value = min + (max - min) * t
    const screen = start + (end - start) * t
    ticks.push({ value, screen })
  }
  return ticks
}
