"use client"

import { useMemo, useState } from "react"
import {
  useData,
  useDataActions,
  useGoalEvaluator,
} from "@/components/providers/data-provider"
import { GrowthChart } from "@/components/growth-chart"
import { CombinedDataNotice } from "@/components/combined-data-notice"
import { MonthlySavingControl, SliderRow, Stat } from "@/components/slider-row"
import { fmtEUR, fmtPct } from "@/lib/format"
import { incomeByMonth, projectFuture, latestKnownValue } from "@/lib/calc"
import type { GoalEvaluation, ProjectionPoint } from "@/lib/calc"
import {
  COMBINED_PORTFOLIO_ID,
  type GoalDTO,
  type SettingsDTO,
} from "@/lib/types"

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
  // `inflationAdjusted` was wired through to GrowthChart options earlier but
  // never surfaced as a UI toggle — keep `showDividends` and drop the dead
  // half of the state object.
  const [showDividends, setShowDividends] = useState(true)

  const evaluator = useGoalEvaluator()
  const active = activePortfolio
  const last = active.entries.at(-1)
  const isCombined = selectedPortfolio === COMBINED_PORTFOLIO_ID
  const monthlySaving = effectiveMonthlySaving(selectedPortfolio)
  const histReturn = useMemo(
    () => evaluator.historicalReturn(active.id),
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
        color: g.color,
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
        years: settings.horizonYears,
        annualReturn: histReturn,
      }),
      conservative: projectFuture({
        startValue,
        monthlySaving,
        years: settings.horizonYears,
        annualReturn: settings.conservativeReturn,
      }),
      optimistic: projectFuture({
        startValue,
        monthlySaving,
        years: settings.horizonYears,
        annualReturn: settings.optimisticReturn,
      }),
    }
  }, [last, startValue, monthlySaving, settings, histReturn])

  if (!last) {
    return (
      <div className="view">
        <h1 className="title">Forecast</h1>
        <div className="muted small" style={{ marginTop: 8 }}>
          This portfolio has no entries yet — add a monthly entry to begin
          projecting, or switch portfolios from the header.
        </div>
      </div>
    )
  }

  const endBase = projection.base.at(-1)?.value ?? 0

  const endCons = projection.conservative.at(-1)?.value ?? 0
  const endOpt = projection.optimistic.at(-1)?.value ?? 0

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
          <h1 className="title">Forecast</h1>
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
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <label
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                fontSize: 12,
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
          </div>
          <div className="legend">
            <div className="it">
              <span
                className="sw line"
                style={{ background: "var(--primary)" }}
              />
              Value (historical)
            </div>
            <div className="it">
              <span
                className="sw line"
                style={{ background: "var(--primary)", opacity: 0.4 }}
              />
              Base projection
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
            <div className="it">
              <span
                className="sw line"
                style={{
                  background: "var(--secondary-400)",
                  borderTop: "2px dashed var(--secondary-400)",
                  height: 0,
                }}
              />
              Invested
            </div>
          </div>
        </div>

        <GrowthChart
          entries={active.entries}
          projection={projection}
          monthlySaving={settings.monthlySaving}
          inflation={settings.inflation}
          options={{ showDividends, inflationAdjusted: false }}
          goalLines={goalLines}
          height={440}
          dividendsByMonth={dividendIndex}
          coverage={isCombined ? combinedCoverage : undefined}
        />

        <div className="hr" />

        <div className="grid-4 grid" data-testid="chart-stats-grid">
          <div data-testid="stat-horizon">
            <Stat
              label="Horizon"
              value={`${settings.horizonYears} years`}
              sub={`to '${String(new Date().getFullYear() + settings.horizonYears).slice(-2)}`}
            />
          </div>
          <div data-testid="stat-optimistic">
            <Stat
              label={`Optimistic @ ${fmtPct(settings.optimisticReturn, 1)}`}
              value={fmtEUR(endOpt, { compact: true })}
              sub={
                fmtPct((endOpt / startValue - 1) * 100, 0, true) + " vs today"
              }
            />
          </div>
          <div data-testid="stat-base">
            <Stat
              label={`Base @ ${fmtPct(histReturn, 1)} hist.`}
              value={fmtEUR(endBase, { compact: true })}
              sub={
                fmtPct((endBase / startValue - 1) * 100, 0, true) + " vs today"
              }
            />
          </div>
          <div data-testid="stat-conservative">
            <Stat
              label={`Conservative @ ${fmtPct(settings.conservativeReturn, 1)}`}
              value={fmtEUR(endCons, { compact: true })}
              sub={
                fmtPct((endCons / startValue - 1) * 100, 0, true) + " vs today"
              }
            />
          </div>
        </div>
      </div>

      <div className="grid-3 grid" style={{ marginTop: 16 }}>
        <ScenarioCard
          label="Conservative"
          pct={settings.conservativeReturn}
          endValue={endCons}
          endInvested={projection.conservative.at(-1)?.invested ?? 0}
          startValue={startValue}
          color="var(--secondary-400)"
          testId="scenario-card-conservative"
        />
        <ScenarioCard
          label="Base (historical)"
          pct={histReturn}
          endValue={endBase}
          endInvested={projection.base.at(-1)?.invested ?? 0}
          startValue={startValue}
          color="var(--primary)"
          accent
          testId="scenario-card-base"
        />
        <ScenarioCard
          label="Optimistic"
          pct={settings.optimisticReturn}
          endValue={endOpt}
          endInvested={projection.optimistic.at(-1)?.invested ?? 0}
          startValue={startValue}
          color="var(--tertiary)"
          testId="scenario-card-optimistic"
        />
      </div>

      <div className="card card-pad" style={{ marginTop: 16 }}>
        <h3 style={{ fontSize: 14, marginBottom: 10 }}>
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
              marginBottom: 14,
            }}
          >
            <h3 style={{ fontSize: 15 }}>Planning assumptions</h3>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                fontSize: 11,
                fontWeight: 500,
                color: "var(--tertiary)",
                background:
                  "color-mix(in srgb, var(--tertiary) 10%, transparent)",
                borderRadius: 20,
                padding: "2px 8px",
              }}
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 10 10"
                fill="none"
                aria-hidden="true"
              >
                <path
                  d="M8.5 2.5L4 7.5L1.5 5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Saved to settings
            </span>
          </div>
          <SliderRow
            label="Horizon"
            value={settings.horizonYears}
            min={1}
            max={40}
            step={1}
            suffix=" years"
            onChange={(v) => updateSettings({ horizonYears: v })}
            testId="chart-slider-horizon"
          />
          <MonthlySavingControl
            isCombined={isCombined}
            value={monthlySaving}
            onChange={(v) =>
              !isCombined &&
              updatePortfolio(selectedPortfolio, {
                targetMonthlyContribution: v,
              })
            }
          />
          <SliderRow
            label="Conservative return"
            value={settings.conservativeReturn}
            min={0}
            max={8}
            step={0.1}
            suffix="%"
            onChange={(v) => updateSettings({ conservativeReturn: v })}
            testId="chart-slider-conservative"
          />
          <SliderRow
            label="Optimistic return"
            value={settings.optimisticReturn}
            min={5}
            max={15}
            step={0.1}
            suffix="%"
            onChange={(v) => updateSettings({ optimisticReturn: v })}
            testId="chart-slider-optimistic"
          />
        </div>

        <div className="card card-pad" data-testid="milestones-card">
          <h3 style={{ fontSize: 15, marginBottom: 14 }}>Milestones</h3>
          <Milestones
            projection={projection}
            settings={settings}
            goals={scopedGoals}
            goalEvals={goalEvals}
            histReturn={histReturn}
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
  settings,
  goals,
  goalEvals,
  histReturn,
}: {
  projection: {
    base: ProjectionPoint[]
    conservative: ProjectionPoint[]
    optimistic: ProjectionPoint[]
  }
  settings: SettingsDTO
  goals: GoalDTO[]
  goalEvals: Record<number, GoalEvaluation>
  histReturn: number
}) {
  const rAnnual = histReturn / 100
  const monthlySavings = settings.monthlySaving
  const yearlySavings = settings.monthlySaving * 12

  const find = (target: number) => {
    for (let i = 0; i < projection.base.length; i++) {
      const v = projection.base[i].value
      if (v * rAnnual >= target) return { month: i, value: v }
    }
    return null
  }

  const covers = [
    {
      label: "Annual return covers monthly savings",
      target: monthlySavings,
      color: "var(--tertiary)",
    },
    {
      label: "Annual return covers yearly savings",
      target: yearlySavings,
      color: "var(--primary)",
    },
    {
      label: "Annual return covers 2× yearly savings",
      target: yearlySavings * 2,
      color: "var(--secondary)",
    },
  ]

  const goalReaches = goals.map((g) => {
    const ev = goalEvals[g.id]
    const portfolioTargetValue = ev?.portfolioTargetValue ?? 0
    let hit: number | null = null
    if (ev) {
      for (let i = 0; i < projection.base.length; i++) {
        if (projection.base[i].value >= portfolioTargetValue) {
          hit = i
          break
        }
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

  return (
    <div>
      {covers.map((c) => {
        const found = find(c.target)
        const yearsOut = found ? (found.month / 12).toFixed(1) : "—"
        return (
          <div
            key={c.label}
            data-testid="milestone-row"
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
                background: c.color,
              }}
            />
            <div style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
              {c.label}
            </div>
            <div className="mono small" style={{ fontWeight: 600 }}>
              {found ? (
                `in ~${yearsOut}y · ${fmtEUR(found.value, { compact: true })}`
              ) : (
                <span className="muted">not within horizon</span>
              )}
            </div>
          </div>
        )
      })}
      <div
        style={{
          fontSize: 11,
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
              background: g.color,
            }}
          />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{g.name}</div>
            <div className="muted small">{g.subLabel}</div>
          </div>
          <div className="mono small" style={{ fontWeight: 600 }}>
            {g.hit !== null ? (
              `~${(g.hit / 12).toFixed(1)}y`
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
  testId,
}: {
  label: string
  pct: number
  endValue: number
  endInvested: number
  startValue: number
  color: string
  accent?: boolean
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
            fontSize: 12,
            fontWeight: 600,
            color: "var(--neutral-500)",
            letterSpacing: "0.04em",
            textTransform: "uppercase",
          }}
        >
          {label}
        </span>
      </div>
      <div
        className="mono"
        style={{
          fontFamily: "var(--font-head)",
          fontWeight: 700,
          fontSize: 26,
          letterSpacing: "-0.02em",
        }}
      >
        {fmtEUR(endValue, { compact: true })}
      </div>
      <div className="muted small mono">
        {fmtPct(pct, 1)}/yr · {mult.toFixed(1)}× start
      </div>
      <div className="hr" style={{ margin: "10px 0" }} />
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
        }}
      >
        <span className="muted">Invested</span>
        <span className="mono">{fmtEUR(endInvested, { compact: true })}</span>
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
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
            color: "#fff",
            fontSize: 12,
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
            color: "#fff",
            fontSize: 12,
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
          fontSize: 13,
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
