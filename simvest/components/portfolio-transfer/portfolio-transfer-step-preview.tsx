"use client"

import { useId } from "react"
import { Icon } from "@/components/icon"
import { FieldLabel } from "@/components/ui/field-label"
import type { TransferPreview } from "@/lib/transfer/types"

type Props = {
  preview: TransferPreview
  nameOverride: string
  submitting: boolean
  onNameChange: (value: string) => void
  onCancel: () => void
  onCommit: () => void
}

export function PortfolioTransferStepPreview({
  preview,
  nameOverride,
  submitting,
  onNameChange,
  onCancel,
  onCommit,
}: Props) {
  const nameInputId = useId()
  const collisionHintId = useId()
  const items: Array<{ label: string; value: number }> = [
    { label: "Entries", value: preview.counts.entries },
    { label: "Holdings", value: preview.counts.holdings },
    { label: "Dividends", value: preview.counts.dividends },
    { label: "Interest", value: preview.counts.interest },
    { label: "Goals", value: preview.counts.goals },
  ]

  return (
    <div className="flex flex-col gap-3.5">
      <div>
        <FieldLabel htmlFor={nameInputId}>Portfolio name</FieldLabel>
        <input
          id={nameInputId}
          type="text"
          name="portfolioName"
          autoComplete="off"
          spellCheck={false}
          className="input-bare"
          value={nameOverride}
          onChange={(e) => onNameChange(e.target.value)}
          disabled={submitting}
          aria-describedby={
            preview.collidedWithExistingName ? collisionHintId : undefined
          }
          data-testid="portfolio-transfer-name-input"
        />
        {preview.collidedWithExistingName && (
          <div
            id={collisionHintId}
            className="muted small"
            style={{ marginTop: 6, fontStyle: "italic" }}
            data-testid="portfolio-transfer-collision-hint"
          >
            Renamed to avoid a collision with an existing portfolio.
          </div>
        )}
      </div>

      <div>
        <FieldLabel>What will be imported</FieldLabel>
        <div
          data-testid="portfolio-transfer-counts"
          style={{
            display: "grid",
            // auto-fit with a 96px minimum keeps the labels and values
            // readable on the iPhone-15-Pro viewport (390px); wider screens
            // get the five-up row the spec intended.
            gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))",
            gap: 8,
          }}
        >
          {items.map((s) => (
            <div
              key={s.label}
              style={{
                padding: "8px 12px",
                background: "var(--neutral-50)",
                borderRadius: 8,
                border: "1px solid var(--border)",
                display: "flex",
                flexDirection: "column",
                gap: 2,
              }}
            >
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "var(--neutral-500)",
                }}
              >
                {s.label}
              </span>
              <span
                className="mono"
                style={{
                  fontSize: 18,
                  fontWeight: 600,
                  color: "var(--neutral-900)",
                }}
                data-testid={`portfolio-transfer-count-${s.label.toLowerCase()}`}
              >
                {s.value}
              </span>
            </div>
          ))}
        </div>
      </div>

      {preview.warnings.length > 0 && (
        <ul
          className="muted small"
          style={{ marginLeft: 18, lineHeight: 1.5 }}
          data-testid="portfolio-transfer-warnings"
        >
          {preview.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}

      <div
        className="flex"
        style={{ justifyContent: "flex-end", gap: 8, marginTop: 4 }}
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCancel}
          disabled={submitting}
          data-testid="portfolio-transfer-cancel"
        >
          Cancel
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onCommit}
          disabled={submitting || nameOverride.trim().length === 0}
          data-testid="portfolio-transfer-commit"
        >
          {/* Upload icon — the user is sending the file INTO this instance.
              The per-row Export button in Settings keeps the `download`
              glyph for the opposite direction. */}
          <Icon name="upload" size={14} /> Import portfolio
        </button>
      </div>
    </div>
  )
}
