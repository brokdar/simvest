"use client"

import type { ReactNode } from "react"
import { ProgressRing } from "@/components/progress-ring"
import { fmtEUR } from "@/lib/format"
import type { GoalDTO } from "@/lib/types"
import type { GoalEvaluation } from "@/lib/calc"

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

/** On-track verdict + projected-reach year, surfaced from the evaluation. */
function goalStatus(ev: GoalEvaluation | undefined): {
  text: string
  cls: "pos" | "neg" | "muted"
} {
  if (!ev) return { text: "—", cls: "muted" }
  const reach =
    ev.projectedYear !== null
      ? `reaches ${Math.round(ev.projectedYear)}`
      : "not within 40y"
  return ev.onTrack
    ? { text: `On track · ${reach}`, cls: "pos" }
    : { text: `Behind · ${reach}`, cls: "neg" }
}

type Props = {
  goals: GoalDTO[]
  goalEvals: Record<number, GoalEvaluation>
  title?: string
  /** Rendered inside the card when there are no goals. When omitted, the whole
   * strip is hidden on an empty list (no error, no empty card). */
  emptyState?: ReactNode
  testId?: string
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
}: Props) {
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
        const status = goalStatus(ev)
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
            <ProgressRing pct={pct} color={g.color} />
            <div style={{ flex: 1 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                }}
              >
                <div style={{ fontWeight: 600, fontSize: 14 }}>{g.name}</div>
                <div
                  className="mono small"
                  style={{ fontWeight: 600 }}
                  data-testid="goal-pct"
                >
                  {(pct * 100).toFixed(1)}%
                </div>
              </div>
              <div className="muted small">
                {goalLineFor(g)} · target {g.targetYear} · needs{" "}
                {fmtEUR(ev?.portfolioTargetValue ?? 0, { compact: true })}
              </div>
              <div
                className={`small ${status.cls}`}
                style={{ fontWeight: 600, marginTop: 2 }}
                data-testid="goal-status"
              >
                {status.text}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
