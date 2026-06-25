"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useData, useDataActions } from "@/components/providers/data-provider"
import { useEditorIntent } from "@/components/providers/editor-intent"
import { HoldingEditor } from "@/components/holding-editor"
import { Icon } from "@/components/icon"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { trailing12mIncome } from "@/lib/calc"
import { fmtEUR } from "@/lib/format"
import {
  INCOME_HOLDING_PARAM,
  type HoldingDTO,
  type HoldingType,
  type IncomeEventDTO,
  type PortfolioDTO,
} from "@/lib/types"

const TYPE_LABELS: Record<HoldingType, string> = {
  etf: "ETF",
  stock: "Stock",
  bond: "Bond",
  other: "Other",
}

const TYPE_TINT: Record<HoldingType, string> = {
  etf: "var(--primary-50)",
  stock: "var(--warning-50, #FEF3C7)",
  bond: "var(--tertiary-50)",
  other: "var(--neutral-100)",
}

const TYPE_INK: Record<HoldingType, string> = {
  etf: "var(--primary)",
  stock: "var(--warning, #92400E)",
  bond: "var(--tertiary)",
  other: "var(--neutral-600)",
}

export function HoldingsView() {
  const {
    portfolios,
    holdings,
    incomeEvents,
    selectedPortfolio,
    settings,
    today,
  } = useData()
  const { addHolding, updateHolding, deleteHolding } = useDataActions()
  const asOf = useMemo(() => new Date(today), [today])
  const basis = settings.dividendBasis
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<HoldingDTO | null>(null)

  useEditorIntent("holding", () => {
    setEditing(null)
    setShowAdd(true)
  })

  const grouped = useMemo(() => {
    const byPortfolio = new Map<number, HoldingDTO[]>()
    for (const h of holdings) {
      const list = byPortfolio.get(h.portfolioId) ?? []
      list.push(h)
      byPortfolio.set(h.portfolioId, list)
    }
    return byPortfolio
  }, [holdings])

  const dividendsByHolding = useMemo(() => {
    const m = new Map<number, number>()
    for (const e of incomeEvents) {
      if (e.kind !== "dividend" || e.holdingId == null) continue
      m.set(e.holdingId, (m.get(e.holdingId) ?? 0) + e.amount)
    }
    return m
  }, [incomeEvents])

  const trailing12ByHolding = useMemo(() => {
    const grouped = new Map<number, IncomeEventDTO[]>()
    for (const e of incomeEvents) {
      if (e.kind !== "dividend" || e.holdingId == null) continue
      const list = grouped.get(e.holdingId) ?? []
      list.push(e)
      grouped.set(e.holdingId, list)
    }
    const out = new Map<number, number>()
    for (const [id, list] of grouped.entries()) {
      out.set(id, trailing12mIncome(list, undefined, "all", basis, asOf))
    }
    return out
  }, [incomeEvents, basis, asOf])

  // Interest events are stored with holdingId === null by design (crowdlending
  // / Go & Grow), so they can't key to a holding row. Surface them as a
  // portfolio-level trailing-12m figure instead of silently dropping the income
  // to "—" (issue #13 Bug 3). Per-holding interest attribution is out of scope.
  const interestByPortfolio = useMemo(() => {
    const out = new Map<number, number>()
    for (const p of portfolios) {
      out.set(
        p.id,
        trailing12mIncome(incomeEvents, p.id, "interest", basis, asOf)
      )
    }
    return out
  }, [portfolios, incomeEvents, basis, asOf])

  return (
    <div className="view">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-end",
          marginBottom: 16,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 className="title">Holdings</h1>
          <div
            className="muted small"
            style={{ marginTop: 4 }}
            data-testid="holdings-subtitle"
          >
            {holdings.length} {holdings.length === 1 ? "holding" : "holdings"} ·
            cash dividends linked to each ticker
          </div>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setEditing(null)
            setShowAdd(true)
          }}
          data-testid="btn-add-holding"
        >
          <Icon name="plus" size={15} /> Add holding
        </button>
      </div>

      {portfolios.length === 0 ? (
        <div className="card card-pad muted">
          Create a portfolio first before adding holdings.
        </div>
      ) : holdings.length === 0 ? (
        <div className="card card-pad muted">
          No holdings yet. Click{" "}
          <strong style={{ color: "var(--neutral-800)" }}>Add holding</strong>{" "}
          to track your first ticker.
        </div>
      ) : (
        portfolios.map((p) => {
          const ph = grouped.get(p.id) ?? []
          if (!ph.length) return null
          return (
            <PortfolioGroup
              key={p.id}
              portfolio={p}
              holdings={ph}
              dividendsByHolding={dividendsByHolding}
              trailing12ByHolding={trailing12ByHolding}
              portfolioInterest={interestByPortfolio.get(p.id) ?? 0}
              onEdit={(h) => {
                setShowAdd(false)
                setEditing(h)
              }}
              onDelete={async (h) => {
                await deleteHolding(h.id)
              }}
            />
          )
        })
      )}

      <HoldingEditor
        open={showAdd || editing !== null}
        onOpenChange={(o) => {
          if (!o) {
            setShowAdd(false)
            setEditing(null)
          }
        }}
        holding={editing}
        portfolios={portfolios}
        defaultPortfolioId={selectedPortfolio}
        onSave={async (form) => {
          if (editing) {
            await updateHolding(editing.id, {
              name: form.name,
              type: form.type,
              isin: form.isin,
            })
          } else {
            await addHolding(form)
          }
        }}
      />
    </div>
  )
}

function PortfolioGroup({
  portfolio,
  holdings,
  dividendsByHolding,
  trailing12ByHolding,
  portfolioInterest,
  onEdit,
  onDelete,
}: {
  portfolio: PortfolioDTO
  holdings: HoldingDTO[]
  dividendsByHolding: Map<number, number>
  trailing12ByHolding: Map<number, number>
  portfolioInterest: number
  onEdit: (h: HoldingDTO) => void
  onDelete: (h: HoldingDTO) => void
}) {
  const groupTotal = holdings.reduce(
    (s, h) => s + (dividendsByHolding.get(h.id) ?? 0),
    0
  )

  return (
    <div className="card" style={{ marginBottom: 14, overflow: "hidden" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 18px",
          borderBottom: "1px solid var(--border)",
          background: "var(--neutral-50)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: portfolio.color,
            }}
          />
          <div style={{ fontWeight: 600, fontSize: 14 }}>{portfolio.name}</div>
          <span className="muted small" style={{ fontSize: 11 }}>
            {holdings.length} {holdings.length === 1 ? "holding" : "holdings"}
          </span>
        </div>
        <div className="muted small mono" style={{ fontSize: 12 }}>
          {fmtEUR(groupTotal)} dividends to date
        </div>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th style={{ paddingLeft: 18 }}>Name</th>
            <th style={{ width: 160 }}>ISIN</th>
            <th style={{ width: 100 }}>Type</th>
            <th className="num" style={{ width: 180 }}>
              Dividends received
            </th>
            <th className="num" style={{ width: 170 }}>
              Income (12 mo)
            </th>
            <th style={{ width: 80 }} aria-label="Actions" scope="col"></th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => {
            const total = dividendsByHolding.get(h.id) ?? 0
            return (
              <tr key={h.id} data-testid={`holding-row-${h.id}`}>
                <td style={{ paddingLeft: 18, color: "var(--neutral-800)" }}>
                  <span style={{ fontWeight: 600 }}>{h.name}</span>
                </td>
                <td
                  className="mono small"
                  style={{ color: "var(--neutral-500)" }}
                >
                  {h.isin ?? <span className="muted">—</span>}
                </td>
                <td>
                  <span
                    className="chip"
                    style={{
                      background: TYPE_TINT[h.type],
                      color: TYPE_INK[h.type],
                      fontWeight: 600,
                    }}
                  >
                    {TYPE_LABELS[h.type]}
                  </span>
                </td>
                <td className="num mono">
                  {total > 0 ? (
                    <span className="pos">{fmtEUR(total)}</span>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td className="num mono">
                  {(() => {
                    const trailing = trailing12ByHolding.get(h.id) ?? 0
                    if (trailing <= 0) return <span className="muted">—</span>
                    return (
                      <Link
                        href={`/income?${INCOME_HOLDING_PARAM}=${h.id}`}
                        className="chip primary"
                        data-testid={`holding-income-link-${h.id}`}
                        style={{
                          textDecoration: "none",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {fmtEUR(trailing)}
                        <Icon name="chevronRight" size={12} />
                      </Link>
                    )
                  })()}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 4, opacity: 0.7 }}>
                    <button
                      type="button"
                      className="btn btn-icon btn-ghost btn-sm"
                      aria-label={`Edit ${h.name}`}
                      onClick={() => onEdit(h)}
                    >
                      <Icon name="edit" size={14} />
                    </button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <button
                          type="button"
                          className="btn btn-icon btn-ghost btn-sm"
                          style={{ color: "var(--neg)" }}
                          aria-label={`Delete ${h.name}`}
                        >
                          <Icon name="trash" size={14} />
                        </button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete {h.name}?</AlertDialogTitle>
                          <AlertDialogDescription>
                            {total > 0
                              ? `This will permanently remove the holding and its ${fmtEUR(total)} of recorded dividends.`
                              : "This will permanently remove the holding."}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => onDelete(h)}>
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </td>
              </tr>
            )
          })}
          {portfolioInterest > 0 && (
            <tr data-testid={`portfolio-interest-row-${portfolio.id}`}>
              <td style={{ paddingLeft: 18, color: "var(--neutral-800)" }}>
                <span style={{ fontWeight: 600 }}>Interest</span>
                <div className="muted small">Not linked to a holding</div>
              </td>
              <td
                className="mono small"
                style={{ color: "var(--neutral-500)" }}
              >
                <span className="muted">—</span>
              </td>
              <td>
                <span className="muted small">Crowdlending / cash</span>
              </td>
              <td className="num mono">
                <span className="muted">—</span>
              </td>
              <td className="num mono">
                <span className="pos">{fmtEUR(portfolioInterest)}</span>
              </td>
              <td aria-hidden="true"></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
