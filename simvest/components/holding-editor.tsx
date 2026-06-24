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
  COMBINED_PORTFOLIO_ID,
  ISIN_RE,
  resolveDefaultPortfolio,
  type HoldingDTO,
  type HoldingType,
  type PortfolioDTO,
} from "@/lib/types"

const TYPES: { value: HoldingType; label: string }[] = [
  { value: "etf", label: "ETF" },
  { value: "stock", label: "Stock" },
  { value: "bond", label: "Bond" },
  { value: "other", label: "Other" },
]

type Form = {
  portfolioId: number
  name: string
  type: HoldingType
  isin: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  holding?: HoldingDTO | null
  portfolios: PortfolioDTO[]
  defaultPortfolioId?: number
  onSave: (form: {
    portfolioId: number
    name: string
    type: HoldingType
    isin: string | null
  }) => Promise<void>
}

export function HoldingEditor({
  open,
  onOpenChange,
  holding,
  portfolios,
  defaultPortfolioId,
  onSave,
}: Props) {
  const isEdit = !!holding
  const [form, setForm] = useEditorForm<Form>(
    open,
    holding ? holding.id : "new",
    () => buildInitial(holding, portfolios, defaultPortfolioId)
  )
  const [submitError, setSubmitError] = useState<string | null>(null)

  const isinTrimmed = form.isin.trim().toUpperCase()
  const isinValid = isinTrimmed === "" || ISIN_RE.test(isinTrimmed)

  const canSave =
    form.name.trim().length > 0 &&
    Number.isFinite(form.portfolioId) &&
    form.portfolioId > 0 &&
    isinValid

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-[480px]"
        data-testid="holding-editor-dialog"
      >
        <DialogHeader>
          <DialogTitle data-testid="holding-editor-title">
            {isEdit ? "Edit holding" : "New holding"}
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div style={{ gridColumn: "1 / -1" }}>
            <FieldLabel>Portfolio</FieldLabel>
            <select
              className="input-bare"
              disabled={isEdit}
              value={form.portfolioId}
              onChange={(e) =>
                setForm({ ...form, portfolioId: Number(e.target.value) })
              }
              data-testid="holding-editor-portfolio"
            >
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <FieldLabel>Name</FieldLabel>
            <input
              className="input-bare"
              value={form.name}
              placeholder="e.g. Vanguard FTSE All-World ETF"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              data-testid="holding-editor-name"
            />
          </div>
          <div>
            <FieldLabel>ISIN (optional)</FieldLabel>
            <input
              className="input-bare mono"
              value={form.isin}
              placeholder="e.g. IE00BK5BQT80"
              onChange={(e) =>
                setForm({ ...form, isin: e.target.value.toUpperCase() })
              }
              data-testid="holding-editor-isin"
              aria-invalid={!isinValid}
            />
            {!isinValid && (
              <div
                className="small"
                style={{ color: "var(--neg)", marginTop: 4 }}
              >
                Must match ISO 6166 (e.g. US0378331005)
              </div>
            )}
          </div>
          <div>
            <FieldLabel>Type</FieldLabel>
            <select
              className="input-bare"
              value={form.type}
              onChange={(e) =>
                setForm({ ...form, type: e.target.value as HoldingType })
              }
              data-testid="holding-editor-type"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {submitError && (
          <div
            className="small"
            style={{ color: "var(--neg)", marginTop: 8 }}
            data-testid="holding-editor-error"
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
            disabled={!canSave}
            onClick={async () => {
              setSubmitError(null)
              try {
                await onSave({
                  portfolioId: form.portfolioId,
                  name: form.name.trim(),
                  type: form.type,
                  isin: isinTrimmed || null,
                })
                onOpenChange(false)
              } catch (err) {
                setSubmitError(
                  err instanceof Error ? err.message : "Failed to save"
                )
              }
            }}
            data-testid="holding-editor-submit"
          >
            <Icon name="check" size={15} />{" "}
            {isEdit ? "Save changes" : "Add holding"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function buildInitial(
  holding: HoldingDTO | null | undefined,
  portfolios: PortfolioDTO[],
  defaultPortfolioId?: number
): Form {
  if (holding) {
    return {
      portfolioId: holding.portfolioId,
      name: holding.name,
      type: holding.type,
      isin: holding.isin ?? "",
    }
  }
  const fallback = portfolios[0]?.id ?? COMBINED_PORTFOLIO_ID
  return {
    portfolioId: resolveDefaultPortfolio(defaultPortfolioId, fallback),
    name: "",
    type: "etf",
    isin: "",
  }
}
