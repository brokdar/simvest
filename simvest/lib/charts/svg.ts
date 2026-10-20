/**
 * Serialise a coordinate for an SVG path / attribute string. Rounds to
 * `digits` decimals (sub-pixel precision beyond that is invisible and only
 * bloats the DOM). Not a display formatter — numbers a user reads go through
 * `fmtNum / fmtPct / fmtEUR` in `lib/format.ts`.
 */
export function svgNum(n: number, digits = 1): string {
  const f = 10 ** digits
  return String(Math.round(n * f) / f)
}
