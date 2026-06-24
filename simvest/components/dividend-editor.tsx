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
import { useDataActions } from "@/components/providers/data-provider"
import {
  DividendHoldingField,
  type HoldingDraft,
} from "@/components/dividend-holding-field"
import { useEditorForm } from "@/components/use-editor-form"
import {
  IncomeEventForm,
  withPersistedTaxSign,
  type IncomeEventFormValue,
} from "@/components/income-event-form"
import { todayISO } from "@/lib/dates"
import {
  COMBINED_PORTFOLIO_ID,
  ISIN_RE,
  resolveDefaultPortfolio,
  type HoldingDTO,
  type IncomeEventDTO,
  type PortfolioDTO,
} from "@/lib/types"

/**
 * Holding-selection sub-state, kept separate from `IncomeEventFormValue` (which
 * the interest editor shares) so the "create a holding inline" concern doesn't
 * leak into interest. `mode === "new"` means the `draft` is persisted on save
 * and its id backfilled into the dividend.
 */
type HoldingFieldState = HoldingDraft & { mode: "existing" | "new" }

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  event?: IncomeEventDTO | null
  portfolios: PortfolioDTO[]
  holdings: HoldingDTO[]
  defaultPortfolioId?: number
  onSave: (form: IncomeEventFormValue) => Promise<void>
}

export function DividendEditor({
  open,
  onOpenChange,
  event,
  portfolios,
  holdings,
  defaultPortfolioId,
  onSave,
}: Props) {
  const isEdit = !!event
  const { addHolding } = useDataActions()
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useEditorForm<IncomeEventFormValue>(
    open,
    event ? event.id : "new",
    () => buildInitial(event, holdings, defaultPortfolioId)
  )
  const [holdingField, setHoldingField] = useEditorForm<HoldingFieldState>(
    open,
    event ? event.id : "new",
    () => buildInitialHoldingField(event, holdings, defaultPortfolioId)
  )

  const portfolioHoldings = holdings.filter(
    (h) => h.portfolioId === form.portfolioId
  )
  // With no holdings to pick from, the only valid choice is to create one.
  const mode: "existing" | "new" =
    portfolioHoldings.length === 0 ? "new" : holdingField.mode

  const isinTrimmed = holdingField.isin.trim().toUpperCase()
  const isinValid = isinTrimmed === "" || ISIN_RE.test(isinTrimmed)
  const holdingValid =
    mode === "existing"
      ? (form.holdingId ?? 0) > 0
      : holdingField.name.trim().length > 0 && isinValid

  // `form.tax` is the **positive** magnitude entered by the user (see
  // IncomeEventFormValue). The DB stores tax as ≤ 0; the save boundary
  // below negates it.
  const canSave =
    holdingValid &&
    /^\d{4}-\d{2}-\d{2}$/.test(form.paidDate) &&
    form.amount > 0 &&
    form.tax >= 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[480px]"
        data-testid="dividend-editor-dialog"
      >
        <DialogHeader>
          <DialogTitle data-testid="dividend-editor-title">
            {isEdit ? "Edit dividend" : "Record dividend"}
          </DialogTitle>
        </DialogHeader>

        <IncomeEventForm
          kind="dividend"
          form={form}
          setForm={setForm}
          portfolios={portfolios}
          holdings={holdings}
          secondField={
            <DividendHoldingField
              portfolioHoldings={portfolioHoldings}
              mode={mode}
              onModeChange={(next) =>
                setHoldingField({ ...holdingField, mode: next })
              }
              holdingId={form.holdingId}
              onHoldingIdChange={(id) => setForm({ ...form, holdingId: id })}
              draft={{
                name: holdingField.name,
                type: holdingField.type,
                isin: holdingField.isin,
              }}
              onDraftChange={(d) => setHoldingField({ ...holdingField, ...d })}
            />
          }
        />

        {submitError && (
          <div
            role="alert"
            className="small"
            style={{ color: "var(--neg)" }}
            data-testid="dividend-editor-error"
          >
            {submitError}
          </div>
        )}

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
            disabled={!canSave || submitting}
            aria-busy={submitting}
            onClick={async () => {
              // Guard against a double-click firing two create-holding round
              // trips before the dialog closes (each would persist a duplicate
              // holding — the route has no idempotency key).
              if (submitting) return
              setSubmitting(true)
              setSubmitError(null)
              try {
                // In "new" mode the holding doesn't exist yet — persist it
                // first, then record the dividend against its fresh id.
                let holdingId = form.holdingId
                if (mode === "new") {
                  const created = await addHolding({
                    portfolioId: form.portfolioId,
                    name: holdingField.name.trim(),
                    type: holdingField.type,
                    isin: isinTrimmed || null,
                  })
                  holdingId = created.id
                }
                await onSave(withPersistedTaxSign({ ...form, holdingId }))
                onOpenChange(false)
              } catch (err) {
                setSubmitError(
                  err instanceof Error ? err.message : "Failed to save"
                )
              } finally {
                setSubmitting(false)
              }
            }}
            data-testid="dividend-editor-submit"
          >
            <Icon name="check" size={15} />{" "}
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Add dividend"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function buildInitial(
  event: IncomeEventDTO | null | undefined,
  holdings: HoldingDTO[],
  defaultPortfolioId?: number
): IncomeEventFormValue {
  if (event) {
    return {
      portfolioId: event.portfolioId,
      holdingId: event.holdingId,
      paidDate: event.paidDate,
      amount: event.amount,
      // DB stores tax as ≤ 0; the form holds it as a positive magnitude
      // because the input is non-negative (re-negated on save).
      tax: Math.abs(event.tax),
      note: event.note,
    }
  }
  const fallbackPortfolio = holdings[0]?.portfolioId ?? COMBINED_PORTFOLIO_ID
  const portfolioId = resolveDefaultPortfolio(
    defaultPortfolioId,
    fallbackPortfolio
  )
  const firstHolding = holdings.find((h) => h.portfolioId === portfolioId)
  return {
    portfolioId,
    holdingId: firstHolding?.id ?? 0,
    paidDate: todayISO(),
    amount: 0,
    tax: 0,
    note: "",
  }
}

function buildInitialHoldingField(
  event: IncomeEventDTO | null | undefined,
  holdings: HoldingDTO[],
  defaultPortfolioId?: number
): HoldingFieldState {
  // Editing an existing dividend always starts on its existing holding. For a
  // new dividend, default to "new" only when the target portfolio has nothing
  // to pick from yet.
  const initial = buildInitial(event, holdings, defaultPortfolioId)
  const hasHoldings = holdings.some(
    (h) => h.portfolioId === initial.portfolioId
  )
  return {
    mode: event || hasHoldings ? "existing" : "new",
    name: "",
    type: "etf",
    isin: "",
  }
}
