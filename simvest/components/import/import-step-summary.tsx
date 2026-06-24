"use client"

import { Icon } from "@/components/icon"
import type { ImportApplied } from "@/lib/import/types"

type Props = {
  result: ImportApplied
  onClose: () => void
}

export function ImportStepSummary({ result, onClose }: Props) {
  const stats: { label: string; value: number; tone?: "pos" | "muted" }[] = [
    {
      label: "Monthly entries written",
      value: result.entriesUpserted,
      tone: "pos",
    },
    { label: "Holdings created", value: result.holdingsCreated, tone: "pos" },
    {
      label: "Dividends inserted",
      value: result.dividendsInserted,
      tone: "pos",
    },
    { label: "Interest inserted", value: result.interestInserted, tone: "pos" },
    {
      label: "Duplicates skipped",
      value: result.duplicatesSkipped,
      tone: "muted",
    },
  ]

  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 14 }}
      data-testid="import-summary"
    >
      <div
        className="card card-pad"
        style={{
          background: "var(--pos-50, #ECFDF5)",
          borderColor: "var(--pos, #059669)",
          color: "var(--pos, #059669)",
          fontSize: 13,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Icon name="check" size={18} /> Import complete
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="table">
          <tbody>
            {stats.map((s) => (
              <tr key={s.label}>
                <td style={{ paddingLeft: 16 }}>{s.label}</td>
                <td
                  className={`num mono ${s.tone === "pos" && s.value > 0 ? "pos" : s.tone === "muted" ? "muted" : ""}`}
                >
                  {s.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.warnings.length > 0 && (
        <details>
          <summary className="muted small" style={{ cursor: "pointer" }}>
            {result.warnings.length} warning
            {result.warnings.length === 1 ? "" : "s"}
          </summary>
          <ul
            className="muted small"
            style={{ marginTop: 6, marginLeft: 18, lineHeight: 1.5 }}
          >
            {result.warnings.slice(0, 8).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {result.warnings.length > 8 && (
              <li>… and {result.warnings.length - 8} more</li>
            )}
          </ul>
        </details>
      )}

      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onClose}
          data-testid="import-summary-close"
        >
          Close
        </button>
      </div>
    </div>
  )
}
