"use client"

import { useMemo } from "react"
import Link from "next/link"
import { useData, useGoalEvaluator } from "@/components/providers/data-provider"
import { CombinedDataNotice } from "@/components/combined-data-notice"
import { Sparkline } from "@/components/sparkline"
import { Stat } from "@/components/slider-row"
import { GoalProgressStrip } from "@/components/goal-progress-strip"
import { OverviewChart } from "@/components/charts/overview-chart"
import { ViewHeadline } from "@/components/view-headline"
import { MilestonesCard } from "@/components/milestones-card"
import {
  bestWorstMonth,
  lastValuedEntry,
  monthMoves,
  totalIncome,
  type LatestMonthChange,
} from "@/lib/calc"
import { monthOf } from "@/lib/catch-up"
import { overviewHeadline } from "@/lib/narrative"
import { fromMonthIdx, incomeWindow } from "@/lib/income-window"
import { fmtDate, fmtMonth } from "@/lib/dates"
import { fmtEUR, fmtNum, fmtPct, fmtPctCapped, plural } from "@/lib/format"
import { COMBINED_PORTFOLIO_ID } from "@/lib/types"
import { swatch } from "@/lib/palette"

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
    combinedCoverage,
    today,
  } = useData()
  const evaluator = useGoalEvaluator()
  const active = activePortfolio
  // Scope the saving figure to the active portfolio so the subtitle matches
  // the active-scoped KPIs beside it (issue #13 Bug 2). When the combined
  // portfolio is active, effectiveMonthlySaving sums across all portfolios.
  const monthlySaving = effectiveMonthlySaving(active.id)
  const kpi = useMemo(() => evaluator.kpis(active.id), [evaluator, active.id])
  const histReturn = useMemo(
    () => evaluator.historicalReturnWithSource(active.id),
    [evaluator, active.id]
  )
  // Passive income over the last 12 recorded months — dividends AND interest
  // (N7), from the same window the Income page's "Last 12 months" uses, so
  // the two screens can't disagree. Ends at the last recorded payout, not
  // today (N4).
  const income = useMemo(
    () =>
      incomeWindow(incomeEvents, {
        portfolioId: active.id,
        kind: "all",
        basis: settings.dividendBasis,
        now: new Date(today),
      }),
    [incomeEvents, active.id, settings.dividendBasis, today]
  )
  const incomeThrough =
    income.anchor === null
      ? null
      : (() => {
          const { year, month } = fromMonthIdx(income.anchor)
          return fmtMonth(year, month)
        })()
  const incomeReceived = totalIncome(
    incomeEvents,
    active.id,
    "all",
    settings.dividendBasis
  )
  const dividendYield = useMemo(
    () => evaluator.estimateYield({ scope: active.id }),
    [evaluator, active.id]
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
      for (let i = 0; i < active.entries.length; i++) {
        const e = active.entries[i]
        runningInvested += e.invested
        valSeries.push(e.value)
        if (e.value !== null) valSeriesNonNull.push(e.value)
        invSeries.push(runningInvested)
      }
      // Only rows exactly one month apart count as a "month" (N13).
      const { best, worst } = bestWorstMonth(active.entries)
      return {
        valSeries,
        valSeriesNonNull,
        invSeries,
        bestMonth: best,
        worstMonth: worst,
      }
    }, [active.entries, active.startingValue])

  // W8: each KPI gets a reference point — the latest month's move, from the
  // same gap-aware comparison as the Entries M/M Δ. In Combined, only months
  // every account reported count, so one account's update never reads as
  // the whole portfolio's month.
  const moves = useMemo(
    () =>
      monthMoves(
        active.entries,
        active.id === COMBINED_PORTFOLIO_ID ? combinedCoverage : undefined
      ),
    [active.entries, active.id, combinedCoverage]
  )
  const monthChange = moves.at(-1) ?? null

  // P7: the page's one sentence, from the same moves the KPI deltas use.
  const headline = useMemo(() => {
    const valued = active.entries.filter((e) => e.value !== null)
    return overviewHeadline({
      moves,
      valuedCount: valued.length,
      gain: kpi.gain,
      now: monthOf(today),
      newestReported:
        active.id === COMBINED_PORTFOLIO_ID ? (valued.at(-1) ?? null) : null,
    })
  }, [moves, active.entries, active.id, kpi.gain, today])

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
            {lastEntry ? fmtMonth(lastEntry.year, lastEntry.month) : "—"} ·{" "}
            {/* The plan is the sum of each account's own monthly
                contribution (set in Settings → Portfolios), so say which. */}
            {fmtEUR(monthlySaving, { decimals: 0 })}/month{" "}
            {active.id === COMBINED_PORTFOLIO_ID
              ? `across ${portfolios.length} ${plural(portfolios.length, "account", "accounts")}`
              : "into this account"}
          </div>
          <ViewHeadline text={headline} testId="overview-headline" />
        </div>
      </div>

      {/* KPI row */}
      <div className="grid-4 grid" style={{ marginBottom: 16 }}>
        <div className="kpi accent" data-testid="kpi-portfolio-value">
          <div className="label">Portfolio value</div>
          <div className="value mono">{fmtEUR(kpi.value)}</div>
          <MonthMove
            change={monthChange}
            amount={monthChange?.valueDelta ?? 0}
            what=""
            combined={active.id === COMBINED_PORTFOLIO_ID}
            testId="kpi-portfolio-value-mom"
          />
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
              color="var(--hero-fg)"
              width={96}
              height={28}
              filled={false}
            />
          </div>
        </div>
        <div className="kpi" data-testid="kpi-total-invested">
          <div className="label">Total invested</div>
          <div className="value mono">{fmtEUR(kpi.invested)}</div>
          <PlanLine
            change={monthChange}
            monthlyPlan={monthlySaving}
            testId="kpi-total-invested-plan"
          />
        </div>
        <div className="kpi" data-testid="kpi-net-gain">
          <div className="label">Net gain</div>
          <div className={`value mono ${signClass(kpi.gain)}`}>
            {fmtEUR(kpi.gain, { sign: true })}
          </div>
          <MonthMove
            change={monthChange}
            amount={monthChange?.marketDelta ?? 0}
            what="from the market"
            combined={active.id === COMBINED_PORTFOLIO_ID}
            testId="kpi-net-gain-mom"
          />
          {kpi.cagr === null ? (
            <div className="delta muted" data-testid="kpi-net-gain-cagr">
              CAGR · not enough history yet
            </div>
          ) : (
            <div
              className={`delta ${signClass(kpi.cagr)}`}
              data-testid="kpi-net-gain-cagr"
            >
              {kpi.cagr !== 0 && (
                <span className="arrow" aria-hidden="true">
                  {signArrow(kpi.cagr)}
                </span>
              )}
              {fmtPctCapped(kpi.cagr, 2)} CAGR
            </div>
          )}
        </div>
        <div className="kpi" data-testid="kpi-dividends">
          <div className="label">Passive income (12 mo)</div>
          <div className="value mono">{fmtEUR(income.last12)}</div>
          {income.deltaPct !== null && (
            <div
              className={`kpi-mom ${signClass(income.deltaPct)}`}
              data-testid="kpi-dividends-yoy"
              title="Like-for-like: the 12 months before, for the same accounts"
            >
              {income.deltaPct !== 0 && (
                <span className="kpi-mom-arrow" aria-hidden="true">
                  {signArrow(income.deltaPct)}
                </span>
              )}
              {fmtPct(income.deltaPct, 1, true)} vs the 12 months before
            </div>
          )}
          <div className="delta muted" data-testid="kpi-dividends-sub">
            {fmtEUR(income.last12ByKind.dividend, { decimals: 0 })} dividends +{" "}
            {fmtEUR(income.last12ByKind.interest, { decimals: 0 })} interest
            {incomeThrough ? ` · to ${incomeThrough}` : ""}
          </div>
          {/* C1: no "(derived)" — the yield says what it divides. One
              child, so .delta's flex layout doesn't split it in columns. */}
          <div className="delta muted" data-testid="kpi-dividends-yield">
            <span>
              {dividendYield.source === "derived"
                ? `${fmtPct(dividendYield.value, 2)} yield — a year’s dividends ÷ today’s value`
                : "No dividends in the last 12 months yet"}{" "}
              · {fmtEUR(incomeReceived, { decimals: 0 })} since you started
            </span>
          </div>
        </div>
      </div>

      {/* T1: a nudge, not a telling-off — so it sits under the numbers it
          qualifies instead of leading the page. */}
      {active.id === COMBINED_PORTFOLIO_ID ? (
        <CombinedDataNotice stale={combinedStale} />
      ) : null}

      <div className="overview-grid">
        <div className="overview-main">
          <div className="card card-pad overview-chart-card">
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
                  {active.entries.length}&nbsp;monthly{" "}
                  {plural(active.entries.length, "entry", "entries")} ·{" "}
                  {fmtNum(active.entries.length / 12, 1)}&nbsp;years
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
                  Total invested
                </div>
              </div>
            </div>
            {valSeriesNonNull.length === 0 ? (
              // First run: nothing to chart or compare yet — say what to do.
              <div className="empty-state" data-testid="overview-empty">
                <div className="empty-title">
                  Nothing logged for {active.name} yet
                </div>
                <div className="empty-sub">
                  Add what it’s worth this month — or import your history — and
                  this page starts telling you how it’s going.
                </div>
                <Link
                  href="/entries?new=entry"
                  className="btn btn-primary btn-sm"
                  data-testid="overview-empty-cta"
                >
                  Log a month
                </Link>
              </div>
            ) : (
              <>
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
                    value={fmtPct(histReturn.value, 2)}
                    sub={
                      histReturn.source === "assumed"
                        ? "Assumed (no return history)"
                        : "Derived from monthly data"
                    }
                  />
                  <Stat
                    label="Best month"
                    value={fmtEUR(bestMonth, { sign: true })}
                    valueClassName={signClass(bestMonth)}
                    sub="Single month, net of what you added"
                  />
                  <Stat
                    label="Worst month"
                    value={fmtEUR(worstMonth, { sign: true })}
                    valueClassName={signClass(worstMonth)}
                    sub="Single month, net of what you added"
                  />
                </div>
              </>
            )}
          </div>

          {/* Sits under the chart on wide screens (see .overview-grid) so the
            left column is as tall as the side column instead of a card with
            a blank bottom half; on narrow screens it simply comes last. */}
          <div
            className="card card-pad overview-activity"
            data-testid="recent-activity"
          >
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
                  <div style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}>
                    {fmtDate(e.year, e.month, e.day)}
                  </div>
                  <div className="muted small">
                    {e.note || "Monthly update"}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div
                    className="mono"
                    style={{ fontWeight: 600, fontSize: "var(--fs-sm)" }}
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

        <div
          className="overview-side"
          style={{ display: "flex", flexDirection: "column", gap: 16 }}
        >
          <MilestonesCard />
          <GoalProgressStrip
            goals={goals}
            goalEvals={goalEvals}
            portfolios={portfolios}
            emptyState={
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
                  href="/goals?new=goal"
                  className="btn btn-secondary btn-sm"
                  data-testid="goal-progress-empty-cta"
                >
                  Set a goal
                </Link>
              </div>
            }
          />

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
                          fontSize: "var(--fs-sm)",
                          fontWeight: 500,
                        }}
                      >
                        <span
                          aria-hidden="true"
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 2,
                            background: swatch(p.color),
                            display: "inline-block",
                          }}
                        />
                        {p.name}
                      </div>
                      <div className="mono small">
                        <strong>{fmtEUR(val)}</strong>{" "}
                        <span className="muted">· {fmtPct(pct * 100, 0)}</span>
                      </div>
                    </div>
                    <div className="pbar">
                      <div
                        style={{
                          width: `${pct * 100}%`,
                          background: swatch(p.color),
                        }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** "in Apr ’26" for a true month, "over 3 months to Apr ’26" across a gap. */
function monthSpan(c: LatestMonthChange): string {
  const m = fmtMonth(c.year, c.month)
  return c.gapMonths > 1 ? `over ${c.gapMonths} months to ${m}` : `in ${m}`
}

/**
 * W8: the latest month's move under a KPI — "↑ +€3.590 in Apr ’26". Nothing
 * when there are not yet two months to compare.
 */
function MonthMove({
  change,
  amount,
  what,
  combined = false,
  testId,
}: {
  change: LatestMonthChange | null
  amount: number
  what: string
  /** Combined: say why the month may be older than the latest update. */
  combined?: boolean
  testId: string
}) {
  if (!change) return null
  const m = fmtMonth(change.year, change.month)
  return (
    <div
      className={`kpi-mom ${signClass(amount)}`}
      data-testid={testId}
      title={
        [
          change.gapMonths > 1
            ? `No value was recorded in between, so this covers ${change.gapMonths} months.`
            : null,
          combined
            ? `${m} is the latest month every account has a value for.`
            : null,
        ]
          .filter(Boolean)
          .join(" ") || undefined
      }
    >
      {amount !== 0 && (
        <span className="kpi-mom-arrow" aria-hidden="true">
          {signArrow(amount)}
        </span>
      )}
      {fmtEUR(amount, { sign: true, decimals: 0 })}
      {what ? ` ${what}` : ""} {monthSpan(change)}
    </div>
  )
}

/**
 * W8: what went in during the latest month against the monthly plan (the
 * accounts' own contributions). Under plan is information, not a warning.
 */
function PlanLine({
  change,
  monthlyPlan,
  testId,
}: {
  change: LatestMonthChange | null
  monthlyPlan: number
  testId: string
}) {
  if (!change) {
    return <div className="delta muted">Everything you’ve put in so far</div>
  }
  const plan = monthlyPlan * change.gapMonths
  const short = plan - change.added
  const verdict =
    plan <= 0
      ? null
      : short <= 0.5
        ? { text: "on plan", cls: "pos" }
        : { text: `${fmtEUR(short, { decimals: 0 })} under plan`, cls: "muted" }
  return (
    <div className="kpi-mom muted" data-testid={testId}>
      {fmtEUR(change.added, { sign: true, decimals: 0 })} added{" "}
      {monthSpan(change)}
      {verdict && (
        <>
          {" · "}
          <span className={verdict.cls}>{verdict.text}</span>
        </>
      )}
    </div>
  )
}
