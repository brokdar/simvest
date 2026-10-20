/**
 * One colour scale for the whole income heatmap (N11). Buckets used to be
 * relative to each year's own maximum, so €17,78 in a quiet year and €428,74
 * in a busy one rendered the same shade. Now every cell is measured against
 * the single largest month on screen, and the legend states the ranges.
 */
export const HEAT_BUCKETS = 5

/** 0 for no payout; 1..HEAT_BUCKETS for a positive amount against `max`. */
export function heatBucket(v: number, max: number): number {
  if (!(v > 0) || !(max > 0)) return 0
  return Math.min(
    HEAT_BUCKETS,
    Math.max(1, Math.ceil((v / max) * HEAT_BUCKETS))
  )
}

/** Upper bound (in €) of each bucket, for the legend: [max/5, 2max/5, …, max]. */
export function heatBucketBounds(max: number): number[] {
  return Array.from(
    { length: HEAT_BUCKETS },
    (_, i) => (max * (i + 1)) / HEAT_BUCKETS
  )
}
