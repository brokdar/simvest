/**
 * X-axis label thinning for the hand-built SVG charts (M4).
 *
 * A fixed stride ("every Nth month") can't promise legible labels: the last
 * label is always drawn (it's "now"), so it can land right on top of the
 * stride label before it, and irregular time scales bunch strided labels
 * together. This picks the labels to draw by their actual extents instead.
 */

export type TickCandidate = {
  /** Caller's index (the data point the label belongs to). */
  index: number
  /** Label centre on the x axis, in the same units as `width`. */
  x: number
  /** Rendered label width. */
  width: number
}

/**
 * Rough rendered width of a short axis label. Axis labels are short
 * month/year strings in the body font, whose average glyph runs ~0.62em —
 * a generous estimate, so a "fits" verdict is safe.
 */
export function estimateLabelWidth(label: string, fontPx: number): number {
  return label.length * fontPx * 0.62
}

/**
 * Indices of the labels to draw so no two overlap (with `gap` between
 * neighbours). Walks left to right keeping each label that clears the last
 * kept one; the right-most candidate is always kept, dropping any kept
 * neighbours it would collide with.
 */
export function nonCollidingTicks(
  candidates: TickCandidate[],
  gap = 6
): Set<number> {
  const sorted = [...candidates].sort((a, b) => a.x - b.x)
  const clears = (a: TickCandidate, b: TickCandidate) =>
    b.x - b.width / 2 >= a.x + a.width / 2 + gap
  const kept: TickCandidate[] = []
  for (const c of sorted) {
    const last = kept[kept.length - 1]
    if (!last || clears(last, c)) kept.push(c)
  }
  const final = sorted[sorted.length - 1]
  if (final && kept[kept.length - 1] !== final) {
    while (kept.length > 0 && !clears(kept[kept.length - 1], final)) kept.pop()
    kept.push(final)
  }
  return new Set(kept.map((c) => c.index))
}
