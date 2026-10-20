"use client"

import Link from "next/link"
import { Fragment } from "react"
import { useDataActions } from "@/components/providers/data-provider"
import type { StaleContributor } from "@/lib/calc"
import { fmtMonth } from "@/lib/dates"
import { plural } from "@/lib/format"
import { COMBINED_PORTFOLIO_ID } from "@/lib/types"

/**
 * Friendly nudge shown on the combined view when one or more portfolios
 * haven't had a month-end value typed in yet. The combined value carries their
 * last known balance forward (see `aggregatePortfoliosWithCoverage`), so
 * totals stay sensible — this says so, and links each account straight into
 * its entry form so the fix is one click (T1, W6); with several stale
 * accounts, one more link opens the catch-up form for all of them (W2). Informational, never a
 * warning: not having typed this month's number yet isn't a problem.
 * Renders nothing when every contributor is current.
 */
export function CombinedDataNotice({ stale }: { stale: StaleContributor[] }) {
  const { setSelectedPortfolio } = useDataActions()
  if (stale.length === 0) return null

  const n = stale.length
  return (
    <div
      role="status"
      className="data-nudge"
      data-testid="combined-data-notice"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 16 16"
        fill="none"
        aria-hidden="true"
        style={{ flexShrink: 0, marginTop: 2 }}
      >
        <circle cx="8" cy="8" r="6.5" stroke="currentColor" strokeWidth="1.3" />
        <path
          d="M8 7.2V11"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeLinecap="round"
        />
        <circle cx="8" cy="5" r="0.8" fill="currentColor" />
      </svg>
      <span>
        <strong>
          {n === 1 ? "One account" : `${n} accounts`} could use a refresh
        </strong>{" "}
        — add this month’s {plural(n, "number", "numbers")} for{" "}
        {stale.map((s, i) => (
          <Fragment key={s.id}>
            {i > 0 ? (i === n - 1 ? " and " : ", ") : null}
            <Link
              href="/entries?new=entry"
              onClick={() => setSelectedPortfolio(s.id)}
              className="data-nudge-link"
              data-testid={`stale-link-${s.id}`}
            >
              {s.name}
            </Link>{" "}
            <span className="data-nudge-since">
              (last {fmtMonth(s.lastYear, s.lastMonth)})
            </span>
          </Fragment>
        ))}
        . Until then the totals reuse {plural(n, "its", "their")} last balance,
        shown dashed on the chart.
        {n > 1 && (
          <>
            {" "}
            <Link
              href="/entries"
              onClick={() => setSelectedPortfolio(COMBINED_PORTFOLIO_ID)}
              className="data-nudge-link"
              data-testid="stale-catchup-link"
            >
              Log them all at once →
            </Link>
          </>
        )}
      </span>
    </div>
  )
}
