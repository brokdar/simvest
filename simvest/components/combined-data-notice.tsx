"use client"

import type { StaleContributor } from "@/lib/calc"
import { labelFor } from "@/lib/types"

/**
 * One-line disclosure shown on the combined view when one or more portfolios
 * have stopped reporting month-end values. The combined value carries their
 * last known balance forward (see `aggregatePortfoliosWithCoverage`), so totals
 * stay sensible instead of cratering — but the user should know some of the
 * figure is estimated, and which portfolios are behind. Renders nothing when
 * every contributor is current.
 */
export function CombinedDataNotice({ stale }: { stale: StaleContributor[] }) {
  if (stale.length === 0) return null

  const list = stale
    .map((s) => `${s.name} (${labelFor(s.lastYear, s.lastMonth)})`)
    .join(", ")
  const verb = stale.length === 1 ? "hasn’t" : "haven’t"

  return (
    <div
      role="status"
      data-testid="combined-data-notice"
      style={{
        display: "flex",
        gap: 10,
        alignItems: "flex-start",
        padding: "10px 12px",
        marginBottom: 16,
        borderRadius: 10,
        fontSize: 13,
        lineHeight: 1.45,
        color: "var(--warning)",
        background: "color-mix(in srgb, var(--warning) 8%, transparent)",
        border: "1px solid color-mix(in srgb, var(--warning) 30%, transparent)",
      }}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        style={{ flexShrink: 0, marginTop: 1 }}
      >
        <path
          d="M8 1.5L15 14H1L8 1.5Z"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <path
          d="M8 6.2V9.4"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <circle cx="8" cy="11.4" r="0.8" fill="currentColor" />
      </svg>
      <span>
        <strong>{list}</strong> {verb} reported a value recently — combined
        totals carry the last known balance forward, and estimated months are
        dashed on the chart.
      </span>
    </div>
  )
}
