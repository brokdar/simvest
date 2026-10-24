"use client"

import { useEffect, useMemo, useState, type ReactNode } from "react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import {
  useData,
  useDataActions,
  useGoalEvaluator,
} from "@/components/providers/data-provider"
import { ScrollFade } from "@/components/ui/scroll-fade"
import { useEditorIntent } from "@/components/providers/editor-intent"
import {
  goalVerdict,
  planningTrajectories,
  type PlanningTrajectories,
} from "@/lib/goal-evaluator"
import { goalsHeadline } from "@/lib/narrative"
import { ViewHeadline } from "@/components/view-headline"
import { GoalEditor } from "@/components/goal-editor"
import { SolverChart } from "@/components/charts/solver-chart"
import { SliderField } from "@/components/slider-field"
import { useToast } from "@/components/providers/toast"
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
import type { GoalEvaluation } from "@/lib/calc"
import { fmtEUR, fmtNum, fmtPct } from "@/lib/format"
import type {
  GoalDTO,
  GoalKind,
  GoalScope,
  PortfolioDTO,
  SettingsDTO,
} from "@/lib/types"
import { swatch } from "@/lib/palette"
import { DEFAULT_IDENTITY_HEX } from "@/lib/palette"
import { fmtYearShort } from "@/lib/dates"

type ActiveId = number | "scratch" | null

export function PlanningView() {
  const { portfolios, goals, settings, goalEvals } = useData()
  const { addGoal, updateGoal, deleteGoal } = useDataActions()
  const { toast } = useToast()
  const evaluator = useGoalEvaluator()
  const searchParams = useSearchParams()
  const router = useRouter()

  // `?goal=<id>` (from search and notifications) picks the goal to open.
  const goalParam = Number(searchParams.get("goal"))
  const linkedGoal = goals.find((g) => g.id === goalParam) ?? null
  const [activeId, setActiveId] = useState<ActiveId>(() =>
    linkedGoal ? linkedGoal.id : goals.length > 0 ? goals[0].id : "scratch"
  )
  const [local, setLocal] = useState<GoalDTO>(
    () => linkedGoal ?? (goals.length === 0 ? buildScratch() : goals[0])
  )
  // Same render-time pattern as `?new=goal` below: a later link to another
  // goal while already on /planning switches to it; the effect strips it.
  const [prevGoalParam, setPrevGoalParam] = useState(goalParam)
  if (goalParam !== prevGoalParam) {
    setPrevGoalParam(goalParam)
    if (linkedGoal) {
      setActiveId(linkedGoal.id)
      setLocal(linkedGoal)
    }
  }
  useEffect(() => {
    if (searchParams.get("goal")) router.replace("/goals", { scroll: false })
  }, [searchParams, router])
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
    if (wantsNewGoal) router.replace("/goals", { scroll: false })
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

  // P7: the page's one sentence, over the saved goals — the same
  // evaluations (and `goalVerdict` numbers) the tiles below show.
  const headline = useMemo(
    () =>
      goalsHeadline(
        goals
          .filter((g) => goalEvals[g.id])
          .map((g) => ({
            goal: g,
            ev: goalEvals[g.id],
            portfolioName:
              portfolios.find((p) => p.id === g.portfolioId)?.name ?? null,
          }))
      ),
    [goals, goalEvals, portfolios]
  )

  // Evaluator handles scope-aware monthly saving internally — no need to
  // resolve scope at the call site.
  const evaluation = useMemo(
    () => evaluator.evaluate(local),
    [evaluator, local]
  )

  const currentYear = useMemo(() => new Date().getFullYear(), [])
  const horizon = Math.max(local.targetYear - currentYear, 1)
  const projections = useMemo(
    () => planningTrajectories(evaluation, settings, horizon),
    [evaluation, settings, horizon]
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
      returnAssumed: local.returnAssumed,
    })
    toast(`Saved “${local.name}”`)
  }

  function handleRevert() {
    if (!savedGoal) return
    setLocal(savedGoal)
    toast(
      `Back to the saved “${savedGoal.name}” — your tweaks were dropped`,
      "info"
    )
  }

  async function handleDelete() {
    if (!savedGoal) return
    await deleteGoal(savedGoal.id)
    toast(`Deleted “${savedGoal.name}”`, "info")
  }

  function handleEdit() {
    if (!savedGoal) return
    setEditorPrefill({ goal: savedGoal })
    setEditorOpen(true)
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
          <h1 className="title">Goals</h1>
          <div className="muted small" style={{ marginTop: 4 }}>
            Set income, value, or dividend targets — see what it takes to hit
            them.
          </div>
          <ViewHeadline
            text={
              headline ??
              "No goals yet — try some numbers in the Scratchpad below, then save it as your first goal."
            }
            testId="goals-headline"
          />
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
        onEdit={handleEdit}
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
            // Keep the workspace on the edited goal, not its stale copy —
            // otherwise the rename would read as an unsaved modification.
            setLocal({ ...editorPrefill.goal, ...form })
            toast(`Saved “${form.name}”`)
          } else {
            const created = await addGoal(form)
            setActiveId(created.id)
            setLocal(created)
            toast(`Added “${created.name}”`)
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
    <ScrollFade
      fadeBg="var(--bg)"
      style={{
        display: "flex",
        gap: 10,
        overflowX: "auto",
        paddingBottom: 4,
        scrollSnapType: "x mandatory",
        overscrollBehaviorX: "contain",
      }}
      testId="goal-strip"
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
    </ScrollFade>
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
  const verdict = goalVerdict(ev, goal.targetYear)
  const pct = Math.min(1, Math.max(0, ev.pct))
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={`goal-tile-${goal.id}`}
      style={{
        flex: "0 0 200px",
        minWidth: 200,
        padding: "12px 14px",
        background: "var(--surface)",
        border: `1.5px solid ${active ? "var(--primary)" : "var(--border)"}`,
        borderLeft: `4px solid ${swatch(goal.color)}`,
        borderRadius: 10,
        textAlign: "left",
        cursor: "pointer",
        boxShadow: active ? "var(--sh-md)" : "none",
        scrollSnapAlign: "start",
      }}
    >
      <div
        style={{ fontWeight: 700, fontSize: "var(--fs-sm)", marginBottom: 2 }}
      >
        {goal.name}
      </div>
      <div className="muted small" style={{ fontSize: "var(--fs-2xs)" }}>
        {headline} · {scopeLabel}
      </div>
      <div style={{ marginTop: 8 }}>
        <span
          className={`chip ${verdict.onTrack ? "positive" : "warn"}`}
          style={{ fontSize: "var(--fs-2xs)" }}
          data-testid={`goal-verdict-chip-${goal.id}`}
          title={verdict.text}
        >
          {verdict.onTrack
            ? `✓ ${verdict.label}`
            : verdict.fixShort
              ? `+ ${verdict.fixShort}`
              : `△ ${verdict.label}`}
        </span>
      </div>
      <div className="pbar" style={{ marginTop: 8, height: 4 }}>
        <div
          style={{
            width: `${pct * 100}%`,
            background: swatch(goal.color),
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
      data-testid="goal-scratch-tile"
      style={{
        flex: "0 0 180px",
        minWidth: 180,
        padding: "12px 14px",
        background: active ? "var(--surface)" : "transparent",
        border: `1.5px dashed ${active ? "var(--primary)" : "var(--neutral-300, var(--border))"}`,
        borderRadius: 10,
        textAlign: "left",
        cursor: "pointer",
        scrollSnapAlign: "start",
      }}
    >
      <div
        style={{ fontWeight: 700, fontSize: "var(--fs-sm)", marginBottom: 2 }}
      >
        Scratchpad
      </div>
      <div className="muted small" style={{ fontSize: "var(--fs-2xs)" }}>
        Try numbers — nothing is saved.
      </div>
      <div
        className="muted small"
        style={{ fontSize: "var(--fs-2xs)", marginTop: 18 }}
      >
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
  onEdit,
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
  projections: PlanningTrajectories
  horizon: number
  onSave: () => void | Promise<void>
  onRevert: () => void
  onDelete: () => void | Promise<void>
  onEdit: () => void
  onPromoteScratch: () => void
}) {
  const verdict = goalVerdict(evaluation, local.targetYear)
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
                background: swatch(local.color),
              }}
            />
            <span style={{ fontSize: "var(--fs-xl)", fontWeight: 700 }}>
              {isScratch ? "Scratchpad" : local.name}
            </span>
            <span className="muted small" style={{ fontSize: "var(--fs-xs)" }}>
              · {isScratch ? "no goal attached" : "solving"}
            </span>
            {dirty && (
              <span
                className="chip warn"
                style={{ fontSize: "var(--fs-2xs)" }}
                data-testid="workspace-modified-chip"
              >
                ◆ not saved yet
              </span>
            )}
          </div>
          <div
            className="muted small"
            style={{ marginTop: 4, fontSize: "var(--fs-xs)" }}
          >
            {headlineFor(local)} · {scopeLabel}
            {dirty && savedGoal && (
              <>
                {" · "}
                <span style={{ color: "var(--neutral-600)" }}>
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
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onEdit}
                data-testid="workspace-edit"
              >
                <Icon name="edit" size={14} /> Edit goal
              </button>
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
            </>
          )}
        </div>
      </div>

      <div
        className={`planning-verdict ${verdict.onTrack ? "on-track" : "behind"}`}
        data-testid="planning-verdict"
      >
        {verdict.onTrack || !verdict.fix ? (
          <>
            <strong>{verdict.label}</strong> · {verdict.reach}
            {evaluation.contributionSet
              ? ` at your ${fmtEUR(evaluation.monthlySaving, { decimals: 0 })}/mo`
              : " with no contribution set"}
          </>
        ) : (
          <>
            <strong>{verdict.fix}</strong>
            {verdict.fixTotal ? ` — that’s ${verdict.fixTotal}` : ""}.{" "}
            {evaluation.contributionSet
              ? `At today’s ${fmtEUR(evaluation.monthlySaving, { decimals: 0 })}/mo it`
              : "With no contribution set it"}{" "}
            {evaluation.projectedYear !== null
              ? verdict.reach
              : `isn’t reached in the next 40 years`}
            .
          </>
        )}
      </div>

      {/* KPI tiles */}
      <KpiTiles evaluation={evaluation} goal={local} portfolios={portfolios} />

      {/* Two-column body: assumptions (inputs) beside the trajectory chart
          (the page's main output). Below 640px this collapses to a single
          column, reordered so the chart — the thing the user came here to
          read — appears right after the KPI tiles, with the sliders that
          tune it below. */}
      <div className="planning-body">
        <AssumptionsPanel
          local={local}
          setLocal={setLocal}
          settings={settings}
          portfolios={portfolios}
          evaluation={evaluation}
        />
        <div className="planning-chart-col">
          <div
            style={{
              fontSize: "var(--fs-xs)",
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
            monthlySaving={evaluation.monthlySaving}
            requiredMonthly={evaluation.requiredMonthly}
          />
        </div>
      </div>

      <GlobalAssumptionsEcho settings={settings} kind={local.kind} />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// KPI tiles
// ────────────────────────────────────────────────────────────────────────────

function KpiTiles({
  evaluation,
  goal,
  portfolios,
}: {
  evaluation: GoalEvaluation
  goal: GoalDTO
  portfolios: PortfolioDTO[]
}) {
  const kind = goal.kind
  const onTrack = evaluation.onTrack
  const verdict = goalVerdict(evaluation, goal.targetYear)
  // C4: say where "your €0/mo" comes from and link to where it's set — the
  // per-account contribution on Settings (or their sum, for a combined goal).
  const account =
    goal.scope === "portfolio"
      ? portfolios.find((p) => p.id === goal.portfolioId)
      : undefined
  const today = fmtEUR(evaluation.monthlySaving, { decimals: 0 })
  const gap = evaluation.requiredMonthly - evaluation.monthlySaving
  const contributionLink = (
    <Link
      href={
        account
          ? `/settings#contribution-${account.id}`
          : "/settings#portfolios"
      }
      style={{ color: "var(--primary)", fontWeight: 600 }}
      data-testid="kpi-required-monthly-link"
    >
      {evaluation.monthlySaving > 0
        ? "Change your monthly contribution →"
        : "Set a monthly contribution →"}
    </Link>
  )
  // C5: the portfolio target is a division — show it.
  const yieldPct = evaluation.yieldUsed?.value
  const annualDividends =
    kind === "dividend_monthly"
      ? evaluation.targetValue * 12
      : evaluation.targetValue
  return (
    <div className="planning-kpis">
      <KpiTile
        label="Needed each month"
        accent={onTrack ? "positive" : "primary"}
        value={fmtEUR(evaluation.requiredMonthly)}
        sub={
          onTrack ? (
            <>✓ you put in {today}/mo today — enough to get there</>
          ) : !evaluation.contributionSet ? (
            <>
              {gap >= 0.5 ? `${fmtEUR(gap, { decimals: 0 })}/mo more. ` : ""}
              No monthly contribution is set for{" "}
              {account ? account.name : "your accounts"} yet. {contributionLink}
            </>
          ) : (
            <>
              {gap >= 0.5
                ? `${fmtEUR(gap, { decimals: 0 })}/mo more than `
                : ""}
              the {today}/mo you put into{" "}
              {account ? account.name : "all your accounts"} today.{" "}
              {contributionLink}
            </>
          )
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
                ? `${fmtNum(evaluation.projectedYear - new Date().getFullYear() || 0, 1)} y`
                : "—"
            }
            sub={`At today’s pace: ${verdict.reach}`}
            testId="kpi-time"
          />
        </>
      )}
      {kind === "annual_income" && (
        <>
          <KpiTile
            label="Portfolio target"
            value={fmtEUR(evaluation.portfolioTargetValue, { compact: true })}
            sub={
              evaluation.swrUsed != null
                ? `= ${fmtEUR(evaluation.inflatedTargetValue, { compact: true })}/yr ÷ ${fmtPct(evaluation.swrUsed)} safe withdrawal rate — the share you’d take out each year`
                : "The pot that pays this income"
            }
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
            sub={
              yieldPct
                ? `= ${fmtEUR(annualDividends, { decimals: 0 })}/yr in dividends ÷ ${fmtPct(yieldPct, 2)} assumed yield`
                : `for ${fmtEUR(annualDividends, { decimals: 0 })}/yr in dividends`
            }
            testId="kpi-portfolio-target"
          />
          <KpiTile
            label="Assumed yield"
            value={fmtPct(evaluation.yieldUsed?.value, 2)}
            sub={
              evaluation.yieldUsed?.source === "override"
                ? "Your own pick for this goal"
                : evaluation.yieldUsed?.source === "derived"
                  ? "Last 12 months’ dividends ÷ today’s value"
                  : "A typical yield — no payouts recorded yet"
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
  sub: ReactNode
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
          fontSize: "var(--fs-2xs)",
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
          fontSize: "var(--fs-4xl)",
          fontWeight: 700,
          fontFamily: "var(--font-head)",
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>
      <div
        className="muted small"
        style={{ fontSize: "var(--fs-2xs)", marginTop: 2 }}
      >
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
    <div className="planning-assumptions">
      <div
        style={{
          fontSize: "var(--fs-xs)",
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
              ? `Safe withdrawal rate (your default ${fmtPct(settings.defaultSwr)})`
              : "Safe withdrawal rate (this goal only)"
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
      {local.kind === "annual_income" && (
        <div
          className="muted small"
          style={{ fontSize: "var(--fs-2xs)", marginTop: 2 }}
          data-testid="planning-swr-explainer"
        >
          The share of the pot you’d take out each year in retirement.{" "}
          {fmtPct(local.swr ?? settings.defaultSwr)} of{" "}
          {fmtEUR(1_000_000, { compact: true })} is{" "}
          {fmtEUR(((local.swr ?? settings.defaultSwr) / 100) * 1_000_000, {
            compact: true,
          })}
          /yr — lower is safer, but needs a bigger pot.
        </div>
      )}

      {(local.kind === "dividend_annual" ||
        local.kind === "dividend_monthly") && (
        <SliderField
          label={
            evaluation.yieldUsed?.source === "override"
              ? "Dividend yield (this goal only)"
              : evaluation.yieldUsed?.source === "derived"
                ? "Dividend yield (your last 12 months)"
                : "Dividend yield (typical — no payouts yet)"
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
        <div
          className="muted small"
          style={{ fontSize: "var(--fs-2xs)", marginTop: 10 }}
        >
          Scoped to <ScopeLink portfolios={portfolios} id={local.portfolioId} />
          .
        </div>
      )}

      {/* The expected return drives the trajectory, so it says where it comes
          from and can be overridden like the yield (N3) — a goal scoped to a
          small, shrinking account shouldn't be stuck with its −5,6%/yr. */}
      <SliderField
        label={
          evaluation.expectedReturnSource === "override"
            ? "Expected return (your override)"
            : evaluation.expectedReturnSource === "derived"
              ? "Expected return (your record)"
              : "Expected return (assumed)"
        }
        value={evaluation.expectedReturn}
        kind="percent"
        sliderMin={0}
        sliderMax={12}
        step={0.1}
        decimals={1}
        typedMin={-20}
        typedMax={30}
        onChange={(v) => setLocal({ ...local, returnAssumed: round1(v) })}
        testId="planning-slider-return"
      />
      <div
        className="muted small"
        style={{ fontSize: "var(--fs-2xs)", marginTop: 2 }}
        data-testid="planning-return-source"
      >
        {returnSourceText(evaluation)}
        {local.returnAssumed != null && (
          <>
            {" "}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ padding: "0 4px", minHeight: 0, height: "auto" }}
              onClick={() => setLocal({ ...local, returnAssumed: null })}
              data-testid="planning-return-reset"
            >
              Use my record
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/** The goal's account, as a link that opens it on the Overview. */
function ScopeLink({
  portfolios,
  id,
}: {
  portfolios: PortfolioDTO[]
  id: number | null
}) {
  const { setSelectedPortfolio } = useDataActions()
  const p = portfolios.find((x) => x.id === id)
  if (!p) return <strong>—</strong>
  return (
    <Link
      href="/"
      onClick={() => setSelectedPortfolio(p.id)}
      style={{ color: "var(--primary)", fontWeight: 600 }}
      data-testid="planning-scope-link"
    >
      {p.name}
    </Link>
  )
}

// ────────────────────────────────────────────────────────────────────────────
// Read-only echo of global settings
// ────────────────────────────────────────────────────────────────────────────

function GlobalAssumptionsEcho({
  settings,
  kind,
}: {
  settings: SettingsDTO
  kind: GoalKind
}) {
  return (
    <div
      style={{
        marginTop: 16,
        padding: "10px 14px",
        borderRadius: 8,
        background: "var(--neutral-50)",
        border: "1px solid var(--border)",
        display: "flex",
        gap: 16,
        flexWrap: "wrap",
        alignItems: "center",
        fontSize: "var(--fs-xs)",
      }}
      data-testid="global-assumptions-echo"
    >
      <span className="muted">Shared with all goals:</span>
      <Echo label="Inflation" value={fmtPct(settings.inflation)} />
      <Echo label="Conservative" value={fmtPct(settings.conservativeReturn)} />
      <Echo label="Optimistic" value={fmtPct(settings.optimisticReturn)} />
      {/* C2: the withdrawal rate only matters for an income goal. */}
      {kind === "annual_income" && (
        <Echo
          label="Safe withdrawal rate"
          value={fmtPct(settings.defaultSwr)}
        />
      )}
      <Link
        href="/settings"
        className="tap-pad"
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
      return `${fmtEUR(g.target, { compact: true })} · ${fmtYearShort(g.targetYear)}`
    case "annual_income":
      return `${fmtEUR(g.target, { compact: true })}/yr · ${fmtYearShort(g.targetYear)}`
    case "dividend_annual":
      return `${fmtEUR(g.target, { compact: true })} divs/yr · ${fmtYearShort(g.targetYear)}`
    case "dividend_monthly":
      return `${fmtEUR(g.target, { compact: true })} divs/mo · ${fmtYearShort(g.targetYear)}`
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
    a.yieldAssumed === b.yieldAssumed &&
    a.returnAssumed === b.returnAssumed
  )
}

function buildScratch(): GoalDTO {
  return {
    id: -1,
    name: "Scratchpad",
    color: DEFAULT_IDENTITY_HEX,
    kind: "annual_income",
    scope: "combined",
    portfolioId: null,
    target: 30000,
    targetYear: new Date().getFullYear() + 15,
    swr: null,
    yieldAssumed: null,
    returnAssumed: null,
  }
}

/**
 * "Deutsche Bank’s own return, −5,6%/yr over 39 entries" — where the
 * trajectory's expected return comes from, in one sentence (N3).
 */
function returnSourceText(ev: GoalEvaluation): string {
  const h = ev.historicalReturn
  const whose =
    ev.returnScopeName === "Combined"
      ? "All your accounts’ combined return"
      : `${ev.returnScopeName}’s own return`
  const record =
    h.source === "assumed"
      ? `${ev.returnScopeName === "Combined" ? "Your accounts have" : `${ev.returnScopeName} has`} too little history (${ev.returnEntryCount} ${ev.returnEntryCount === 1 ? "entry" : "entries"}), so 7%/yr is assumed`
      : `${whose}, ${fmtPct(h.value, 1)}/yr over ${ev.returnEntryCount} entries`
  return ev.expectedReturnSource === "override"
    ? `Your override. For reference: ${record.charAt(0).toLowerCase()}${record.slice(1)}.`
    : `${record}. Drag or type to try another rate; Save keeps it with this goal.`
}
