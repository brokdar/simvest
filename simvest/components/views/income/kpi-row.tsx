"use client"

import { useMemo } from "react"
import {
  aggregateIncomeBySource,
  concentrationTop,
  concentrationVerdict,
} from "@/lib/calc"
import { fromMonthIdx, incomeWindow } from "@/lib/income-window"
import { fmtEUR, fmtPct, plural } from "@/lib/format"
import { fmtMonth } from "@/lib/dates"
import {
  BASIS_LABEL,
  type DividendBasis,
  type IncomeEventDTO,
  type IncomeKind,
} from "@/lib/types"

type Props = {
  events: IncomeEventDTO[]
  scopeId: number | undefined
  kindFilter: IncomeKind | "all"
  basis: DividendBasis
  totalScoped: number
  /** SSR-anchored "now" — see DataProvider.today. */
  asOf: Date
  /** Portfolio id → display name, for the like-for-like disclosure. */
  portfolioName: (id: number) => string
}

const monthOf = (idx: number) => {
  const { year, month } = fromMonthIdx(idx)
  return fmtMonth(year, month)
}

export function KpiRow({
  events,
  scopeId,
  kindFilter,
  basis,
  totalScoped,
  asOf,
  portfolioName,
}: Props) {
  // Both windows end with the last month that has a recorded payout, not with
  // today — months not imported yet are a gap, not €0 (N4/N5).
  const win = useMemo(
    () =>
      incomeWindow(events, {
        portfolioId: scopeId,
        kind: kindFilter,
        basis,
        now: asOf,
      }),
    [events, scopeId, kindFilter, basis, asOf]
  )
  const conc = useMemo(
    () => concentrationTop(events, 3, basis),
    [events, basis]
  )
  const sourceCount = useMemo(
    () => aggregateIncomeBySource(events, "all", basis).length,
    [events, basis]
  )
  const verdict = concentrationVerdict(conc.topPct, sourceCount)

  const delta = win.deltaAbs ?? 0
  const deltaSign = delta > 0 ? "+" : delta < 0 ? "-" : ""
  // A drop in income is worth noticing, not an error: warn, never critical.
  const deltaColor =
    win.deltaPct === null
      ? "var(--neutral-400)"
      : delta > 0
        ? "var(--good)"
        : delta < 0
          ? "var(--warn)"
          : "var(--neutral-400)"
  const deltaText =
    win.prior12 === null
      ? "No prior-year baseline yet"
      : `${deltaSign}${fmtEUR(Math.abs(delta))} vs the 12 months before`
  const windowText =
    win.anchor === null
      ? "Nothing recorded yet"
      : `12 months to ${monthOf(win.anchor)}`
  const lagText =
    win.lagging.length > 0
      ? `Like-for-like: ${win.lagging
          .map(
            (l) =>
              `${portfolioName(l.portfolioId)} through ${monthOf(l.through)}`
          )
          .join(", ")}`
      : null

  return (
    <div className="grid-4 grid" style={{ marginBottom: 16 }}>
      <div className="kpi accent" data-testid="kpi-inc-total">
        <div className="label">Total ({BASIS_LABEL[basis]})</div>
        <div className="value mono">{fmtEUR(totalScoped)}</div>
        <div className="delta" style={{ color: "var(--hero-fg-soft)" }}>
          Since inception
        </div>
      </div>
      <div className="kpi" data-testid="kpi-inc-last12">
        <div className="label">Last 12 months</div>
        <div className="value mono">{fmtEUR(win.last12)}</div>
        <div className="delta muted" data-testid="kpi-inc-last12-window">
          {windowText}
          {win.anchor !== null && win.monthsSinceAnchor > 0
            ? ` · nothing recorded for the ${win.monthsSinceAnchor} ${plural(win.monthsSinceAnchor, "month", "months")} since`
            : ""}
        </div>
      </div>
      <div className="kpi" data-testid="kpi-inc-yoy">
        <div className="label">Vs the year before</div>
        <div className="value mono">
          {win.deltaPct !== null ? fmtPct(win.deltaPct, 1, true) : "—"}
        </div>
        <div
          className={`delta ${win.deltaPct === null ? "muted" : delta > 0 ? "pos" : delta < 0 ? "neg" : "muted"}`}
          style={{ color: deltaColor }}
          aria-live="polite"
          data-testid="kpi-inc-yoy-delta"
        >
          {deltaText}
        </div>
        {lagText && (
          <div
            className="delta muted"
            data-testid="kpi-inc-yoy-partial"
            title="Months a portfolio hasn’t been imported for yet are left out of both years, so the comparison stays fair."
          >
            {lagText}
          </div>
        )}
      </div>
      <div className="kpi" data-testid="kpi-inc-concentration">
        <div className="label">Top 3 sources</div>
        <div className="value mono">
          {conc.leaders.length > 0 ? fmtPct(conc.topPct, 0) : "—"}
        </div>
        <ConcentrationBar leaders={conc.leaders} />
        <div
          className="delta"
          data-testid="kpi-inc-concentration-verdict"
          style={{
            color:
              verdict.level === "concentrated" || verdict.level === "few"
                ? "var(--warn)"
                : "var(--neutral-500)",
          }}
        >
          {conc.leaders.length > 0
            ? `of your income · ${verdict.text}`
            : "No payouts yet"}
        </div>
        {conc.leaders.length > 0 && (
          <div className="delta muted">
            Biggest: {conc.leaders[0].name} {fmtPct(conc.leaders[0].pct, 0)}
          </div>
        )}
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
