"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useData, useGoalEvaluator } from "@/components/providers/data-provider"
import { CombinedDataNotice } from "@/components/combined-data-notice"
import { Sparkline } from "@/components/sparkline"
import { ProgressRing } from "@/components/progress-ring"
import { Stat } from "@/components/slider-row"
import { OverviewChart } from "@/components/charts/overview-chart"
import { lastValuedEntry, totalIncome } from "@/lib/calc"
import { formatEntryDate } from "@/lib/dates"
import { fmtEUR, fmtPct } from "@/lib/format"
import { COMBINED_PORTFOLIO_ID, labelFor, type GoalDTO } from "@/lib/types"

function signClass(n: number): "pos" | "neg" | "muted" {
  if (n > 0) return "pos"
  if (n < 0) return "neg"
  return "muted"
}

// Glyph that conveys gain/loss direction independently of color, so the
// indicator survives on the blue accent KPI (where the green/red text fails
// WCAG contrast) and remains parseable for red/green color-blind users.
// Returns an empty string for exactly-zero deltas so callers can omit the
// glyph slot entirely instead of rendering an em-dash that announces nothing.
function signArrow(n: number): "↑" | "↓" | "" {
  if (n > 0) return "↑"
  if (n < 0) return "↓"
  return ""
}

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

export function OverviewView() {
  const {
    portfolios,
    goals,
    incomeEvents,
    activePortfolio,
    goalEvals,
    effectiveMonthlySaving,
    settings,
    combinedStale,
  } = useData()
  const evaluator = useGoalEvaluator()
  const active = activePortfolio
  // Scope the saving figure to the active portfolio so the subtitle matches
  // the active-scoped KPIs beside it (issue #13 Bug 2). When the combined
  // portfolio is active, effectiveMonthlySaving sums across all portfolios.
  const monthlySaving = effectiveMonthlySaving(active.id)
  const kpi = useMemo(() => evaluator.kpis(active.id), [evaluator, active.id])
  const histReturn = useMemo(
    () => evaluator.historicalReturn(active.id),
    [evaluator, active.id]
  )
  const dividendsReceived = totalIncome(
    incomeEvents,
    active.id,
    "dividend",
    settings.dividendBasis
  )

  // Build value + cumulative invested series, best/worst MoM delta in a single
  // pass to avoid the O(n²) repetition and the spread-into-`Math.max(...)` call.
  const { valSeries, valSeriesNonNull, invSeries, bestMonth, worstMonth } =
    useMemo(() => {
      // valSeries carries null for months without a recorded portfolio value.
      // We keep both series the same length (aligned by month index) so the
      // mini-chart can break the value path while the invested line stays
      // continuous — that honestly shows "deposits kept coming in, value
      // wasn't recorded" instead of implying a flat portfolio.
      const valSeries: (number | null)[] = []
      const valSeriesNonNull: number[] = []
      const invSeries: number[] = []
      let runningInvested = active.startingValue
      let best = 0
      let worst = 0
      for (let i = 0; i < active.entries.length; i++) {
        const e = active.entries[i]
        runningInvested += e.invested
        valSeries.push(e.value)
        if (e.value !== null) valSeriesNonNull.push(e.value)
        invSeries.push(runningInvested)
        if (i > 0) {
          const prev = active.entries[i - 1]
          if (e.value !== null && prev.value !== null) {
            const delta = e.value - prev.value - e.invested
            if (delta > best) best = delta
            if (delta < worst) worst = delta
          }
        }
      }
      return {
        valSeries,
        valSeriesNonNull,
        invSeries,
        bestMonth: best,
        worstMonth: worst,
      }
    }, [active.entries, active.startingValue])

  // Hoisted out of the portfolio-split .map() below so it's computed once per
  // render instead of once per portfolio (was O(n²)). Uses the last *valued*
  // entry — `entries.at(-1)` falls through to 0 for any portfolio whose most
  // recent row is a future-month deposit with no recorded value, which made
  // the split show €0,00 next to a fully populated headline KPI.
  const portfolioTotal = useMemo(
    () =>
      portfolios.reduce(
        (s, x) => s + (lastValuedEntry(x.entries)?.value ?? 0),
        0
      ),
    [portfolios]
  )

  const lastEntry = active.entries.at(-1) ?? null
  // Recent activity skips future-month rows with no recorded value so the
  // list shows actionable history, not a placeholder em-dash next to a
  // deposit amount.
  const recentValuedEntries = useMemo(
    () =>
      active.entries
        .filter((e) => e.value !== null)
        .slice(-4)
        .reverse(),
    [active.entries]
  )
  const showSplit = portfolios.length > 1

  return (
    <div className="view">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 16,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="title">Overview</h1>
          <div
            className="muted small"
            style={{ marginTop: 4 }}
            data-testid="overview-subtitle"
          >
            {/* Subtitle stays at month granularity because portfolio data is
                monthly — rendering a day-of-month next to a monthly KPI was
                more precision than the underlying data supports. */}
            Updated{" "}
            {lastEntry
              ? labelFor(lastEntry.year, lastEntry.month, { fullYear: true })
              : "—"}{" "}
            · {fmtEUR(monthlySaving, { decimals: 0 })}/month saving plan
          </div>
        </div>
      </div>

      {active.id === COMBINED_PORTFOLIO_ID ? (
        <CombinedDataNotice stale={combinedStale} />
      ) : null}

      {/* KPI row */}
      <div className="grid-4 grid" style={{ marginBottom: 16 }}>
        <div className="kpi accent" data-testid="kpi-portfolio-value">
          <div className="label">Portfolio value</div>
          <div className="value mono">{fmtEUR(kpi.value)}</div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
            }}
          >
            <div
              className={`delta ${signClass(kpi.gainPct)}`}
              data-testid="kpi-portfolio-value-delta"
            >
              {kpi.gainPct !== 0 && (
                <span className="arrow" aria-hidden="true">
                  {signArrow(kpi.gainPct)}
                </span>
              )}
              {fmtPct(kpi.gainPct, 1, true)} vs invested
            </div>
            <Sparkline
              data={valSeriesNonNull}
              color="#fff"
              width={96}
              height={28}
              filled={false}
            />
          </div>
        </div>
        <div className="kpi" data-testid="kpi-total-invested">
          <div className="label">Total invested</div>
          <div className="value mono">{fmtEUR(kpi.invested)}</div>
          <div className="delta muted">Cumulative contributions</div>
        </div>
        <div className="kpi" data-testid="kpi-net-gain">
          <div className="label">Net gain</div>
          <div className={`value mono ${signClass(kpi.gain)}`}>
            {fmtEUR(kpi.gain, { sign: true })}
          </div>
          <div className={`delta ${signClass(kpi.cagr)}`}>
            {kpi.cagr !== 0 && (
              <span className="arrow" aria-hidden="true">
                {signArrow(kpi.cagr)}
              </span>
            )}
            {fmtPct(kpi.cagr, 2)} CAGR
          </div>
        </div>
        <div className="kpi" data-testid="kpi-dividends">
          <div className="label">Dividends received</div>
          <div className="value mono">{fmtEUR(dividendsReceived)}</div>
          <div className="delta muted">
            Cash dividends ·{" "}
            {active.id === COMBINED_PORTFOLIO_ID
              ? "all portfolios"
              : "this portfolio"}{" "}
            · since inception
          </div>
        </div>
      </div>

      <div className="overview-grid">
        <div className="card card-pad">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
              gap: 12,
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 className="card-title">Value vs invested</h2>
              <div className="muted small" style={{ marginTop: 2 }}>
                {active.entries.length}&nbsp;monthly entries ·{" "}
                {(active.entries.length / 12).toFixed(1)}&nbsp;years
              </div>
            </div>
            <div className="legend">
              <div className="it">
                <span
                  aria-hidden="true"
                  className="sw line"
                  style={{ background: "var(--primary)" }}
                />
                Value
              </div>
              <div className="it">
                <span
                  aria-hidden="true"
                  className="sw dash"
                  style={{ color: "var(--secondary-400)" }}
                />
                Invested
              </div>
            </div>
          </div>
          <div data-testid="overview-mini-chart">
            <OverviewChart
              entries={active.entries}
              values={valSeries}
              invested={invSeries}
            />
          </div>

          <div className="hr" />

          <div className="grid-3 grid" data-testid="derived-stats">
            <Stat
              label="Historical return (annualized)"
              value={fmtPct(histReturn, 2)}
              sub="Derived from monthly data"
            />
            <Stat
              label="Best month"
              value={fmtEUR(bestMonth, { sign: true })}
              valueClassName={signClass(bestMonth)}
              sub="Value gain net of contributions"
            />
            <Stat
              label="Worst month"
              value={fmtEUR(worstMonth, { sign: true })}
              valueClassName={signClass(worstMonth)}
              sub="Drawdown episode"
            />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card card-pad" data-testid="goal-progress-section">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <h2 className="card-title">Goal progress</h2>
              <span
                className={`chip ${goals.length > 0 ? "primary" : ""}`}
                data-testid="goal-progress-chip"
              >
                {goals.length}&nbsp;active
              </span>
            </div>
            {goals.length === 0 ? (
              <div className="empty-state" data-testid="goal-progress-empty">
                <div className="empty-title">No goals yet</div>
                <div className="empty-sub">
                  Track a savings target or income goal to see progress here.
                </div>
                {/* Link to /planning carries a `?new=goal` flag the planning
                    view picks up and opens its goal editor — firing
                    requestNew('goal') from here would do nothing because no
                    subscriber exists on this page. Using a real Link keeps
                    cmd/middle-click and deep-linking working too. */}
                <Link
                  href="/planning?new=goal"
                  className="btn btn-secondary btn-sm"
                  data-testid="goal-progress-empty-cta"
                >
                  Set a goal
                </Link>
              </div>
            ) : null}
            {goals.map((g) => {
              const ev = goalEvals[g.id]
              const pct = Math.min(1, Math.max(0, ev?.pct ?? 0))
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
                      <div style={{ fontWeight: 600, fontSize: 14 }}>
                        {g.name}
                      </div>
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
                  </div>
                </div>
              )
            })}
          </div>

          {showSplit ? (
            <div className="card card-pad" data-testid="portfolio-split">
              <h2 className="card-title" style={{ marginBottom: 12 }}>
                Portfolio split
              </h2>
              {portfolios.map((p) => {
                const val = lastValuedEntry(p.entries)?.value ?? 0
                const pct = portfolioTotal ? val / portfolioTotal : 0
                return (
                  <div key={p.id} style={{ marginBottom: 12 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        marginBottom: 6,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 13,
                          fontWeight: 500,
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: p.color,
                            display: "inline-block",
                          }}
                        />
                        {p.name}
                      </div>
                      <div className="mono small">
                        <strong>{fmtEUR(val)}</strong>{" "}
                        <span className="muted">
                          · {(pct * 100).toFixed(0)}%
                        </span>
                      </div>
                    </div>
                    <div className="pbar">
                      <div
                        style={{
                          width: `${pct * 100}%`,
                          background: p.color,
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}

          <div className="card card-pad" data-testid="recent-activity">
            <h2 className="card-title" style={{ marginBottom: 10 }}>
              Recent activity
            </h2>
            {recentValuedEntries.length === 0 ? (
              <div className="empty-state" data-testid="recent-activity-empty">
                <div className="empty-title">No recorded entries yet</div>
                <div className="empty-sub">
                  Log a portfolio value to populate this list.
                </div>
              </div>
            ) : null}
            {recentValuedEntries.map((e, i) => (
              <div
                key={`${e.year}-${e.month}`}
                data-testid="activity-row"
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "10px 0",
                  borderTop: i === 0 ? "none" : "1px solid var(--border)",
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {formatEntryDate(e.year, e.month, e.day)}
                  </div>
                  <div className="muted small">
                    {e.note || "Monthly update"}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    className="mono"
                    style={{ fontWeight: 600, fontSize: 13 }}
                  >
                    {fmtEUR(e.value)}
                  </div>
                  <div className="muted small mono">
                    {fmtEUR(e.invested, { sign: true })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
