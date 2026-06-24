"use client"

import { useMemo } from "react"
import { useEditorForm } from "@/components/use-editor-form"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { SliderRow } from "@/components/slider-row"
import { Icon } from "@/components/icon"
import { FieldLabel } from "@/components/ui/field-label"
import { useData, useGoalEvaluator } from "@/components/providers/data-provider"
import { fmtEUR, fmtNum } from "@/lib/format"
import { MoneyInput } from "@/components/money-input"
import { useResolvedLocale } from "@/components/use-resolved-locale"
import type { GoalDTO, GoalKind, GoalScope } from "@/lib/types"

const GOAL_COLORS = ["#1E40AF", "#059669", "#7C3AED", "#0F766E", "#B45309"]

type Form = {
  name: string
  color: string
  kind: GoalKind
  scope: GoalScope
  portfolioId: number | null
  target: number
  targetYear: number
  swr: number | null
  yieldAssumed: number | null
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  goal?: GoalDTO | null
  defaultKind?: GoalKind
  defaultScope?: GoalScope
  defaultPortfolioId?: number | null
  onSave: (form: Form) => Promise<void>
}

const KIND_OPTIONS: { value: GoalKind; label: string; sub: string }[] = [
  { value: "portfolio_value", label: "Portfolio value", sub: "Reach €X" },
  { value: "annual_income", label: "Yearly income", sub: "Live on €X/yr" },
  { value: "dividend_annual", label: "Yearly dividends", sub: "Earn €X/yr" },
  { value: "dividend_monthly", label: "Monthly dividends", sub: "Earn €X/mo" },
]

export function GoalEditor({
  open,
  onOpenChange,
  goal,
  defaultKind,
  defaultScope,
  defaultPortfolioId,
  onSave,
}: Props) {
  const { portfolios, settings } = useData()
  const evaluator = useGoalEvaluator()
  const { locale } = useResolvedLocale()
  const isEdit = !!goal
  const [form, setForm] = useEditorForm<Form>(
    open,
    goal ? goal.id : "new",
    () => buildInitial(goal, { defaultKind, defaultScope, defaultPortfolioId })
  )

  // Evaluate the in-flight form as a draft goal. Reuses the same evaluator
  // backing the planning view and goal tiles, so the editor's preview cannot
  // drift from the values shown elsewhere.
  const evaluation = useMemo(
    () => evaluator.evaluate({ ...form, id: goal?.id ?? -1 } as GoalDTO),
    [evaluator, form, goal?.id]
  )

  const derivedYield = useMemo(
    () =>
      evaluator.estimateYield({
        scope:
          form.scope === "portfolio" && form.portfolioId != null
            ? form.portfolioId
            : "combined",
      }),
    [evaluator, form.scope, form.portfolioId]
  )

  const effectiveYield =
    form.yieldAssumed != null
      ? form.yieldAssumed
      : (evaluation.yieldUsed?.value ?? derivedYield.value)
  const effectiveSwr = evaluation.swrUsed ?? settings.defaultSwr

  // Helper text — the anti-misinterpretation layer. Numbers come straight
  // from the evaluator so this prose stays consistent with planning-view KPIs.
  const helperText = useMemo(() => {
    const targetPortfolio = fmtEUR(evaluation.portfolioTargetValue, {
      compact: true,
    })
    switch (form.kind) {
      case "portfolio_value":
        return `Nominal — €${fmtAmount(form.target)} on screen by ${form.targetYear}.`
      case "annual_income":
        return `In today's money — equivalent to €${fmtAmount(evaluation.inflatedTargetValue)}/yr in ${form.targetYear} at ${settings.inflation}% inflation. Requires a ${targetPortfolio} portfolio at ${effectiveSwr.toFixed(1)}% SWR.`
      case "dividend_annual":
        return `Nominal — requires a ${targetPortfolio} portfolio at ${effectiveYield.toFixed(1)}% yield.`
      case "dividend_monthly":
        return `Nominal — requires a ${targetPortfolio} portfolio at ${effectiveYield.toFixed(1)}% yield (€${fmtAmount(form.target * 12)}/yr).`
    }
  }, [form, settings.inflation, evaluation, effectiveSwr, effectiveYield])

  const valueFieldMeta = VALUE_FIELD_META[form.kind]

  const valid =
    form.name.trim().length > 0 &&
    form.target > 0 &&
    form.targetYear >= new Date().getFullYear() &&
    (form.scope === "combined" || form.portfolioId != null)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle data-testid="goal-editor-title">
            {isEdit ? "Edit goal" : "New goal"}
          </DialogTitle>
        </DialogHeader>

        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <FieldLabel>Kind</FieldLabel>
            <div
              role="radiogroup"
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
              }}
              data-testid="goal-editor-kind"
            >
              {KIND_OPTIONS.map((opt) => {
                const active = form.kind === opt.value
                return (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={active}
                    key={opt.value}
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        kind: opt.value,
                        // Clear kind-irrelevant fields so they don't leak.
                        swr: opt.value === "annual_income" ? f.swr : null,
                        yieldAssumed: opt.value.startsWith("dividend_")
                          ? f.yieldAssumed
                          : null,
                      }))
                    }
                    style={{
                      padding: "10px 12px",
                      borderRadius: 8,
                      border: `1.5px solid ${active ? "var(--primary)" : "var(--border)"}`,
                      background: active
                        ? "var(--primary-50, #eef2ff)"
                        : "white",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700 }}>
                      {opt.label}
                    </div>
                    <div
                      className="muted small"
                      style={{ fontSize: 11, marginTop: 2 }}
                    >
                      {opt.sub}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <FieldLabel>Scope</FieldLabel>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <ScopeRadio
                label="Combined"
                sub="All portfolios together"
                active={form.scope === "combined"}
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    scope: "combined",
                    portfolioId: null,
                  }))
                }
              />
              <ScopeRadio
                label="Per portfolio"
                sub="One specific portfolio"
                active={form.scope === "portfolio"}
                onClick={() =>
                  setForm((f) => ({
                    ...f,
                    scope: "portfolio",
                    portfolioId: f.portfolioId ?? portfolios[0]?.id ?? null,
                  }))
                }
              />
            </div>
            {form.scope === "portfolio" && (
              <select
                className="input-bare"
                style={{ marginTop: 8 }}
                value={form.portfolioId ?? ""}
                onChange={(e) =>
                  setForm({ ...form, portfolioId: Number(e.target.value) })
                }
                data-testid="goal-editor-portfolio-select"
              >
                {portfolios.length === 0 && (
                  <option value="">No portfolios yet</option>
                )}
                {portfolios.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            <div style={{ gridColumn: "1 / -1" }}>
              <FieldLabel>Name</FieldLabel>
              <input
                className="input-bare"
                value={form.name}
                placeholder={valueFieldMeta.namePlaceholder}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <FieldLabel>{valueFieldMeta.label}</FieldLabel>
              <MoneyInput
                value={form.target === 0 ? null : form.target}
                onChange={(v) => setForm({ ...form, target: v ?? 0 })}
                locale={locale}
                min={0}
                ariaLabel={`${valueFieldMeta.label} in euros`}
                testId="goal-editor-target"
              />
              {valueFieldMeta.cadence && (
                <div
                  className="muted small"
                  style={{ marginTop: 4 }}
                  data-testid="goal-editor-target-cadence"
                >
                  {valueFieldMeta.cadence}
                </div>
              )}
            </div>
            <div>
              <FieldLabel>Target year</FieldLabel>
              <input
                className="input-bare"
                type="number"
                value={form.targetYear}
                onChange={(e) =>
                  setForm({
                    ...form,
                    targetYear: parseInt(e.target.value, 10) || 0,
                  })
                }
                data-testid="goal-editor-target-year"
              />
            </div>
            <div
              style={{
                gridColumn: "1 / -1",
                fontSize: 12,
                color: "var(--neutral-500)",
                background: "var(--neutral-50, #f8fafc)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                padding: "8px 10px",
                lineHeight: 1.45,
              }}
              data-testid="goal-editor-helper"
            >
              {helperText}
            </div>
          </div>

          {form.kind === "annual_income" && (
            <div>
              <FieldLabel>
                Safe withdrawal rate
                {form.swr == null && (
                  <span
                    className="muted small"
                    style={{ marginLeft: 6, fontWeight: 400 }}
                  >
                    (default from Settings: {settings.defaultSwr.toFixed(1)}%)
                  </span>
                )}
              </FieldLabel>
              <SliderRow
                label="SWR"
                value={effectiveSwr}
                min={2.5}
                max={6}
                step={0.1}
                suffix="%"
                onChange={(v) => setForm({ ...form, swr: round1(v) })}
                testId="goal-editor-swr"
              />
              {form.swr != null && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setForm({ ...form, swr: null })}
                  style={{ fontSize: 11, marginTop: 4 }}
                >
                  Reset to Settings default
                </button>
              )}
            </div>
          )}

          {(form.kind === "dividend_annual" ||
            form.kind === "dividend_monthly") && (
            <div>
              <FieldLabel>
                Assumed yield
                <span
                  className="muted small"
                  style={{ marginLeft: 6, fontWeight: 400 }}
                >
                  {form.yieldAssumed != null
                    ? "(your override)"
                    : derivedYield.source === "derived"
                      ? `(trailing 12m: ${derivedYield.value.toFixed(2)}%)`
                      : `(default ${derivedYield.value.toFixed(1)}% — no payout history)`}
                </span>
              </FieldLabel>
              <SliderRow
                label="Yield"
                value={effectiveYield}
                min={0.5}
                max={8}
                step={0.1}
                suffix="%"
                onChange={(v) => setForm({ ...form, yieldAssumed: round2(v) })}
                testId="goal-editor-yield"
              />
              {form.yieldAssumed != null && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setForm({ ...form, yieldAssumed: null })}
                  style={{ fontSize: 11, marginTop: 4 }}
                >
                  Reset to trailing
                </button>
              )}
            </div>
          )}

          <div>
            <FieldLabel>Color</FieldLabel>
            <div style={{ display: "flex", gap: 6 }}>
              {GOAL_COLORS.map((c) => (
                <button
                  type="button"
                  key={c}
                  onClick={() => setForm({ ...form, color: c })}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: c,
                    border: `2px solid ${form.color === c ? "var(--neutral-800)" : "transparent"}`,
                    cursor: "pointer",
                  }}
                  aria-label={`Color ${c}`}
                />
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!valid}
            onClick={async () => {
              await onSave(form)
              onOpenChange(false)
            }}
            data-testid="goal-editor-save"
          >
            <Icon name="check" size={15} />{" "}
            {isEdit ? "Save changes" : "Create goal"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * `cadence` renders as a muted caption directly below the money input,
 * disambiguating yearly vs monthly targets for the dividend kinds and the
 * annual-income kind. Rendering it as a sibling (rather than overlaying an
 * absolutely-positioned suffix inside the input) avoids overlapping long
 * values like `€ 120.000` and keeps screen-reader output in document order.
 * `null` means "no cadence to clarify" — the label is self-describing.
 */
const VALUE_FIELD_META: Record<
  GoalKind,
  { label: string; cadence: string | null; namePlaceholder: string }
> = {
  portfolio_value: {
    label: "Target portfolio value",
    cadence: null,
    namePlaceholder: "e.g. First million",
  },
  annual_income: {
    label: "Target yearly income (today's money)",
    cadence: "per year",
    namePlaceholder: "e.g. Coast FI",
  },
  dividend_annual: {
    label: "Target annual dividends",
    cadence: "per year",
    namePlaceholder: "e.g. Dividend income",
  },
  dividend_monthly: {
    label: "Target monthly dividends",
    cadence: "per month",
    namePlaceholder: "e.g. Monthly dividends",
  },
}

function buildInitial(
  goal: GoalDTO | null | undefined,
  defaults: {
    defaultKind?: GoalKind
    defaultScope?: GoalScope
    defaultPortfolioId?: number | null
  }
): Form {
  if (goal) {
    return {
      name: goal.name,
      color: goal.color,
      kind: goal.kind,
      scope: goal.scope,
      portfolioId: goal.portfolioId,
      target: goal.target,
      targetYear: goal.targetYear,
      swr: goal.swr,
      yieldAssumed: goal.yieldAssumed,
    }
  }
  const kind = defaults.defaultKind ?? "annual_income"
  return {
    name: "",
    color: GOAL_COLORS[0],
    kind,
    scope: defaults.defaultScope ?? "combined",
    portfolioId: defaults.defaultPortfolioId ?? null,
    target: defaultTargetFor(kind),
    targetYear: new Date().getFullYear() + 15,
    swr: kind === "annual_income" ? null : null, // null = use settings default
    yieldAssumed: null,
  }
}

function defaultTargetFor(kind: GoalKind): number {
  switch (kind) {
    case "portfolio_value":
      return 1_000_000
    case "annual_income":
      return 30_000
    case "dividend_annual":
      return 12_000
    case "dividend_monthly":
      return 1_000
  }
}

function round1(v: number) {
  return Math.round(v * 10) / 10
}
function round2(v: number) {
  return Math.round(v * 100) / 100
}
function fmtAmount(n: number) {
  // Defers to the active locale set by <LocaleSync>, so the goal helper
  // text uses the same separator as the rest of the app.
  return fmtNum(Math.round(n), 0)
}

function ScopeRadio({
  label,
  sub,
  active,
  onClick,
}: {
  label: string
  sub: string
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      style={{
        flex: 1,
        minWidth: 140,
        padding: "8px 12px",
        borderRadius: 8,
        border: `1.5px solid ${active ? "var(--primary)" : "var(--border)"}`,
        background: active ? "var(--primary-50, #eef2ff)" : "white",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 600 }}>{label}</div>
      <div className="muted small" style={{ fontSize: 11, marginTop: 2 }}>
        {sub}
      </div>
    </button>
  )
}
