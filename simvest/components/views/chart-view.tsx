"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import {
  useData,
  useDataActions,
  useGoalEvaluator,
} from "@/components/providers/data-provider"
import { GrowthChart } from "@/components/growth-chart"
import { CombinedDataNotice } from "@/components/combined-data-notice"
import { MonthlySavingControl, SliderRow, Stat } from "@/components/slider-row"
import { SegControl } from "@/components/ui/seg-control"
import { fmtEUR, fmtNum, fmtPct } from "@/lib/format"
import {
  incomeByMonth,
  projectFuture,
  latestKnownValue,
  returnMilestones,
} from "@/lib/calc"
import type { GoalEvaluation, ProjectionPoint } from "@/lib/calc"
import {
  COMBINED_PORTFOLIO_ID,
  type GoalDTO,
  type SettingsDTO,
} from "@/lib/types"
import { swatch } from "@/lib/palette"
import { fmtMonth, fmtYearShort } from "@/lib/dates"

const NO_PROJECTION = {
  base: [] as ProjectionPoint[],
  conservative: [] as ProjectionPoint[],
  optimistic: [] as ProjectionPoint[],
}

export function ChartView() {
  const {
    selectedPortfolio,
    activePortfolio,
    goals,
    goalEvals,
    settings,
    effectiveMonthlySaving,
    incomeEvents,
    combinedCoverage,
    combinedStale,
  } = useData()
  const { updateSettings, updatePortfolio } = useDataActions()
  const [showDividends, setShowDividends] = useState(true)
  // GrowthChart already deflates future points by settings.inflation when this
  // is on; default off so the chart shows nominal money unless asked.
  const [inflationAdjusted, setInflationAdjusted] = useState(false)
  // L8: a 20-year plan runs the y-axis into the millions and flattens the
  // real record into the bottom few pixels. "Your history" drops the
  // projection so the axis fits what actually happened.
  const [range, setRange] = useState<"plan" | "history">("plan")

  const evaluator = useGoalEvaluator()
  const active = activePortfolio
  const last = active.entries.at(-1)
  const isCombined = selectedPortfolio === COMBINED_PORTFOLIO_ID
  const savedMonthlySaving = effectiveMonthlySaving(selectedPortfolio)

  // The assumption sliders are a *preview* (W9): dragging them changes this
  // page only. Nothing reaches Settings or the portfolio until "Apply to my
  // plan" — the same try-then-commit model as the Planning Scratchpad. The
  // preview is keyed to the portfolio so switching accounts drops it.
  const saved: Assumptions = {
    horizonYears: settings.horizonYears,
    conservativeReturn: settings.conservativeReturn,
    optimisticReturn: settings.optimisticReturn,
    monthlySaving: savedMonthlySaving,
  }
  const [preview, setPreview] = useState<{
    portfolioId: number
    values: Partial<Assumptions>
  } | null>(null)
  const [justApplied, setJustApplied] = useState(false)
  const overrides =
    preview && preview.portfolioId === selectedPortfolio ? preview.values : {}
  const plan: Assumptions = { ...saved, ...overrides }
  const changed = (Object.keys(plan) as (keyof Assumptions)[]).filter(
    (k) => plan[k] !== saved[k]
  )
  const dirty = changed.length > 0
  const setAssumption = (patch: Partial<Assumptions>) => {
    setJustApplied(false)
    setPreview({
      portfolioId: selectedPortfolio,
      values: { ...overrides, ...patch },
    })
  }
  const resetPreview = () => {
    setPreview(null)
    setJustApplied(false)
  }
  const applyPreview = () => {
    const settingsPatch: Partial<Assumptions> = {}
    for (const k of changed) {
      if (k !== "monthlySaving") settingsPatch[k] = plan[k]
    }
    if (Object.keys(settingsPatch).length > 0) updateSettings(settingsPatch)
    if (changed.includes("monthlySaving") && !isCombined) {
      updatePortfolio(selectedPortfolio, {
        targetMonthlyContribution: plan.monthlySaving,
      })
    }
    setPreview(null)
    setJustApplied(true)
  }
  const monthlySaving = plan.monthlySaving
  const histReturn = useMemo(
    () => evaluator.historicalReturnWithSource(active.id),
    [evaluator, active.id]
  )
  const dividendIndex = useMemo(
    () =>
      incomeByMonth(
        incomeEvents,
        active.id,
        "dividend",
        settings.dividendBasis
      ),
    [incomeEvents, active.id, settings.dividendBasis]
  )

  // Filter goals to those that belong on this chart's scope. Their target
  // values come from the provider's shared evaluation pass.
  const scopedGoals = useMemo(
    () =>
      goals.filter((g) =>
        isCombined
          ? g.scope === "combined"
          : g.scope === "portfolio" && g.portfolioId === selectedPortfolio
      ),
    [goals, isCombined, selectedPortfolio]
  )
  const goalLines = useMemo(
    () =>
      scopedGoals.map((g) => ({
        id: g.id,
        name: g.name,
        color: swatch(g.color),
        value: goalEvals[g.id]?.portfolioTargetValue ?? 0,
      })),
    [scopedGoals, goalEvals]
  )

  // Projection start uses the latest known portfolio value. If the user
  // hasn't entered any value yet, fall back to the portfolio's starting
  // value so we still have a number to compound from.
  const startValue =
    latestKnownValue(active.entries) ?? active.startingValue ?? 0
  const projection = useMemo(() => {
    if (!last) {
      const empty: ProjectionPoint[] = []
      return { base: empty, conservative: empty, optimistic: empty }
    }
    return {
      base: projectFuture({
        startValue,
        monthlySaving,
        years: plan.horizonYears,
        annualReturn: histReturn.value,
      }),
      conservative: projectFuture({
        startValue,
        monthlySaving,
        years: plan.horizonYears,
        annualReturn: plan.conservativeReturn,
      }),
      optimistic: projectFuture({
        startValue,
        monthlySaving,
        years: plan.horizonYears,
        annualReturn: plan.optimisticReturn,
      }),
    }
  }, [
    last,
    startValue,
    monthlySaving,
    plan.horizonYears,
    plan.conservativeReturn,
    plan.optimisticReturn,
    histReturn.value,
  ])

  if (!last) {
    return (
      <div className="view">
        <h1 className="title">Projection</h1>
        <div className="card card-pad" style={{ marginTop: 16 }}>
          <div className="empty-state" data-testid="projection-empty">
            <div className="empty-title">Nothing to project from yet</div>
            <div className="empty-sub">
              Log what {active.name} is worth this month and the projection
              starts from there — or switch accounts from the header.
            </div>
            <Link
              href="/entries?new=entry"
              className="btn btn-primary btn-sm"
              data-testid="projection-empty-cta"
            >
              Log a month
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const endBase = projection.base.at(-1)?.value ?? 0
  // L8: how much of the y-axis the real record gets next to the projection.
  const historyPeak = Math.max(0, ...active.entries.map((e) => e.value ?? 0))
  const planPeak = Math.max(
    historyPeak,
    ...projection.optimistic.map((p) => p.value),
    ...projection.base.map((p) => p.value)
  )
  const historySqueezed = planPeak > 0 && historyPeak / planPeak < 0.25

  const endCons = projection.conservative.at(-1)?.value ?? 0
  const endOpt = projection.optimistic.at(-1)?.value ?? 0

  // "Your track record" is uncapped — it can beat the optimistic case or fall
  // below the conservative one (N1). So the cards are ordered by rate, not
  // by a fixed worst / typical / best slot, and the record says what it is.
  const recordYears = recordSpanYears(active.entries)
  const recordBadge =
    histReturn.source === "assumed"
      ? "Assumed 7% — not enough history yet"
      : `If your last ${recordYears} repeat exactly`
  const recordVsRange =
    histReturn.source === "assumed"
      ? null
      : histReturn.value > plan.optimisticReturn
        ? `Above your optimistic case (${fmtPct(plan.optimisticReturn, 1)})`
        : histReturn.value < plan.conservativeReturn
          ? `Below your conservative case (${fmtPct(plan.conservativeReturn, 1)})`
          : null
  const scenarios = [
    {
      key: "conservative",
      label: "Conservative",
      pct: plan.conservativeReturn,
      end: endCons,
      endInvested: projection.conservative.at(-1)?.invested ?? 0,
      color: "var(--secondary-400)",
    },
    {
      key: "base",
      label: "Your track record",
      pct: histReturn.value,
      end: endBase,
      endInvested: projection.base.at(-1)?.invested ?? 0,
      color: "var(--primary)",
      badge: recordBadge,
      note: recordVsRange,
    },
    {
      key: "optimistic",
      label: "Optimistic",
      pct: plan.optimisticReturn,
      end: endOpt,
      endInvested: projection.optimistic.at(-1)?.invested ?? 0,
      color: "var(--tertiary)",
    },
  ].sort((a, b) => a.pct - b.pct)

  return (
    <div className="view">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: 16,
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="title">Projection</h1>
          <div className="muted small" style={{ marginTop: 4 }}>
            Your portfolio&apos;s trajectory — grounded in real data.
          </div>
        </div>
      </div>

      {isCombined ? <CombinedDataNotice stale={combinedStale} /> : null}

      <div className="card" style={{ padding: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <SegControl<"plan" | "history">
              ariaLabel="What the chart shows"
              testId="chart-range"
              options={[
                { value: "plan", label: "With projection" },
                { value: "history", label: "Your history" },
              ]}
              value={range}
              onChange={setRange}
            />
            <label
              className="check-label"
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                fontSize: "var(--fs-xs)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                checked={showDividends}
                onChange={(e) => setShowDividends(e.target.checked)}
                data-testid="chart-show-dividends"
              />
              <span>Show dividends</span>
            </label>
            <label
              className="check-label"
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                fontSize: "var(--fs-xs)",
                cursor: "pointer",
              }}
            >
              <input
                type="checkbox"
                disabled={range === "history"}
                title={
                  range === "history"
                    ? "Only changes the projection — the history is what you actually had"
                    : undefined
                }
                checked={inflationAdjusted}
                onChange={(e) => setInflationAdjusted(e.target.checked)}
                data-testid="chart-inflation-adjusted"
              />
              <span>Inflation-adjusted (real)</span>
            </label>
          </div>
          <div className="legend" data-testid="chart-legend">
            <div className="it">
              <span
                className="sw line"
                style={{ background: "var(--primary)" }}
              />
              Value (historical)
            </div>
            {range === "plan" && (
              <>
                <div className="it">
                  <span
                    className="sw line"
                    style={{ background: "var(--primary)", opacity: 0.4 }}
                  />
                  Your track record
                </div>
                <div className="it">
                  <span
                    className="sw line"
                    style={{ background: "var(--tertiary)" }}
                  />
                  Optimistic
                </div>
                <div className="it">
                  <span
                    className="sw line"
                    style={{ background: "var(--secondary-400)" }}
                  />
                  Conservative
                </div>
              </>
            )}
            <div className="it">
              <span
                className="sw line"
                style={{
                  background: "var(--secondary-400)",
                  borderTop: "2px dashed var(--secondary-400)",
                  height: 0,
                }}
              />
              Total invested
            </div>
          </div>
        </div>

        <GrowthChart
          entries={active.entries}
          projection={range === "history" ? NO_PROJECTION : projection}
          monthlySaving={monthlySaving}
          inflation={settings.inflation}
          options={{ showDividends, inflationAdjusted }}
          goalLines={goalLines}
          height={440}
          dividendsByMonth={dividendIndex}
          coverage={isCombined ? combinedCoverage : undefined}
        />
        <div
          className="muted small"
          style={{ marginTop: 6 }}
          data-testid="chart-range-note"
        >
          {range === "history" ? (
            <>
              Just what actually happened —{" "}
              {fmtMonth(active.entries[0].year, active.entries[0].month)} to{" "}
              {fmtMonth(last.year, last.month)}, scaled to fit.
            </>
          ) : historySqueezed ? (
            <>
              The plan runs to {fmtEUR(planPeak, { compact: true })}, so your
              real record sits low on this scale.{" "}
              <button
                type="button"
                className="link-button"
                onClick={() => setRange("history")}
                data-testid="chart-range-zoom"
              >
                See your history up close
              </button>
            </>
          ) : null}
        </div>

        <div className="hr" />

        <div className="grid-4 grid" data-testid="chart-stats-grid">
          <div data-testid="stat-horizon">
            <Stat
              label="Horizon"
              value={`${plan.horizonYears} years`}
              sub={`to ${fmtYearShort(new Date().getFullYear() + plan.horizonYears)}`}
            />
          </div>
          {[...scenarios].reverse().map((sc) => (
            <div key={sc.key} data-testid={`stat-${sc.key}`}>
              <Stat
                label={`${sc.label} @ ${fmtPct(sc.pct, 1)}`}
                value={fmtEUR(sc.end, { compact: true })}
                sub={
                  fmtPct((sc.end / startValue - 1) * 100, 0, true) + " vs today"
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div className="grid-3 grid" style={{ marginTop: 16 }}>
        {scenarios.map((sc) => (
          <ScenarioCard
            key={sc.key}
            label={sc.label}
            pct={sc.pct}
            endValue={sc.end}
            endInvested={sc.endInvested}
            startValue={startValue}
            color={sc.color}
            accent={sc.key === "base"}
            badge={sc.badge}
            note={sc.note ?? undefined}
            testId={`scenario-card-${sc.key}`}
          />
        ))}
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: "var(--fs-md)", marginBottom: 10 }}>
          Contribution vs return
        </h3>
        <ContribBreakdown projection={projection.base} />
      </div>

      <div className="grid-2 grid" style={{ marginTop: 16 }}>
        <div className="card card-pad" data-testid="scenario-assumptions">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 6,
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <h3 style={{ fontSize: "var(--fs-lg)" }}>Try other assumptions</h3>
            <span
              className={`chip ${dirty ? "warn" : ""}`}
              data-testid="assumptions-status"
              data-dirty={dirty ? "true" : "false"}
            >
              {dirty
                ? "Preview — not saved"
                : justApplied
                  ? "Saved to your plan"
                  : "Matches your plan"}
            </span>
          </div>
          <div className="muted small" style={{ marginBottom: 10 }}>
            Drag freely — only this chart changes until you apply.
          </div>
          <SliderRow
            label="Horizon"
            value={plan.horizonYears}
            min={1}
            max={40}
            step={1}
            unit="years"
            onChange={(v) => setAssumption({ horizonYears: v })}
            testId="chart-slider-horizon"
          />
          <MonthlySavingControl
            isCombined={isCombined}
            value={monthlySaving}
            onChange={(v) => !isCombined && setAssumption({ monthlySaving: v })}
            testId="chart-slider-saving"
          />
          <SliderRow
            label="Conservative return"
            value={plan.conservativeReturn}
            min={0}
            max={8}
            step={0.1}
            unit="percent"
            onChange={(v) => setAssumption({ conservativeReturn: v })}
            testId="chart-slider-conservative"
          />
          <SliderRow
            label="Optimistic return"
            value={plan.optimisticReturn}
            min={5}
            max={15}
            step={0.1}
            unit="percent"
            onChange={(v) => setAssumption({ optimisticReturn: v })}
            testId="chart-slider-optimistic"
          />
          <div
            style={{
              display: "flex",
              gap: 8,
              marginTop: 12,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={!dirty}
              onClick={applyPreview}
              data-testid="assumptions-apply"
            >
              Apply to my plan
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={!dirty}
              onClick={resetPreview}
              data-testid="assumptions-reset"
            >
              Reset
            </button>
          </div>
          <div
            className="muted small"
            style={{ marginTop: 8, fontSize: "var(--fs-2xs)" }}
            data-testid="assumptions-apply-hint"
          >
            {dirty
              ? `Apply saves ${describeChanges(changed, active.name)} — Settings and Goals use them too.`
              : justApplied
                ? "Done — Settings and Goals now use these numbers."
                : "These are your saved plan settings."}
          </div>
        </div>

        <div className="card card-pad" data-testid="milestones-card">
          <h3 style={{ fontSize: "var(--fs-lg)", marginBottom: 14 }}>
            Milestones
          </h3>
          <Milestones
            projection={projection}
            startValue={startValue}
            monthlySaving={monthlySaving}
            goals={scopedGoals}
            goalEvals={goalEvals}
            histReturn={histReturn.value}
            horizonYears={plan.horizonYears}
          />
        </div>
      </div>
    </div>
  )
}

function formatGoalSubLabel(g: GoalDTO, ev: GoalEvaluation): string {
  const tgt = fmtEUR(ev.portfolioTargetValue, { compact: true })
  switch (g.kind) {
    case "portfolio_value":
      return `Reach ${fmtEUR(g.target, { compact: true })}`
    case "annual_income":
      return `${fmtEUR(g.target)}/yr · portfolio target ${tgt}`
    case "dividend_annual":
      return `${fmtEUR(g.target)}/yr dividends · portfolio target ${tgt}`
    case "dividend_monthly":
      return `${fmtEUR(g.target)}/mo dividends · portfolio target ${tgt}`
  }
}

function Milestones({
  projection,
  startValue,
  monthlySaving,
  goals,
  goalEvals,
  histReturn,
  horizonYears,
}: {
  projection: {
    base: ProjectionPoint[]
    conservative: ProjectionPoint[]
    optimistic: ProjectionPoint[]
  }
  startValue: number
  monthlySaving: number
  goals: GoalDTO[]
  goalEvals: Record<number, GoalEvaluation>
  histReturn: number
  horizonYears: number
}) {
  // Measured from today (N2): the old version searched the projection from
  // its first month, so every milestone already behind you read "in ~0,0y".
  const milestones = returnMilestones({
    startValue,
    monthlySaving,
    annualReturn: histReturn,
    projection: projection.base,
  })
  const yearly = monthlySaving * 12
  const earnsNow = startValue * (histReturn / 100)

  const goalReaches = goals.map((g) => {
    const ev = goalEvals[g.id]
    const portfolioTargetValue = ev?.portfolioTargetValue ?? 0
    let hit: number | null = null
    if (ev) {
      if (startValue >= portfolioTargetValue) hit = 0
      else {
        const p = projection.base.find((x) => x.value >= portfolioTargetValue)
        hit = p ? p.month : null
      }
    }
    return {
      ...g,
      targetValue: portfolioTargetValue,
      subLabel: ev
        ? formatGoalSubLabel(g, ev)
        : `Reach ${fmtEUR(g.target, { compact: true })}`,
      hit,
    }
  })

  const label = (multiple: number) =>
    multiple === 1
      ? "Returns match what you add each year"
      : `Returns are ${multiple}× what you add`

  return (
    <div>
      <div
        className="muted small"
        style={{ marginBottom: 6 }}
        data-testid="milestones-summary"
      >
        {yearly <= 0
          ? "You aren’t adding money here, so there’s nothing for returns to out-earn."
          : histReturn <= 0
            ? `At your record of ${fmtPct(histReturn, 1)}/yr the portfolio doesn’t grow on its own, so returns never out-earn the ${fmtEUR(yearly, { compact: true })}/yr you add.`
            : `Today ${fmtEUR(startValue, { compact: true })} at ${fmtPct(histReturn, 1)}/yr earns about ${fmtEUR(earnsNow, { compact: true })} a year — ${fmtNum(earnsNow / yearly, 1)}× the ${fmtEUR(yearly, { compact: true })} you add.`}
      </div>
      {yearly > 0 &&
        histReturn > 0 &&
        milestones.map((m) => (
          <div
            key={m.multiple}
            data-testid="milestone-row"
            data-reached={m.reached ? "true" : "false"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 0",
              borderTop: "1px solid var(--border)",
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: "var(--fs-sm)", fontWeight: 500 }}>
                {label(m.multiple)}
              </div>
              <div className="muted small">
                {fmtEUR(m.threshold, { compact: true })}/yr from returns
              </div>
            </div>
            <div
              className="mono small"
              style={{ fontWeight: 600, textAlign: "right" }}
            >
              {m.reached ? (
                <span className="pos">Reached</span>
              ) : m.months !== null ? (
                `in ~${fmtNum(m.months / 12, 1)}y · at ${fmtEUR(m.value, { compact: true })}`
              ) : (
                <span className="muted">not within {horizonYears} years</span>
              )}
            </div>
          </div>
        ))}
      <div
        style={{
          fontSize: "var(--fs-2xs)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          fontWeight: 600,
          color: "var(--neutral-400)",
          marginTop: 14,
          marginBottom: 4,
        }}
      >
        Goals
      </div>
      {goalReaches.map((g) => (
        <div
          key={g.id}
          data-testid="goal-milestone-row"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "12px 0",
            borderTop: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: swatch(g.color),
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600 }}>
              {g.name}
            </div>
            <div className="muted small">{g.subLabel}</div>
          </div>
          <div className="mono small" style={{ fontWeight: 600 }}>
            {g.hit === 0 ? (
              <span className="pos">Reached</span>
            ) : g.hit !== null ? (
              `~${fmtNum(g.hit / 12, 1)}y`
            ) : (
              <span className="muted">not reached</span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

function ScenarioCard({
  label,
  pct,
  endValue,
  endInvested,
  startValue,
  color,
  accent,
  badge,
  note,
  testId,
}: {
  label: string
  pct: number
  endValue: number
  endInvested: number
  startValue: number
  color: string
  accent?: boolean
  /** What the rate assumes, said plainly ("If your last 6 years repeat…"). */
  badge?: string
  /** Where the rate sits against the assumption range, when outside it. */
  note?: string
  testId?: string
}) {
  const gain = endValue - endInvested
  const mult = startValue ? endValue / startValue : 0
  return (
    <div
      className="card card-pad"
      style={accent ? { borderColor: color, borderWidth: 2 } : undefined}
      data-testid={testId}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 4,
        }}
      >
        <span
          style={{ width: 10, height: 10, borderRadius: 2, background: color }}
        />
        <span
          style={{
            fontSize: "var(--fs-xs)",
            fontWeight: 600,
            color: "var(--neutral-500)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
      </div>
      {badge && (
        <div
          className="chip"
          data-testid={testId ? `${testId}-badge` : undefined}
          style={{ marginBottom: 6 }}
        >
          {badge}
        </div>
      )}
      <div
        className="mono"
        style={{
          fontFamily: "var(--font-head)",
          fontWeight: 700,
          fontSize: "var(--fs-5xl)",
          letterSpacing: "-0.02em",
        }}
      >
        {fmtEUR(endValue, { compact: true })}
      </div>
      <div className="muted small mono">
        {fmtPct(pct, 1)}/yr · {fmtNum(mult, 1)}× start
      </div>
      {note && (
        <div
          className="small"
          style={{ color: "var(--info)", marginTop: 2 }}
          data-testid={testId ? `${testId}-note` : undefined}
        >
          {note}
        </div>
      )}
      <div className="hr" style={{ margin: "10px 0" }} />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "var(--fs-xs)",
        }}
      >
        <span className="muted">Total invested</span>
        <span className="mono">{fmtEUR(endInvested, { compact: true })}</span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "var(--fs-xs)",
          marginTop: 4,
        }}
      >
        <span className="muted">Gain from return</span>
        <span className="mono pos">{fmtEUR(gain, { compact: true })}</span>
      </div>
    </div>
  )
}

function ContribBreakdown({
  projection,
}: {
  projection: import("@/lib/calc").ProjectionPoint[]
}) {
  const end = projection.at(-1)
  if (!end) return null
  const contributions = end.invested
  const gain = end.value - contributions
  const total = end.value || 1
  const contribPct = (contributions / total) * 100
  const gainPct = (gain / total) * 100
  return (
    <div>
      <div
        style={{
          display: "flex",
          height: 40,
          borderRadius: 8,
          overflow: "hidden",
          border: "1px solid var(--border)",
        }}
      >
        <div
          data-testid="contrib-bar-contributions"
          style={{
            width: `${contribPct}%`,
            background: "var(--secondary-400)",
            display: "grid",
            placeItems: "center",
            color: "var(--surface)",
            fontSize: "var(--fs-xs)",
            fontWeight: 600,
          }}
        >
          {contribPct > 15 ? fmtPct(contribPct, 0) : ""}
        </div>
        <div
          data-testid="contrib-bar-gain"
          style={{
            width: `${gainPct}%`,
            background: "var(--primary)",
            display: "grid",
            placeItems: "center",
            color: "var(--primary-foreground)",
            fontSize: "var(--fs-xs)",
            fontWeight: 600,
          }}
        >
          {gainPct > 15 ? fmtPct(gainPct, 0) : ""}
        </div>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 10,
          fontSize: "var(--fs-sm)",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: "var(--secondary-400)",
            }}
          />
          <span>Your contributions</span>
          <span className="mono" style={{ fontWeight: 600, marginLeft: 8 }}>
            {fmtEUR(contributions, { compact: true })}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: "var(--primary)",
            }}
          />
          <span>Compound growth</span>
          <span className="mono" style={{ fontWeight: 600, marginLeft: 8 }}>
            {fmtEUR(gain, { compact: true })}
          </span>
        </div>
      </div>
    </div>
  )
}

type Assumptions = Pick<
  SettingsDTO,
  "horizonYears" | "conservativeReturn" | "optimisticReturn"
> & { monthlySaving: number }

/** "horizon and Trade Republic’s monthly contribution" — what Apply writes. */
function describeChanges(
  keys: (keyof Assumptions)[],
  portfolioName: string
): string {
  const parts = keys.map((k) =>
    k === "horizonYears"
      ? "the horizon"
      : k === "conservativeReturn"
        ? "the conservative return"
        : k === "optimisticReturn"
          ? "the optimistic return"
          : `${portfolioName}’s monthly contribution`
  )
  if (parts.length <= 1) return parts.join("")
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`
}

/** "6 years" / "8 months" — how much history the track record rests on. */
function recordSpanYears(entries: { year: number; month: number }[]): string {
  const first = entries[0]
  const last = entries.at(-1)
  if (!first || !last) return "0 months"
  const months = (last.year - first.year) * 12 + (last.month - first.month) + 1
  if (months < 18) return `${months} ${months === 1 ? "month" : "months"}`
  return `${fmtNum(months / 12, 0)} years`
}
