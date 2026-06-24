"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Icon } from "@/components/icon"
import { FieldLabel } from "@/components/ui/field-label"
import { MoneyInput } from "@/components/money-input"
import { MonthYearPicker } from "@/components/month-year-picker"
import { useEditorForm } from "@/components/use-editor-form"
import { useResolvedLocale } from "@/components/use-resolved-locale"

const PALETTE = [
  "#1E40AF",
  "#059669",
  "#7C3AED",
  "#0F766E",
  "#B45309",
  "#334155",
]

export type PortfolioEditorPayload = {
  name: string
  color: string
  targetMonthlyContribution: number
  startingValue: number
  startingDate: string | null
}

type Mode =
  | { kind: "create" }
  | {
      kind: "edit"
      initial: PortfolioEditorPayload
      entryCount: number
    }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode?: Mode
  onSave: (form: PortfolioEditorPayload) => Promise<void>
}

type FormState = {
  name: string
  color: string
  targetMonthlyContribution: number | null
  startingMode: "fresh" | "carryover"
  startingValue: number | null
  startingDate: { year: number; month: number } | null
}

type ErrorMap = {
  name?: string
  monthlyContribution?: string
  startingValue?: string
  startingDate?: string
}

const EMPTY_FORM: FormState = {
  name: "",
  color: PALETTE[0],
  targetMonthlyContribution: 500,
  startingMode: "fresh",
  startingValue: null,
  startingDate: null,
}

function fromInitial(initial: PortfolioEditorPayload): FormState {
  const hasCarryover =
    initial.startingValue > 0 && initial.startingDate !== null
  const date = initial.startingDate
    ? {
        year: parseInt(initial.startingDate.slice(0, 4), 10),
        month: parseInt(initial.startingDate.slice(5, 7), 10),
      }
    : null
  return {
    name: initial.name,
    color: initial.color,
    targetMonthlyContribution: initial.targetMonthlyContribution,
    startingMode: hasCarryover ? "carryover" : "fresh",
    startingValue: hasCarryover ? initial.startingValue : null,
    startingDate: hasCarryover ? date : null,
  }
}

export function PortfolioEditor({
  open,
  onOpenChange,
  mode = { kind: "create" },
  onSave,
}: Props) {
  const { locale } = useResolvedLocale()
  // No id on the payload — use the portfolio name as the editor key. Renames
  // are infrequent enough that this is a safe identity for "is this a fresh
  // open against a different record".
  const editKey = mode.kind === "edit" ? `edit-${mode.initial.name}` : "create"
  const [form, setForm] = useEditorForm<FormState>(open, editKey, () =>
    mode.kind === "edit" ? fromInitial(mode.initial) : EMPTY_FORM
  )
  const [errors, setErrors] = useState<ErrorMap>({})
  const [submitting, setSubmitting] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [prevOpen, setPrevOpen] = useState(open)

  // Ancillary state (errors / confirm) still needs to be cleared when the
  // dialog reopens — useEditorForm only resets the form itself.
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) {
      setErrors({})
      setShowConfirm(false)
      setSubmitting(false)
    }
  }

  const isEdit = mode.kind === "edit"
  const entryCount = mode.kind === "edit" ? mode.entryCount : 0

  function validate(): {
    ok: boolean
    errors: ErrorMap
    payload?: PortfolioEditorPayload
  } {
    const e: ErrorMap = {}
    const name = form.name.trim()
    if (name === "") e.name = "Name is required."

    if (
      form.targetMonthlyContribution === null ||
      form.targetMonthlyContribution < 0
    ) {
      e.monthlyContribution = "Enter a non-negative amount."
    }

    let startingValue = 0
    let startingDateStr: string | null = null

    if (form.startingMode === "carryover") {
      if (form.startingValue === null || form.startingValue <= 0) {
        e.startingValue = "Enter the prior balance amount."
      } else {
        startingValue = form.startingValue
      }
      if (form.startingDate === null) {
        e.startingDate = "Pick the month you're starting from."
      } else {
        const { year, month } = form.startingDate
        const now = new Date()
        const isFuture =
          year > now.getFullYear() ||
          (year === now.getFullYear() && month > now.getMonth() + 1)
        if (isFuture) {
          e.startingDate = "Starting date can't be in the future."
        } else {
          startingDateStr = `${year}-${String(month).padStart(2, "0")}`
        }
      }
    }

    if (Object.keys(e).length > 0) return { ok: false, errors: e }

    return {
      ok: true,
      errors: {},
      payload: {
        name,
        color: form.color,
        targetMonthlyContribution: form.targetMonthlyContribution ?? 0,
        startingValue,
        startingDate: startingDateStr,
      },
    }
  }

  function startingBalanceChanged(payload: PortfolioEditorPayload): boolean {
    if (mode.kind !== "edit") return false
    return (
      payload.startingValue !== mode.initial.startingValue ||
      payload.startingDate !== mode.initial.startingDate
    )
  }

  async function handleSubmit() {
    const result = validate()
    setErrors(result.errors)
    if (!result.ok || !result.payload) return

    if (
      isEdit &&
      entryCount > 0 &&
      startingBalanceChanged(result.payload) &&
      !showConfirm
    ) {
      setShowConfirm(true)
      return
    }

    setSubmitting(true)
    try {
      await onSave(result.payload)
      onOpenChange(false)
    } catch (err) {
      // Surface API errors at the top of the form rather than swallowing.
      setErrors({
        name:
          err instanceof Error
            ? `Couldn't save: ${err.message}`
            : "Couldn't save the portfolio.",
      })
    } finally {
      setSubmitting(false)
    }
  }

  const formInvalid = (() => {
    if (form.name.trim() === "") return true
    if (
      form.targetMonthlyContribution === null ||
      form.targetMonthlyContribution < 0
    )
      return true
    if (form.startingMode === "carryover") {
      if (form.startingValue === null || form.startingValue <= 0) return true
      if (form.startingDate === null) return true
    }
    return false
  })()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit portfolio" : "New portfolio"}
          </DialogTitle>
        </DialogHeader>

        {showConfirm ? (
          <ConfirmRecompute
            entryCount={entryCount}
            onCancel={() => setShowConfirm(false)}
            onConfirm={handleSubmit}
            submitting={submitting}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div style={{ gridColumn: "1 / -1" }}>
                <FieldLabel>Name</FieldLabel>
                <input
                  className="input-bare"
                  value={form.name}
                  placeholder="e.g. Pension brokerage"
                  aria-invalid={errors.name !== undefined}
                  onChange={(e) => {
                    setForm({ ...form, name: e.target.value })
                    if (errors.name) setErrors({ ...errors, name: undefined })
                  }}
                />
                {errors.name && <FieldError>{errors.name}</FieldError>}
              </div>

              <div>
                <FieldLabel>Monthly contribution</FieldLabel>
                <MoneyInput
                  value={form.targetMonthlyContribution}
                  onChange={(v, err) => {
                    setForm({
                      ...form,
                      targetMonthlyContribution: v,
                    })
                    setErrors({
                      ...errors,
                      monthlyContribution: err ?? undefined,
                    })
                  }}
                  locale={locale}
                  min={0}
                  ariaLabel="Monthly contribution"
                  testId="monthly-contribution-input"
                />
                {errors.monthlyContribution && (
                  <FieldError>{errors.monthlyContribution}</FieldError>
                )}
              </div>

              <div>
                <FieldLabel>Color</FieldLabel>
                <div style={{ display: "flex", gap: 6 }}>
                  {PALETTE.map((c) => (
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

              <div style={{ gridColumn: "1 / -1" }}>
                <div
                  style={{
                    borderTop: "1px solid var(--border)",
                    marginTop: 4,
                    paddingTop: 12,
                  }}
                >
                  <FieldLabel>Starting balance</FieldLabel>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      marginTop: 4,
                    }}
                  >
                    <ModeRadio
                      label="Starting fresh"
                      hint="I'll only track entries from here on."
                      selected={form.startingMode === "fresh"}
                      onSelect={() =>
                        setForm({
                          ...form,
                          startingMode: "fresh",
                          startingValue: null,
                          startingDate: null,
                        })
                      }
                    />
                    <ModeRadio
                      label="Carrying over a prior balance"
                      hint="Anchors gain & CAGR to your real cost basis."
                      selected={form.startingMode === "carryover"}
                      onSelect={() =>
                        setForm({ ...form, startingMode: "carryover" })
                      }
                    />

                    {form.startingMode === "carryover" && (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 8,
                          paddingLeft: 26,
                          marginTop: 4,
                        }}
                      >
                        <div>
                          <FieldLabel>Value</FieldLabel>
                          <MoneyInput
                            value={form.startingValue}
                            onChange={(v, err) => {
                              setForm({ ...form, startingValue: v })
                              setErrors({
                                ...errors,
                                startingValue: err ?? undefined,
                              })
                            }}
                            locale={locale}
                            min={0}
                            allowEmpty
                            placeholder="0,00"
                            ariaLabel="Starting portfolio value"
                            testId="starting-value-input"
                          />
                          {errors.startingValue && (
                            <FieldError>{errors.startingValue}</FieldError>
                          )}
                        </div>
                        <div>
                          <FieldLabel>Anchored to</FieldLabel>
                          <MonthYearPicker
                            value={form.startingDate}
                            onChange={(d) => {
                              setForm({ ...form, startingDate: d })
                              if (errors.startingDate)
                                setErrors({
                                  ...errors,
                                  startingDate: undefined,
                                })
                            }}
                            locale={locale}
                            placeholder="Pick month"
                            testId="starting-date-picker"
                          />
                          {errors.startingDate && (
                            <FieldError>{errors.startingDate}</FieldError>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={formInvalid || submitting}
                title={formInvalid ? firstHint(form) : undefined}
                onClick={handleSubmit}
              >
                <Icon name="check" size={15} />{" "}
                {isEdit ? "Save changes" : "Create portfolio"}
              </button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function firstHint(form: FormState): string {
  if (form.name.trim() === "") return "Enter a name."
  if (
    form.targetMonthlyContribution === null ||
    form.targetMonthlyContribution < 0
  )
    return "Enter a valid monthly contribution."
  if (form.startingMode === "carryover") {
    if (form.startingValue === null || form.startingValue <= 0)
      return "Enter the prior balance amount."
    if (form.startingDate === null)
      return "Pick the month you're starting from."
  }
  return ""
}

function ConfirmRecompute({
  entryCount,
  onCancel,
  onConfirm,
  submitting,
}: {
  entryCount: number
  onCancel: () => void
  onConfirm: () => void
  submitting: boolean
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p
        style={{ fontSize: 13, color: "var(--neutral-700)", lineHeight: 1.55 }}
      >
        Changing the starting balance will recompute gain and CAGR figures
        across all{" "}
        <strong style={{ color: "var(--neutral-800)" }}>
          {entryCount} {entryCount === 1 ? "entry" : "entries"}
        </strong>
        . Existing entries themselves are not modified.
      </p>
      <p style={{ fontSize: 12, color: "var(--neutral-500)" }}>Continue?</p>
      <DialogFooter>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          Back
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onConfirm}
          disabled={submitting}
          data-testid="confirm-recompute"
        >
          <Icon name="check" size={15} /> Yes, save changes
        </button>
      </DialogFooter>
    </div>
  )
}

function ModeRadio({
  label,
  hint,
  selected,
  onSelect,
}: {
  label: string
  hint: string
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      style={{
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        gap: 10,
        alignItems: "flex-start",
        padding: "8px 10px",
        background: selected ? "var(--primary-50, #EFF6FF)" : "transparent",
        border: `1px solid ${selected ? "var(--primary)" : "var(--border)"}`,
        borderRadius: 8,
        textAlign: "left",
        cursor: "pointer",
        width: "100%",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 16,
          height: 16,
          borderRadius: 999,
          border: `2px solid ${selected ? "var(--primary)" : "var(--neutral-400)"}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          marginTop: 1,
        }}
      >
        {selected && (
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: 999,
              background: "var(--primary)",
            }}
          />
        )}
      </span>
      <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span
          style={{ fontSize: 13, fontWeight: 600, color: "var(--neutral-800)" }}
        >
          {label}
        </span>
        <span style={{ fontSize: 11, color: "var(--neutral-500)" }}>
          {hint}
        </span>
      </span>
    </button>
  )
}

function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <div
      role="alert"
      style={{
        fontSize: 11,
        color: "var(--danger)",
        marginTop: 4,
        lineHeight: 1.4,
      }}
    >
      {children}
    </div>
  )
}
