"use client"

import type { ReactNode } from "react"
import { FieldLabel } from "@/components/ui/field-label"
import { MoneyInput } from "@/components/money-input"
import { useResolvedLocale } from "@/components/use-resolved-locale"
import type { HoldingDTO, IncomeKind, PortfolioDTO } from "@/lib/types"

/**
 * Form state for dividend / interest editors.
 *
 * `tax` is stored as a **positive magnitude** (the absolute cost) so the
 * user types a familiar value into a non-negative `MoneyInput`. The DB
 * preserves the historical "withheld is negative" convention. Editors must
 * route their save payload through `withPersistedTaxSign()` below — do not
 * call `onSave(form)` directly.
 */
export type IncomeEventFormValue = {
  portfolioId: number
  holdingId: number | null
  paidDate: string
  amount: number
  tax: number
  note: string
  /**
   * Typed amounts that couldn't be read (D1). Editors must refuse to save
   * while any is set — a rejected "12.50" must not quietly save as 0.
   * Form-only; stripped by `withPersistedTaxSign`.
   */
  moneyErrors?: { amount?: string; tax?: string }
}

/** True when the form holds an amount the user typed that couldn't be read. */
export function hasMoneyErrors(form: IncomeEventFormValue): boolean {
  return Boolean(form.moneyErrors?.amount || form.moneyErrors?.tax)
}

/**
 * Single, centralized conversion from form-shape (positive `tax`) to
 * persisted-shape (≤ 0 `tax`). Both `DividendEditor` and `InterestEditor`
 * call this in their `onSave` boundary so the sign convention can never
 * silently drift between editors — a regression risk pre-helper (e.g. a
 * future "withholding on bond coupon" field on interest would otherwise
 * persist a positive `tax`, corrupting income aggregations).
 */
export function withPersistedTaxSign(
  form: IncomeEventFormValue
): IncomeEventFormValue {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { moneyErrors, ...rest } = form
  return { ...rest, tax: -Math.abs(form.tax) }
}

type Props = {
  kind: IncomeKind
  form: IncomeEventFormValue
  setForm: (next: IncomeEventFormValue) => void
  portfolios: PortfolioDTO[]
  holdings: HoldingDTO[]
  /**
   * The field rendered next to Portfolio — the holding selector for dividends
   * (a `DividendHoldingField`, full width) or the read-only source field for
   * interest. Supplied by the owning editor so this shared form stays agnostic
   * to the holding-creation flow.
   */
  secondField: ReactNode
}

export function IncomeEventForm({
  kind,
  form,
  setForm,
  portfolios,
  holdings,
  secondField,
}: Props) {
  const { locale } = useResolvedLocale()

  return (
    <div className="grid grid-cols-2 gap-3">
      <div style={kind === "dividend" ? { gridColumn: "1 / -1" } : undefined}>
        <FieldLabel>Portfolio</FieldLabel>
        <select
          className="input-bare"
          value={form.portfolioId}
          onChange={(e) => {
            const pid = Number(e.target.value)
            const firstHolding = holdings.find((h) => h.portfolioId === pid)
            setForm({
              ...form,
              portfolioId: pid,
              holdingId: kind === "dividend" ? (firstHolding?.id ?? 0) : null,
            })
          }}
          data-testid="income-event-portfolio"
        >
          {portfolios.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {secondField}

      <div>
        <FieldLabel>Paid date</FieldLabel>
        <input
          className="input-bare"
          type="date"
          value={form.paidDate}
          onChange={(e) => setForm({ ...form, paidDate: e.target.value })}
          data-testid="income-event-date"
        />
      </div>

      <div>
        <FieldLabel>
          {kind === "dividend" ? "Gross amount (EUR)" : "Amount (EUR)"}
        </FieldLabel>
        <MoneyInput
          value={form.amount === 0 ? null : form.amount}
          onChange={(v, err) =>
            setForm({
              ...form,
              amount: v ?? 0,
              moneyErrors: { ...form.moneyErrors, amount: err ?? undefined },
            })
          }
          locale={locale}
          min={0}
          ariaLabel={kind === "dividend" ? "Gross amount" : "Amount"}
          testId="income-event-amount"
        />
      </div>

      {kind === "dividend" && (
        <div>
          <FieldLabel>Tax withheld (EUR)</FieldLabel>
          <MoneyInput
            value={form.tax === 0 ? null : form.tax}
            onChange={(v, err) =>
              setForm({
                ...form,
                tax: v ?? 0,
                moneyErrors: { ...form.moneyErrors, tax: err ?? undefined },
              })
            }
            locale={locale}
            min={0}
            ariaLabel="Tax withheld"
            testId="income-event-tax"
          />
        </div>
      )}

      <div style={{ gridColumn: "1 / -1" }}>
        <FieldLabel>Note (optional)</FieldLabel>
        <input
          className="input-bare"
          value={form.note}
          placeholder={
            kind === "dividend"
              ? "e.g. Q3 distribution"
              : "e.g. Monthly cash interest"
          }
          onChange={(e) => setForm({ ...form, note: e.target.value })}
          data-testid="income-event-note"
        />
      </div>
    </div>
  )
}
