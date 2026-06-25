"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  useData,
  useDataActions,
  useGoalEvaluator,
} from "@/components/providers/data-provider"
import { useEditorIntent } from "@/components/providers/editor-intent"
import { GoalEditor } from "@/components/goal-editor"
import { SolverChart } from "@/components/charts/solver-chart"
import { Stat } from "@/components/slider-row"
import { SliderField } from "@/components/slider-field"
import { Icon } from "@/components/icon"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { projectFuture, type GoalEvaluation } from "@/lib/calc"
import { fmtEUR, fmtPct } from "@/lib/format"
import type {
  GoalDTO,
  GoalKind,
  GoalScope,
  PortfolioDTO,
  SettingsDTO,
} from "@/lib/types"

type ActiveId = number | "scratch" | null

export function PlanningView() {
  const { portfolios, goals, settings, goalEvals } = useData()
  const { addGoal, updateGoal, deleteGoal } = useDataActions()
  const evaluator = useGoalEvaluator()

  const [activeId, setActiveId] = useState<ActiveId>(() =>
    goals.length > 0 ? goals[0].id : "scratch"
  )
  const [local, setLocal] = useState<GoalDTO>(() =>
    activeId === "scratch" || goals.length === 0 ? buildScratch() : goals[0]
  )
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorPrefill, setEditorPrefill] = useState<{
    goal?: GoalDTO | null
    defaultKind?: GoalKind
    defaultScope?: GoalScope
    defaultPortfolioId?: number | null
  }>({})

  // Header requests "new goal" → open the editor in create mode.
  useEditorIntent("goal", () => {
    setEditorPrefill({ goal: null })
    setEditorOpen(true)
  })

  // Deep-link entry point: /planning?new=goal opens the editor once and
  // strips the query so a soft refresh doesn't reopen it. The Overview's
  // empty-state CTA uses this — firing requestNew('goal') from there did
  // nothing because Overview never subscribes to the bus.
  //
  // Adjusts derived state via render-time setState, guarded by comparing
  // the live signal to its stored predecessor — React 19's prescribed
  // pattern for "external value changed" (see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  // The router.replace side-effect can't run during render, so it defers
  // to an effect keyed off the same signal.
  const searchParams = useSearchParams()
  const router = useRouter()
  const wantsNewGoal = searchParams.get("new") === "goal"
  const [prevWantsNewGoal, setPrevWantsNewGoal] = useState(false)
  if (wantsNewGoal !== prevWantsNewGoal) {
    setPrevWantsNewGoal(wantsNewGoal)
    if (wantsNewGoal) {
      setEditorPrefill({ goal: null })
      setEditorOpen(true)
    }
  }
  useEffect(() => {
    if (wantsNewGoal) router.replace("/planning", { scroll: false })
  }, [wantsNewGoal, router])

  // Keep `local` in sync if the active goal's saved values change externally
  // (another tab edited it, or after a Save).
  const savedGoal =
    activeId !== "scratch" && activeId !== null
      ? (goals.find((g) => g.id === activeId) ?? null)
      : null

  // If the saved goal disappears (deleted from another tab / cascade-deleted
  // with its portfolio), fall back to first goal or scratch. React 19 supports
  // a render-time setState here — this avoids the extra paint that a useEffect
  // would introduce and is the recommended pattern for "derive selection from
  // external source-of-truth changes."
  const [trackedGoals, setTrackedGoals] = useState(goals)
  if (
    trackedGoals !== goals &&
    activeId !== "scratch" &&
    activeId !== null &&
    !goals.find((g) => g.id === activeId)
  ) {
    setTrackedGoals(goals)
    if (goals.length > 0) {
      setActiveId(goals[0].id)
      setLocal(goals[0])
    } else {
      setActiveId("scratch")
      setLocal(buildScratch())
    }
  } else if (trackedGoals !== goals) {
    setTrackedGoals(goals)
  }

  const dirty = savedGoal ? !goalsEqual(savedGoal, local) : false

  // Evaluator handles scope-aware monthly saving internally — no need to
  // resolve scope at the call site.
  const evaluation = useMemo(
    () => evaluator.evaluate(local),
    [evaluator, local]
  )

  const currentYear = useMemo(() => new Date().getFullYear(), [])
  const horizon = Math.max(local.targetYear - currentYear, 1)
  const startValue = evaluation.scopedKpiValue
  const projections = useMemo(
    () => ({
      cons: projectFuture({
        startValue,
        monthlySaving: evaluation.requiredMonthly,
        years: horizon,
        annualReturn: settings.conservativeReturn,
      }),
      exp: projectFuture({
        startValue,
        monthlySaving: evaluation.requiredMonthly,
        years: horizon,
        annualReturn: evaluation.expectedReturn,
      }),
      opt: projectFuture({
        startValue,
        monthlySaving: evaluation.requiredMonthly,
        years: horizon,
        annualReturn: settings.optimisticReturn,
      }),
    }),
    [
      startValue,
      evaluation.requiredMonthly,
      evaluation.expectedReturn,
      horizon,
      settings,
    ]
  )

  function selectGoal(id: ActiveId) {
    if (id === "scratch") {
      setActiveId("scratch")
      setLocal(buildScratch())
    } else if (id !== null) {
      const g = goals.find((x) => x.id === id)
      if (g) {
        setActiveId(id)
        setLocal(g)
      }
    }
  }

  async function handleSave() {
    if (!savedGoal) return
    await updateGoal(savedGoal.id, {
      name: local.name,
      color: local.color,
      kind: local.kind,
      scope: local.scope,
      portfolioId: local.portfolioId,
      target: local.target,
      targetYear: local.targetYear,
      swr: local.swr,
      yieldAssumed: local.yieldAssumed,
    })
  }

  function handleRevert() {
    if (savedGoal) setLocal(savedGoal)
  }

  async function handleDelete() {
    if (!savedGoal) return
    await deleteGoal(savedGoal.id)
  }

  function handlePromoteScratch() {
    setEditorPrefill({
      goal: null,
      defaultKind: local.kind,
      defaultScope: local.scope,
      defaultPortfolioId: local.portfolioId,
    })
    setEditorOpen(true)
  }

  return (
    <div className="view">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: 12,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="title">Planning</h1>
          <div className="muted small" style={{ marginTop: 4 }}>
            Set income, value, or dividend targets — see what it takes to hit
            them.
          </div>
        </div>
      </div>

      <GoalStrip
        goals={goals}
        activeId={activeId}
        portfolios={portfolios}
        goalEvals={goalEvals}
        onSelect={selectGoal}
      />

      <div style={{ height: 14 }} />

      <Workspace
        local={local}
        setLocal={setLocal}
        savedGoal={savedGoal}
        isScratch={activeId === "scratch"}
        dirty={dirty}
        evaluation={evaluation}
        portfolios={portfolios}
        settings={settings}
        projections={projections}
        horizon={horizon}
        onSave={handleSave}
        onRevert={handleRevert}
        onDelete={handleDelete}
        onPromoteScratch={handlePromoteScratch}
      />

      <GoalEditor
        open={editorOpen}
        onOpenChange={(o) => {
          setEditorOpen(o)
          if (!o) setEditorPrefill({})
        }}
        goal={editorPrefill.goal}
        defaultKind={editorPrefill.defaultKind}
        defaultScope={editorPrefill.defaultScope}
        defaultPortfolioId={editorPrefill.defaultPortfolioId}
        onSave={async (form) => {
          if (editorPrefill.goal) {
            await updateGoal(editorPrefill.goal.id, form)
          } else {
            const created = await addGoal(form)
            setActiveId(created.id)
            setLocal(created)
          }
        }}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Strip
// ────────────────────────────────────────────────────────────────────────────

function GoalStrip({
  goals,
  activeId,
  portfolios,
  goalEvals,
  onSelect,
}: {
  goals: GoalDTO[]
  activeId: ActiveId
  portfolios: PortfolioDTO[]
  goalEvals: Record<number, GoalEvaluation>
  onSelect: (id: ActiveId) => void
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 10,
        overflowX: "auto",
        paddingBottom: 4,
      }}
      data-testid="goal-strip"
    >
      {goals.map((g) => (
        <GoalTile
          key={g.id}
          goal={g}
          active={activeId === g.id}
          portfolios={portfolios}
          evaluation={goalEvals[g.id]}
          onClick={() => onSelect(g.id)}
        />
      ))}
      <ScratchpadTile
        active={activeId === "scratch"}
        onClick={() => onSelect("scratch")}
      />
    </div>
  )
}

function GoalTile({
  goal,
  active,
  portfolios,
  evaluation,
  onClick,
}: {
  goal: GoalDTO
  active: boolean
  portfolios: PortfolioDTO[]
  evaluation: GoalEvaluation
  onClick: () => void
}) {
  const ev = evaluation
  const scopeLabel =
    goal.scope === "combined"
      ? "Combined"
      : (portfolios.find((p) => p.id === goal.portfolioId)?.name ?? "Portfolio")
  const headline = headlineFor(goal)
  const pct = Math.min(1, Math.max(0, ev.pct))
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={`goal-tile-${goal.id}`}
      style={{
        flex: "0 0 200px",
        minWidth: 200,
        padding: "12px 14px",
        background: "var(--surface)",
        border: `1.5px solid ${active ? "var(--primary)" : "var(--border)"}`,
        borderLeft: `4px solid ${goal.color}`,
        borderRadius: 10,
        textAlign: "left",
        cursor: "pointer",
        boxShadow: active ? "0 4px 14px rgba(0,0,0,0.06)" : "none",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 2 }}>
        {goal.name}
      </div>
      <div className="muted small" style={{ fontSize: 11 }}>
        {headline} · {scopeLabel}
      </div>
      <div style={{ marginTop: 8 }}>
        <span
          className={`chip ${ev.onTrack ? "positive" : "negative"}`}
          style={{ fontSize: 10.5 }}
        >
          {ev.onTrack ? "✓ on track" : "△ behind"}
        </span>
      </div>
      <div className="pbar" style={{ marginTop: 8, height: 4 }}>
        <div
          style={{
            width: `${pct * 100}%`,
            background: goal.color,
            height: "100%",
          }}
        />
      </div>
    </button>
  )
}

function ScratchpadTile({
  active,
  onClick,
}: {
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="goal-tile-scratch"
      style={{
        flex: "0 0 180px",
        minWidth: 180,
        padding: "12px 14px",
        background: active ? "var(--surface)" : "transparent",
        border: `1.5px dashed ${active ? "var(--primary)" : "var(--neutral-300, var(--border))"}`,
        borderRadius: 10,
        textAlign: "left",
        cursor: "pointer",
      }}
    >
      <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 2 }}>
        Scratchpad
      </div>
      <div className="muted small" style={{ fontSize: 11 }}>
        Try numbers — nothing is saved.
      </div>
      <div className="muted small" style={{ fontSize: 11, marginTop: 18 }}>
        ╌╌╌╌╌╌╌╌╌╌╌
      </div>
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Workspace
// ────────────────────────────────────────────────────────────────────────────

function Workspace({
  local,
  setLocal,
  savedGoal,
  isScratch,
  dirty,
  evaluation,
  portfolios,
  settings,
  projections,
  horizon,
  onSave,
  onRevert,
  onDelete,
  onPromoteScratch,
}: {
  local: GoalDTO
  setLocal: (g: GoalDTO) => void
  savedGoal: GoalDTO | null
  isScratch: boolean
  dirty: boolean
  evaluation: GoalEvaluation
  portfolios: PortfolioDTO[]
  settings: SettingsDTO
  projections: {
    cons: import("@/lib/calc").ProjectionPoint[]
    exp: import("@/lib/calc").ProjectionPoint[]
    opt: import("@/lib/calc").ProjectionPoint[]
  }
  horizon: number
  onSave: () => void | Promise<void>
  onRevert: () => void
  onDelete: () => void | Promise<void>
  onPromoteScratch: () => void
}) {
  const scopeLabel =
    local.scope === "combined"
      ? "Combined"
      : (portfolios.find((p) => p.id === local.portfolioId)?.name ?? "—")

  return (
    <div className="card" style={{ padding: 20 }}>
      {/* Workspace header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          flexWrap: "wrap",
          marginBottom: 14,
        }}
      >
        <div style={{ minWidth: 240 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: local.color,
              }}
            />
            <span style={{ fontSize: 16, fontWeight: 700 }}>
              {isScratch ? "Scratchpad" : local.name}
            </span>
            <span className="muted small" style={{ fontSize: 12 }}>
              · {isScratch ? "no goal attached" : "solving"}
            </span>
            {dirty && (
              <span
                className="chip negative"
                style={{ fontSize: 10.5 }}
                data-testid="workspace-modified-chip"
              >
                ◆ modified
              </span>
            )}
          </div>
          <div className="muted small" style={{ marginTop: 4, fontSize: 12.5 }}>
            {headlineFor(local)} · {scopeLabel}
            {dirty && savedGoal && (
              <>
                {" · "}
                <span style={{ color: "var(--neutral-700)" }}>
                  was {fmtTarget(savedGoal)}
                </span>
              </>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {isScratch ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={onPromoteScratch}
              data-testid="workspace-save-as-new"
            >
              <Icon name="plus" size={14} /> Save as new goal
            </button>
          ) : dirty ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onRevert}
                data-testid="workspace-revert"
              >
                Revert
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={onSave}
                data-testid="workspace-save"
              >
                <Icon name="check" size={14} /> Save changes
              </button>
            </>
          ) : (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="btn btn-icon btn-ghost"
                  aria-label="Delete goal"
                  data-testid="workspace-delete"
                >
                  <Icon name="trash" size={14} />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    Delete &ldquo;{savedGoal?.name}&rdquo;?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    This goal will be permanently removed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      {/* KPI tiles */}
      <KpiTiles evaluation={evaluation} kind={local.kind} />

      {/* Two-column body */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(260px, 360px) 1fr",
          gap: 18,
          marginTop: 16,
        }}
      >
        <AssumptionsPanel
          local={local}
          setLocal={setLocal}
          settings={settings}
          portfolios={portfolios}
          evaluation={evaluation}
        />
        <div>
          <div
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: "var(--neutral-500)",
              letterSpacing: "0.04em",
              textTransform: "uppercase",
              marginBottom: 8,
            }}
          >
            Trajectory
          </div>
          <SolverChart
            projections={projections}
            startValue={evaluation.scopedKpiValue}
            portfolioTarget={evaluation.portfolioTargetValue}
            horizon={horizon}
          />
        </div>
      </div>

      <GlobalAssumptionsEcho settings={settings} />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// KPI tiles
// ────────────────────────────────────────────────────────────────────────────

function KpiTiles({
  evaluation,
  kind,
}: {
  evaluation: GoalEvaluation
  kind: GoalKind
}) {
  const onTrack = evaluation.onTrack
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)",
        gap: 10,
      }}
    >
      <KpiTile
        label="Required monthly"
        accent={onTrack ? "positive" : "primary"}
        value={fmtEUR(evaluation.requiredMonthly)}
        sub={
          onTrack
            ? `✓ saving ${fmtEUR(evaluation.monthlySaving)}/mo today`
            : `△ ${fmtEUR(
                evaluation.requiredMonthly - evaluation.monthlySaving
              )}/mo gap vs your ${fmtEUR(evaluation.monthlySaving)}/mo`
        }
        testId="kpi-required-monthly"
      />
      {kind === "portfolio_value" && (
        <>
          <KpiTile
            label="Gap to target"
            value={fmtEUR(
              Math.max(0, evaluation.targetValue - evaluation.currentValue),
              { compact: true }
            )}
            sub={`Current ${fmtEUR(evaluation.currentValue, { compact: true })} of ${fmtEUR(evaluation.targetValue, { compact: true })}`}
            testId="kpi-gap"
          />
          <KpiTile
            label="Time to target"
            value={
              evaluation.projectedYear !== null
                ? `${(evaluation.projectedYear - new Date().getFullYear() || 0).toFixed(1)} y`
                : "—"
            }
            sub={
              evaluation.projectedYear !== null
                ? `reaches ${Math.round(evaluation.projectedYear)}`
                : "not within 40y"
            }
            testId="kpi-time"
          />
        </>
      )}
      {kind === "annual_income" && (
        <>
          <KpiTile
            label="Portfolio target"
            value={fmtEUR(evaluation.portfolioTargetValue, { compact: true })}
            sub={`at ${evaluation.swrUsed?.toFixed(1) ?? "?"}% SWR · ${Math.max(0, Math.round(evaluation.portfolioTargetValue))} EUR needed`}
            testId="kpi-portfolio-target"
          />
          <KpiTile
            label="Inflated income"
            value={`${fmtEUR(evaluation.inflatedTargetValue, { compact: true })}/yr`}
            sub={`nominal ${fmtEUR(evaluation.targetValue, { decimals: 0 })}/yr today`}
            testId="kpi-inflated"
          />
        </>
      )}
      {(kind === "dividend_annual" || kind === "dividend_monthly") && (
        <>
          <KpiTile
            label="Portfolio target"
            value={fmtEUR(evaluation.portfolioTargetValue, { compact: true })}
            sub={`for ${kind === "dividend_monthly" ? fmtEUR(evaluation.targetValue) + "/mo" : fmtEUR(evaluation.targetValue) + "/yr"} in dividends`}
            testId="kpi-portfolio-target"
          />
          <KpiTile
            label="Assumed yield"
            value={`${evaluation.yieldUsed?.value.toFixed(2) ?? "—"}%`}
            sub={
              evaluation.yieldUsed?.source === "override"
                ? "your override"
                : evaluation.yieldUsed?.source === "derived"
                  ? "trailing 12m from your data"
                  : "default — no payout history"
            }
            testId="kpi-yield"
          />
        </>
      )}
    </div>
  )
}

function KpiTile({
  label,
  value,
  sub,
  accent,
  testId,
}: {
  label: string
  value: string
  sub: string
  accent?: "primary" | "positive"
  testId?: string
}) {
  const borderColor =
    accent === "primary"
      ? "var(--primary)"
      : accent === "positive"
        ? "var(--tertiary)"
        : "var(--border)"
  return (
    <div
      style={{
        padding: "12px 14px",
        border: `1.5px solid ${borderColor}`,
        borderRadius: 10,
        background: "var(--surface)",
      }}
      data-testid={testId}
    >
      <div
        className="muted small"
        style={{
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {label}
      </div>
      <div
        className="mono"
        style={{
          fontSize: 22,
          fontWeight: 700,
          fontFamily: "var(--font-head)",
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>
      <div className="muted small" style={{ fontSize: 11, marginTop: 2 }}>
        {sub}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Assumptions panel — sliders that map to GoalDTO fields
// ────────────────────────────────────────────────────────────────────────────

function AssumptionsPanel({
  local,
  setLocal,
  settings,
  portfolios,
  evaluation,
}: {
  local: GoalDTO
  setLocal: (g: GoalDTO) => void
  settings: SettingsDTO
  portfolios: PortfolioDTO[]
  evaluation: GoalEvaluation
}) {
  const meta = VALUE_META[local.kind]
  return (
    <div>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "var(--neutral-500)",
          letterSpacing: "0.04em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        Goal
      </div>
      <SliderField
        label={meta.label}
        value={local.target}
        kind="money"
        sliderMin={meta.min}
        sliderMax={meta.max}
        step={meta.step}
        typedMin={0}
        onChange={(v) => setLocal({ ...local, target: v })}
        testId="planning-slider-target"
      />
      <SliderField
        label="Target year"
        value={local.targetYear}
        kind="integer"
        sliderMin={new Date().getFullYear()}
        sliderMax={new Date().getFullYear() + 40}
        step={1}
        typedMin={new Date().getFullYear()}
        onChange={(v) => setLocal({ ...local, targetYear: v })}
        testId="planning-slider-year"
      />

      {local.kind === "annual_income" && (
        <SliderField
          label={
            local.swr == null
              ? `SWR (settings default ${settings.defaultSwr.toFixed(1)}%)`
              : "SWR (override)"
          }
          value={local.swr ?? settings.defaultSwr}
          kind="percent"
          sliderMin={2.5}
          sliderMax={6}
          step={0.1}
          decimals={1}
          typedMin={0}
          onChange={(v) => setLocal({ ...local, swr: round1(v) })}
          testId="planning-slider-swr"
        />
      )}

      {(local.kind === "dividend_annual" ||
        local.kind === "dividend_monthly") && (
        <SliderField
          label={
            evaluation.yieldUsed?.source === "override"
              ? "Yield (override)"
              : evaluation.yieldUsed?.source === "derived"
                ? `Yield (trailing 12m)`
                : `Yield (default — no payout history)`
          }
          value={evaluation.yieldUsed?.value ?? 2.5}
          kind="percent"
          sliderMin={0.5}
          sliderMax={8}
          step={0.1}
          decimals={2}
          typedMin={0}
          onChange={(v) => setLocal({ ...local, yieldAssumed: round2(v) })}
          testId="planning-slider-yield"
        />
      )}

      {local.scope === "portfolio" && (
        <div className="muted small" style={{ fontSize: 11, marginTop: 10 }}>
          Scoped to{" "}
          <strong style={{ color: "var(--neutral-700)" }}>
            {portfolios.find((p) => p.id === local.portfolioId)?.name ?? "—"}
          </strong>
          . Change scope or rename in the goal editor.
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <Stat
          label="Historical return (your data)"
          value={fmtPct(evaluation.expectedReturn, 1) + "/yr"}
          sub="used as the expected scenario in the trajectory"
        />
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Read-only echo of global settings
// ────────────────────────────────────────────────────────────────────────────

function GlobalAssumptionsEcho({ settings }: { settings: SettingsDTO }) {
  return (
    <div
      style={{
        marginTop: 16,
        padding: "10px 14px",
        borderRadius: 8,
        background: "var(--neutral-50, #f8fafc)",
        border: "1px solid var(--border)",
        display: "flex",
        gap: 16,
        flexWrap: "wrap",
        alignItems: "center",
        fontSize: 12,
      }}
      data-testid="global-assumptions-echo"
    >
      <span className="muted">Global assumptions:</span>
      <Echo label="Inflation" value={`${settings.inflation.toFixed(1)}%`} />
      <Echo
        label="Conservative"
        value={`${settings.conservativeReturn.toFixed(1)}%`}
      />
      <Echo
        label="Optimistic"
        value={`${settings.optimisticReturn.toFixed(1)}%`}
      />
      <Echo label="Default SWR" value={`${settings.defaultSwr.toFixed(1)}%`} />
      <Link
        href="/settings"
        style={{
          marginLeft: "auto",
          color: "var(--primary)",
          fontWeight: 600,
        }}
      >
        Edit in Settings →
      </Link>
    </div>
  )
}

function Echo({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="muted">{label}</span>{" "}
      <strong className="mono" style={{ color: "var(--neutral-800)" }}>
        {value}
      </strong>
    </span>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

// `min`/`max` are the comfortable slider track only — `SliderField` lets the
// user type any value (down to `typedMin: 0`) and stretches the track to fit.
// So these floors are deliberately 0: the previous non-zero floors (e.g. 100
// for monthly dividends) made low targets unreachable by drag.
const VALUE_META: Record<
  GoalKind,
  {
    label: string
    min: number
    max: number
    step: number
  }
> = {
  portfolio_value: {
    label: "Target portfolio value",
    min: 0,
    max: 5_000_000,
    step: 10_000,
  },
  annual_income: {
    label: "Target yearly income (today's money)",
    min: 0,
    max: 120_000,
    step: 500,
  },
  dividend_annual: {
    label: "Target annual dividends",
    min: 0,
    max: 60_000,
    step: 250,
  },
  dividend_monthly: {
    label: "Target monthly dividends",
    min: 0,
    max: 5_000,
    step: 25,
  },
}

function headlineFor(g: GoalDTO): string {
  switch (g.kind) {
    case "portfolio_value":
      return `${fmtEUR(g.target, { compact: true })} · ${shortYear(g.targetYear)}`
    case "annual_income":
      return `${fmtEUR(g.target, { compact: true })}/yr · ${shortYear(g.targetYear)}`
    case "dividend_annual":
      return `${fmtEUR(g.target, { compact: true })} divs/yr · ${shortYear(g.targetYear)}`
    case "dividend_monthly":
      return `${fmtEUR(g.target, { compact: true })} divs/mo · ${shortYear(g.targetYear)}`
  }
}

function fmtTarget(g: GoalDTO): string {
  switch (g.kind) {
    case "portfolio_value":
      return fmtEUR(g.target, { compact: true })
    case "annual_income":
      return `${fmtEUR(g.target, { compact: true })}/yr`
    case "dividend_annual":
      return `${fmtEUR(g.target, { compact: true })}/yr`
    case "dividend_monthly":
      return `${fmtEUR(g.target, { compact: true })}/mo`
  }
}

function shortYear(y: number): string {
  return `'${String(y).slice(-2)}`
}

function round1(v: number) {
  return Math.round(v * 10) / 10
}
function round2(v: number) {
  return Math.round(v * 100) / 100
}

function goalsEqual(a: GoalDTO, b: GoalDTO): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.color === b.color &&
    a.kind === b.kind &&
    a.scope === b.scope &&
    a.portfolioId === b.portfolioId &&
    a.target === b.target &&
    a.targetYear === b.targetYear &&
    a.swr === b.swr &&
    a.yieldAssumed === b.yieldAssumed
  )
}

function buildScratch(): GoalDTO {
  return {
    id: -1,
    name: "Scratchpad",
    color: "#1E40AF",
    kind: "annual_income",
    scope: "combined",
    portfolioId: null,
    target: 30000,
    targetYear: new Date().getFullYear() + 15,
    swr: null,
    yieldAssumed: null,
  }
}
