"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { useDataActions } from "@/components/providers/data-provider"
import { ProgressRing } from "@/components/progress-ring"
import { fmtEUR, fmtPct } from "@/lib/format"
import type { GoalDTO, PortfolioDTO } from "@/lib/types"
import type { GoalEvaluation } from "@/lib/calc"
import { goalVerdict } from "@/lib/goal-evaluator"
import { swatch } from "@/lib/palette"

function goalLineFor(g: GoalDTO): string {
  switch (g.kind) {
    case "portfolio_value":
      return `Reach ${fmtEUR(g.target, { compact: true })}`
    case "annual_income":
      return `${fmtEUR(g.target)}/yr income`
    case "dividend_annual":
      return `${fmtEUR(g.target)}/yr dividends`
    case "dividend_monthly":
      return `${fmtEUR(g.target)}/mo dividends`
  }
}

/**
 * On-track verdict + projected-reach year, surfaced from the evaluation. A
 * goal that's behind is something to adjust, not an error: warn, and the
 * line leads with what closes the gap (T2).
 */
function goalStatus(
  ev: GoalEvaluation | undefined,
  targetYear: number
): {
  text: string
  cls: "pos" | "warn" | "muted"
} {
  if (!ev) return { text: "—", cls: "muted" }
  const v = goalVerdict(ev, targetYear)
  return { text: v.text, cls: v.onTrack ? "pos" : "warn" }
}

type Props = {
  goals: GoalDTO[]
  goalEvals: Record<number, GoalEvaluation>
  title?: string
  /** Rendered inside the card when there are no goals. When omitted, the whole
   * strip is hidden on an empty list (no error, no empty card). */
  emptyState?: ReactNode
  testId?: string
  /** Lets a portfolio-scoped goal link to its account (W6). */
  portfolios?: PortfolioDTO[]
}

/**
 * Shared goal-progress card: a ring + name + pct + on-track/projected-year line
 * per goal. Reused on the Overview (all goals, with a "set a goal" CTA) and the
 * Income page (dividend goals only, hidden when none).
 */
export function GoalProgressStrip({
  goals,
  goalEvals,
  title = "Goal progress",
  emptyState,
  testId = "goal-progress-section",
  portfolios = [],
}: Props) {
  const { setSelectedPortfolio } = useDataActions()
  if (goals.length === 0 && emptyState == null) return null
  return (
    <div className="card card-pad" data-testid={testId}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
        }}
      >
        <h2 className="card-title">{title}</h2>
        <span
          className={`chip ${goals.length > 0 ? "primary" : ""}`}
          data-testid="goal-progress-chip"
        >
          {goals.length}&nbsp;active
        </span>
      </div>
      {goals.length === 0 ? emptyState : null}
      {goals.map((g) => {
        const ev = goalEvals[g.id]
        const pct = Math.min(1, Math.max(0, ev?.pct ?? 0))
        const status = goalStatus(ev, g.targetYear)
        const account =
          g.scope === "portfolio"
            ? portfolios.find((p) => p.id === g.portfolioId)
            : undefined
        return (
          <div
            key={g.id}
            data-testid="goal-item"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 0",
              borderTop: "1px solid var(--border)",
            }}
          >
            <ProgressRing pct={pct} color={swatch(g.color)} />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <Link
                  href={`/goals?goal=${g.id}`}
                  className="goal-item-name tap-pad"
                  data-testid="goal-item-link"
                >
                  {g.name}
                </Link>
                <div
                  className="mono small"
                  style={{ fontWeight: 600 }}
                  data-testid="goal-pct"
                >
                  {fmtPct(pct * 100)}
                </div>
              </div>
              <div className="muted small">
                {goalLineFor(g)} · target {g.targetYear} · needs{" "}
                {fmtEUR(ev?.portfolioTargetValue ?? 0, { compact: true })}
                {account && (
                  <>
                    {" · in "}
                    <Link
                      href="/"
                      onClick={() => setSelectedPortfolio(account.id)}
                      className="goal-item-account"
                      data-testid="goal-item-account"
                    >
                      {account.name}
                    </Link>
                  </>
                )}
              </div>
              <div
                className={`small ${status.cls}`}
                style={{ fontWeight: 600, marginTop: 2 }}
                data-testid="goal-status"
              >
                {status.text}
              </div>
              {/* W6: "€X/mo more gets you there" — one click to where the
                  monthly contribution is set. */}
              {ev && !ev.onTrack && (
                <Link
                  href={
                    account
                      ? `/settings#contribution-${account.id}`
                      : "/settings#portfolios"
                  }
                  className="goal-item-fix small tap-pad"
                  data-testid="goal-item-fix"
                >
                  {ev.monthlySaving > 0
                    ? "Change your monthly contribution →"
                    : "Set a monthly contribution →"}
                </Link>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
