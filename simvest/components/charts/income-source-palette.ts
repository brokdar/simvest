import { aggregateIncomeBySource } from "@/lib/calc"
import type { DividendBasis, IncomeEventDTO, IncomeKind } from "@/lib/types"

/**
 * One palette shared by every income-by-source visual (donut + monthly bars)
 * so a holding keeps the same color across the page. Colors are assigned by
 * descending total, matching the donut's slice order; sources past the top N
 * fold into a single neutral "Others" bucket.
 */
export const SOURCE_PALETTE = [
  "var(--primary)",
  "var(--tertiary)",
  "var(--primary-400)",
  "#A855F7",
  "#F59E0B",
  "#0EA5E9",
  "#EC4899",
]
export const OTHERS_COLOR = "var(--neutral-300)"

export type SourceColors = {
  /** Palette color for a top-N source; `OTHERS_COLOR` for the long tail. */
  colorFor: (id: number | "interest") => string
  /** Stable stack/legend order (0 = largest); `+Infinity` for "Others". */
  rankOf: (id: number | "interest") => number
  /** True when the source has its own slice rather than folding into Others. */
  isTop: (id: number | "interest") => boolean
}

/**
 * Build the id→color map from the same ranking the donut uses
 * (`aggregateIncomeBySource`), so both views agree on which holding owns which
 * color and which fall into "Others".
 */
export function buildSourceColors(
  events: IncomeEventDTO[],
  kindFilter: IncomeKind | "all",
  basis: DividendBasis,
  topN = 6
): SourceColors {
  const ranked = aggregateIncomeBySource(events, kindFilter, basis)
  const color = new Map<number | "interest", string>()
  const rank = new Map<number | "interest", number>()
  ranked.slice(0, topN).forEach((s, i) => {
    const id: number | "interest" =
      s.holdingId === null ? "interest" : s.holdingId
    color.set(id, SOURCE_PALETTE[i % SOURCE_PALETTE.length])
    rank.set(id, i)
  })
  return {
    colorFor: (id) => color.get(id) ?? OTHERS_COLOR,
    rankOf: (id) => rank.get(id) ?? Number.POSITIVE_INFINITY,
    isTop: (id) => color.has(id),
  }
}
