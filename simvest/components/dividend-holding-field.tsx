"use client"

import { FieldLabel } from "@/components/ui/field-label"
import { SegControl } from "@/components/ui/seg-control"
import { ISIN_RE, type HoldingDTO, type HoldingType } from "@/lib/types"

const TYPES: { value: HoldingType; label: string }[] = [
  { value: "etf", label: "ETF" },
  { value: "stock", label: "Stock" },
  { value: "bond", label: "Bond" },
  { value: "other", label: "Other" },
]

/** Inline draft for a holding created from within the dividend editor. */
export type HoldingDraft = {
  name: string
  type: HoldingType
  isin: string
}

type Props = {
  /** Holdings in the dividend form's currently selected portfolio. */
  portfolioHoldings: HoldingDTO[]
  /**
   * Resolved by the parent: forced to `"new"` when the portfolio has no
   * holdings to pick from, otherwise the user's toggle choice.
   */
  mode: "existing" | "new"
  onModeChange: (mode: "existing" | "new") => void
  holdingId: number | null
  onHoldingIdChange: (id: number | null) => void
  draft: HoldingDraft
  onDraftChange: (draft: HoldingDraft) => void
}

/**
 * Holding selector for the dividend editor. Lets the user either pick an
 * existing holding or fill an inline "new holding" sub-form (name / type /
 * ISIN) that the editor persists on save. Inline — rather than a nested
 * dialog — so the flow stays in one modal and one keyboard context on mobile.
 */
export function DividendHoldingField({
  portfolioHoldings,
  mode,
  onModeChange,
  holdingId,
  onHoldingIdChange,
  draft,
  onDraftChange,
}: Props) {
  const canUseExisting = portfolioHoldings.length > 0
  const isinTrimmed = draft.isin.trim().toUpperCase()
  const isinValid = isinTrimmed === "" || ISIN_RE.test(isinTrimmed)

  return (
    <div style={{ gridColumn: "1 / -1" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 8,
          minHeight: 22,
        }}
      >
        {/* Group label for the holding cluster. The per-control `aria-label`s
            cover the screen-reader case; this visible label isn't yet bound to
            a control (not clickable-to-focus). Follow-up: switch this cluster
            to <fieldset><legend> and bind each control with `htmlFor`. */}
        <FieldLabel>Holding</FieldLabel>
        {canUseExisting && (
          <SegControl<"existing" | "new">
            ariaLabel="Holding source"
            testId="dividend-holding-mode"
            options={[
              { value: "existing", label: "Existing" },
              { value: "new", label: "New" },
            ]}
            value={mode}
            onChange={(next) => {
              // Re-entering "existing" with nothing selected lands on the
              // first holding so the dividend stays saveable.
              if (next === "existing" && (holdingId ?? 0) <= 0) {
                onHoldingIdChange(portfolioHoldings[0]?.id ?? null)
              }
              onModeChange(next)
            }}
          />
        )}
      </div>

      {mode === "existing" ? (
        <select
          className="input-bare"
          value={holdingId ?? 0}
          onChange={(e) => onHoldingIdChange(Number(e.target.value) || null)}
          data-testid="income-event-holding"
        >
          {portfolioHoldings.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name}
            </option>
          ))}
        </select>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div style={{ gridColumn: "1 / -1" }}>
            <input
              className="input-bare"
              value={draft.name}
              placeholder="e.g. Vanguard FTSE All-World ETF"
              onChange={(e) =>
                onDraftChange({ ...draft, name: e.target.value })
              }
              data-testid="dividend-new-holding-name"
              aria-label="New holding name"
              name="name"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
          <div>
            <select
              className="input-bare"
              value={draft.type}
              onChange={(e) =>
                onDraftChange({ ...draft, type: e.target.value as HoldingType })
              }
              data-testid="dividend-new-holding-type"
              aria-label="New holding type"
              name="type"
            >
              {TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <input
              className="input-bare mono"
              value={draft.isin}
              placeholder="ISIN (optional)"
              onChange={(e) =>
                onDraftChange({ ...draft, isin: e.target.value.toUpperCase() })
              }
              data-testid="dividend-new-holding-isin"
              aria-label="New holding ISIN"
              aria-invalid={!isinValid}
              name="isin"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              translate="no"
            />
          </div>
          {!isinValid && (
            <div
              className="small"
              style={{ color: "var(--neg)", gridColumn: "1 / -1" }}
            >
              Must match ISO 6166 (e.g. US0378331005)
            </div>
          )}
          {!canUseExisting && (
            <div className="small muted" style={{ gridColumn: "1 / -1" }}>
              No holdings in this portfolio yet — this one will be created.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
