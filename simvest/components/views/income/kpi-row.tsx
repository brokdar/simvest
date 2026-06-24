"use client"

import { useMemo } from "react"
import {
  concentrationTop,
  trailing12mIncome,
  trailingYoYDelta,
} from "@/lib/calc"
import { fmtEUR, fmtPct } from "@/lib/format"
import type { DividendBasis, IncomeEventDTO, IncomeKind } from "@/lib/types"

type Props = {
  events: IncomeEventDTO[]
  scopeId: number | undefined
  kindFilter: IncomeKind | "all"
  basis: DividendBasis
  totalScoped: number
  /** SSR-anchored "now" — see DataProvider.today. */
  asOf: Date
}

export function KpiRow({
  events,
  scopeId,
  kindFilter,
  basis,
  totalScoped,
  asOf,
}: Props) {
  const last12 = useMemo(
    () => trailing12mIncome(events, scopeId, kindFilter, basis, asOf),
    [events, scopeId, kindFilter, basis, asOf]
  )
  const yoy = useMemo(
    () => trailingYoYDelta(events, scopeId, kindFilter, basis, asOf),
    [events, scopeId, kindFilter, basis, asOf]
  )
  const conc = useMemo(
    () => concentrationTop(events, 3, basis),
    [events, basis]
  )

  const deltaSign = yoy.deltaAbs > 0 ? "+" : yoy.deltaAbs < 0 ? "−" : ""
  const deltaColor =
    yoy.deltaAbs > 0
      ? "var(--pos, var(--tertiary))"
      : yoy.deltaAbs < 0
        ? "var(--neg, var(--danger))"
        : "var(--neutral-400)"
  const deltaClass =
    yoy.deltaAbs > 0 ? "pos" : yoy.deltaAbs < 0 ? "neg" : "muted"
  const deltaText =
    yoy.prior12 > 0
      ? `${deltaSign}${fmtEUR(Math.abs(yoy.deltaAbs))} over last 12 mo`
      : "No prior-year baseline yet"

  return (
    <div className="grid-4 grid" style={{ marginBottom: 16 }}>
      <div className="kpi accent" data-testid="kpi-inc-total">
        <div className="label">Total ({basis})</div>
        <div className="value mono">{fmtEUR(totalScoped)}</div>
        <div className="delta" style={{ color: "rgba(255,255,255,0.85)" }}>
          Since inception
        </div>
      </div>
      <div className="kpi" data-testid="kpi-inc-last12">
        <div className="label">Last 12 months</div>
        <div className="value mono">{fmtEUR(last12)}</div>
        <div className="delta muted">Rolling trailing year</div>
      </div>
      <div className="kpi" data-testid="kpi-inc-yoy">
        <div className="label">Trailing YoY</div>
        <div className="value mono">
          {yoy.prior12 > 0 ? fmtPct(yoy.deltaPct, 1, true) : "—"}
        </div>
        <div
          className={`delta ${deltaClass}`}
          style={{ color: deltaColor }}
          aria-live="polite"
          data-testid="kpi-inc-yoy-delta"
        >
          {deltaText}
        </div>
      </div>
      <div className="kpi" data-testid="kpi-inc-concentration">
        <div className="label">Concentration</div>
        <div className="value mono">
          {conc.leaders.length > 0 ? fmtPct(conc.topPct, 0) : "—"}
        </div>
        <ConcentrationBar leaders={conc.leaders} />
        <div className="delta muted">
          {conc.leaders.length > 0
            ? `Top: ${conc.leaders[0].name} ${fmtPct(conc.leaders[0].pct, 0)}`
            : "No payouts yet"}
        </div>
      </div>
    </div>
  )
}

function ConcentrationBar({
  leaders,
}: {
  leaders: Array<{ name: string; pct: number }>
}) {
  if (leaders.length === 0) return null
  const colors = [
    "var(--primary)",
    "var(--primary-300)",
    "var(--tertiary)",
    "var(--neutral-200)",
  ]
  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex",
        height: 6,
        borderRadius: 3,
        overflow: "hidden",
        background: "var(--neutral-100)",
        marginTop: 4,
      }}
    >
      {leaders.map((l, i) => (
        <span
          key={`${l.name}-${i}`}
          title={`${l.name} ${fmtPct(l.pct, 0)}`}
          style={{
            width: `${l.pct}%`,
            background: colors[i] ?? "var(--neutral-200)",
          }}
        />
      ))}
    </div>
  )
}
