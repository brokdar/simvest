"use client"

import { useMemo } from "react"
import { Icon } from "@/components/icon"
import { fmtEUR } from "@/lib/format"
import { labelFor } from "@/lib/types"
import type { ImportDecisions, ImportPreview } from "@/lib/import/types"
import { ActionButton, Checkbox, Empty, Section, StatsBar } from "./review-ui"

type Props = {
  preview: ImportPreview
  decisions: ImportDecisions
  submitting: boolean
  onSetMonthAction: (
    year: number,
    month: number,
    action: "replace" | "skip"
  ) => void
  onToggle: (
    key: "importDividends" | "importInterest" | "importHoldings"
  ) => void
  onCancel: () => void
  onCommit: () => void
}

export function ImportStepPreview({
  preview,
  decisions,
  submitting,
  onSetMonthAction,
  onToggle,
  onCancel,
  onCommit,
}: Props) {
  const replaceCount = decisions.months.filter(
    (m) => m.action === "replace"
  ).length
  const skipCount = decisions.months.length - replaceCount
  const monthActionByKey = useMemo(() => {
    const map = new Map<string, "replace" | "skip">()
    for (const d of decisions.months) {
      map.set(`${d.year}-${d.month}`, d.action)
    }
    return map
  }, [decisions.months])
  const dividendCount = preview.incomeEvents.filter(
    (e) => e.kind === "dividend" && !e.alreadyImported
  ).length
  const interestCount = preview.incomeEvents.filter(
    (e) => e.kind === "interest" && !e.alreadyImported
  ).length
  const alreadyImported = preview.incomeEvents.filter(
    (e) => e.alreadyImported
  ).length
  const newHoldings = preview.holdings.filter((h) => !h.exists).length

  return (
    <div
      style={{
        display: "flex",
        flex: 1,
        minHeight: 0,
        flexDirection: "column",
        gap: 12,
      }}
    >
      <StatsBar
        items={[
          {
            label: "Months",
            value: `${replaceCount}/${decisions.months.length}`,
            hint: skipCount > 0 ? `${skipCount} skipped` : undefined,
          },
          { label: "Dividends", value: dividendCount },
          { label: "Interest", value: interestCount },
          { label: "New holdings", value: newHoldings },
        ]}
      />

      {preview.warnings.length > 0 && (
        <div
          className="card"
          style={{
            padding: "8px 12px",
            background: "var(--warning-50, #FEF3C7)",
            borderColor: "var(--warning, #92400E)",
            fontSize: 12,
            flexShrink: 0,
          }}
          data-testid="import-warnings"
        >
          <strong>{preview.warnings.length} warnings:</strong>
          <ul style={{ marginTop: 4, marginLeft: 18 }}>
            {preview.warnings.slice(0, 3).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {preview.warnings.length > 3 && (
              <li>… and {preview.warnings.length - 3} more</li>
            )}
          </ul>
        </div>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: "auto",
          display: "flex",
          flexDirection: "column",
          gap: 16,
          paddingRight: 4,
        }}
      >
        <Section
          title={`Monthly deposits — ${replaceCount} to import, ${skipCount} to skip`}
        >
          {preview.months.length === 0 ? (
            <Empty>No CASH inflows found in CSV.</Empty>
          ) : (
            <div data-testid="import-months-table">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 16 }}>Month</th>
                    <th className="num">Invested</th>
                    <th className="num">Value</th>
                    <th style={{ width: 180 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.months.map((m) => {
                    const decision =
                      monthActionByKey.get(`${m.year}-${m.month}`) ?? "skip"
                    const investedChanged =
                      m.currentInvested > 0 &&
                      Math.round(m.currentInvested) !==
                        Math.round(m.newInvested)
                    const valueChanged =
                      m.newValue != null &&
                      m.currentValue != null &&
                      Math.abs(m.currentValue - m.newValue) >= 0.01
                    return (
                      <tr key={`${m.year}-${m.month}`}>
                        <td style={{ paddingLeft: 16, fontWeight: 600 }}>
                          {labelFor(m.year, m.month)}
                        </td>
                        <td className="num mono">
                          {fmtEUR(m.newInvested)}
                          {investedChanged && (
                            <div className="muted" style={{ fontSize: 10.5 }}>
                              was {fmtEUR(m.currentInvested)}
                            </div>
                          )}
                        </td>
                        <td className="num mono">
                          {m.newValue == null ? (
                            <span className="muted">—</span>
                          ) : (
                            fmtEUR(m.newValue)
                          )}
                          {valueChanged && (
                            <div className="muted" style={{ fontSize: 10.5 }}>
                              was {fmtEUR(m.currentValue as number)}
                            </div>
                          )}
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 4 }}>
                            <ActionButton
                              active={decision === "replace"}
                              onClick={() =>
                                onSetMonthAction(m.year, m.month, "replace")
                              }
                              testId={`import-month-action-${m.year}-${m.month}-replace`}
                            >
                              Replace
                            </ActionButton>
                            <ActionButton
                              active={decision === "skip"}
                              onClick={() =>
                                onSetMonthAction(m.year, m.month, "skip")
                              }
                              testId={`import-month-action-${m.year}-${m.month}-skip`}
                            >
                              Skip
                            </ActionButton>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section
          title={`Income events — ${dividendCount} dividends, ${interestCount} interest${
            alreadyImported > 0 ? ` (${alreadyImported} already imported)` : ""
          }`}
        >
          {preview.incomeEvents.length === 0 ? (
            <Empty>No dividend or interest events found.</Empty>
          ) : (
            <div data-testid="import-income-table">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 16 }}>Date</th>
                    <th>Source</th>
                    <th>Kind</th>
                    <th className="num">Amount</th>
                    <th className="num">Tax</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.incomeEvents.map((e) => (
                    <tr
                      key={e.sourceTransactionId}
                      style={{
                        opacity: e.alreadyImported ? 0.5 : 1,
                      }}
                    >
                      <td style={{ paddingLeft: 16 }}>{e.paidDate}</td>
                      <td>{e.holdingName ?? "Broker interest"}</td>
                      <td>
                        <span
                          className="chip"
                          style={{
                            fontSize: 10.5,
                            background:
                              e.kind === "dividend"
                                ? "var(--primary-50)"
                                : "var(--tertiary-50)",
                            color:
                              e.kind === "dividend"
                                ? "var(--primary)"
                                : "var(--tertiary)",
                            fontWeight: 600,
                          }}
                        >
                          {e.kind}
                        </span>
                        {e.alreadyImported && (
                          <span
                            className="muted small"
                            style={{ marginLeft: 6, fontSize: 10 }}
                          >
                            already imported
                          </span>
                        )}
                      </td>
                      <td className="num mono">{fmtEUR(e.amount)}</td>
                      <td className="num mono neg">
                        {e.tax !== 0 ? fmtEUR(e.tax) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        <Section title={`Holdings — ${newHoldings} new to create`}>
          {preview.holdings.length === 0 ? (
            <Empty>No new holding candidates from CSV.</Empty>
          ) : (
            <div data-testid="import-holdings-table">
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 16 }}>Name</th>
                    <th style={{ width: 160 }}>ISIN</th>
                    <th style={{ width: 100 }}>Type</th>
                    <th style={{ width: 120 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.holdings.map((h) => (
                    <tr key={h.isin}>
                      <td style={{ paddingLeft: 16 }}>{h.name}</td>
                      <td className="mono small">{h.isin}</td>
                      <td>{h.type}</td>
                      <td>
                        <span
                          className="chip small"
                          style={{
                            fontSize: 10.5,
                            background: h.exists
                              ? "var(--neutral-100)"
                              : "var(--tertiary-50)",
                            color: h.exists
                              ? "var(--neutral-600)"
                              : "var(--tertiary)",
                          }}
                        >
                          {h.exists ? "exists" : "new"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      </div>

      <div
        style={{
          flexShrink: 0,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          borderTop: "1px solid var(--border)",
          paddingTop: 12,
        }}
      >
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            padding: "8px 12px",
            background: "var(--neutral-50)",
            borderRadius: 8,
          }}
        >
          <Checkbox
            checked={decisions.importDividends}
            onChange={() => onToggle("importDividends")}
            label="Import dividends"
            testId="import-toggle-dividends"
          />
          <Checkbox
            checked={decisions.importInterest}
            onChange={() => onToggle("importInterest")}
            label="Import interest"
            testId="import-toggle-interest"
          />
          <Checkbox
            checked={decisions.importHoldings}
            onChange={() => onToggle("importHoldings")}
            label="Create missing holdings"
            testId="import-toggle-holdings"
          />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onCancel}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onCommit}
            disabled={submitting}
            data-testid="import-commit"
          >
            <Icon name="check" size={14} />{" "}
            {submitting ? "Importing…" : "Apply import"}
          </button>
        </div>
      </div>
    </div>
  )
}
