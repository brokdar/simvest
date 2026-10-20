import { svgNum } from "./svg"

/**
 * SVG path for one donut slice from `start` to `end` (radians, 0 = 3 o'clock,
 * clockwise). A slice covering the whole ring (one source = 100%) is drawn as
 * two half arcs: a single arc whose start and end points coincide renders as
 * nothing, which is how a 100% donut used to come out blank (N14).
 */
export function donutSlicePath(
  start: number,
  end: number,
  outerR: number,
  innerR: number
): string {
  const sweep = end - start
  if (sweep >= Math.PI * 2 - 1e-6) {
    const mid = start + Math.PI
    return [
      donutSlicePath(start, mid, outerR, innerR),
      donutSlicePath(mid, start + Math.PI * 2, outerR, innerR),
    ].join(" ")
  }
  const largeArc = sweep > Math.PI ? 1 : 0
  const x1 = Math.cos(start) * outerR
  const y1 = Math.sin(start) * outerR
  const x2 = Math.cos(end) * outerR
  const y2 = Math.sin(end) * outerR
  const x3 = Math.cos(end) * innerR
  const y3 = Math.sin(end) * innerR
  const x4 = Math.cos(start) * innerR
  const y4 = Math.sin(start) * innerR
  return [
    `M ${svgNum(x1, 2)} ${svgNum(y1, 2)}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${svgNum(x2, 2)} ${svgNum(y2, 2)}`,
    `L ${svgNum(x3, 2)} ${svgNum(y3, 2)}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${svgNum(x4, 2)} ${svgNum(y4, 2)}`,
    "Z",
  ].join(" ")
}
