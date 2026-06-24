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
import { useEditorForm } from "@/components/use-editor-form"
import {
  IncomeEventForm,
  withPersistedTaxSign,
  type IncomeEventFormValue,
} from "@/components/income-event-form"
import { todayISO } from "@/lib/dates"
import {
  COMBINED_PORTFOLIO_ID,
  resolveDefaultPortfolio,
  type IncomeEventDTO,
  type PortfolioDTO,
} from "@/lib/types"

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  event?: IncomeEventDTO | null
  portfolios: PortfolioDTO[]
  defaultPortfolioId?: number
  onSave: (form: IncomeEventFormValue) => Promise<void>
}

export function InterestEditor({
  open,
  onOpenChange,
  event,
  portfolios,
  defaultPortfolioId,
  onSave,
}: Props) {
  const isEdit = !!event
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useEditorForm<IncomeEventFormValue>(
    open,
    event ? event.id : "new",
    () => buildInitial(event, portfolios, defaultPortfolioId)
  )

  const canSave =
    /^\d{4}-\d{2}-\d{2}$/.test(form.paidDate) &&
    form.amount > 0 &&
    Number.isFinite(form.portfolioId) &&
    form.portfolioId > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[480px]"
        data-testid="interest-editor-dialog"
      >
        <DialogHeader>
          <DialogTitle data-testid="interest-editor-title">
            {isEdit ? "Edit interest" : "Record interest"}
          </DialogTitle>
        </DialogHeader>

        <IncomeEventForm
          kind="interest"
          form={form}
          setForm={setForm}
          portfolios={portfolios}
          holdings={[]}
          secondField={
            <div>
              <FieldLabel>Source</FieldLabel>
              <input
                className="input-bare"
                value="Broker-paid interest"
                disabled
                data-testid="income-event-source"
              />
            </div>
          }
        />

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
              // Guard against a double-click persisting two interest events
              // before the dialog closes.
              if (submitting) return
              setSubmitting(true)
              try {
                // Tax is hardcoded to 0 today (no interest-tax field rendered),
                // but route through the helper anyway so this stays correct if
                // a "withholding on bond coupon" field is added later.
                await onSave(withPersistedTaxSign(form))
                onOpenChange(false)
              } finally {
                setSubmitting(false)
              }
            }}
            data-testid="interest-editor-submit"
          >
            <Icon name="check" size={15} />{" "}
            {submitting ? "Saving…" : isEdit ? "Save changes" : "Add interest"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function buildInitial(
  event: IncomeEventDTO | null | undefined,
  portfolios: PortfolioDTO[],
  defaultPortfolioId?: number
): IncomeEventFormValue {
  if (event) {
    return {
      portfolioId: event.portfolioId,
      holdingId: null,
      paidDate: event.paidDate,
      amount: event.amount,
      tax: 0,
      note: event.note,
    }
  }
  const fallbackPortfolio = portfolios[0]?.id ?? COMBINED_PORTFOLIO_ID
  const portfolioId = resolveDefaultPortfolio(
    defaultPortfolioId,
    fallbackPortfolio
  )
  return {
    portfolioId,
    holdingId: null,
    paidDate: todayISO(),
    amount: 0,
    tax: 0,
    note: "",
  }
}
