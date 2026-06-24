"use client"

import { Icon } from "@/components/icon"
import type { RestoreSummary } from "@/lib/transfer/types"

type Props = {
  summary: RestoreSummary
  onClose: () => void
}

export function PortfolioTransferStepSummary({ summary, onClose }: Props) {
  const stats: { label: string; value: number }[] = [
    { label: "Entries", value: summary.entriesCreated },
    { label: "Holdings", value: summary.holdingsCreated },
    { label: "Dividends", value: summary.dividendsCreated },
    { label: "Interest", value: summary.interestCreated },
    { label: "Goals", value: summary.goalsCreated },
  ]

  return (
    <div
      className="flex flex-col gap-3.5"
      aria-live="polite"
      data-testid="portfolio-transfer-summary"
    >
      <div className="card success-card">
        <Icon name="check" size={18} />
        <span>
          Imported as{" "}
          <strong data-testid="portfolio-transfer-summary-name">
            {summary.resolvedName}
          </strong>
          .
        </span>
      </div>

      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <table className="table">
          <tbody>
            {stats.map((s) => (
              <tr key={s.label}>
                <td style={{ paddingLeft: 16 }}>{s.label}</td>
                <td
                  className={`num mono ${s.value > 0 ? "pos" : "muted"}`}
                  data-testid={`portfolio-transfer-summary-${s.label.toLowerCase()}`}
                >
                  {s.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex" style={{ justifyContent: "flex-end" }}>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onClose}
          data-testid="portfolio-transfer-summary-close"
        >
          Done
        </button>
      </div>
    </div>
  )
}
