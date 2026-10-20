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
import { CsvExportButton } from "@/components/csv-export-button"
import { SegControl } from "@/components/ui/seg-control"
import { eventAmount, rankByIncome, trailing12mIncome } from "@/lib/calc"
import { toCsv, type CsvColumn } from "@/lib/export/to-csv"
import { fmtEUR } from "@/lib/format"
import {
  COMBINED_PORTFOLIO_ID,
  INCOME_HOLDING_PARAM,
  type HoldingDTO,
  type HoldingType,
  type IncomeEventDTO,
  type PortfolioDTO,
} from "@/lib/types"
import { swatch } from "@/lib/palette"

const TYPE_LABELS: Record<HoldingType, string> = {
  etf: "ETF",
  stock: "Stock",
  bond: "Bond",
  other: "Other",
}

const TYPE_TINT: Record<HoldingType, string> = {
  etf: "var(--primary-50)",
  stock: "var(--amber-50)",
  bond: "var(--tertiary-50)",
  other: "var(--neutral-100)",
}

const TYPE_INK: Record<HoldingType, string> = {
  etf: "var(--primary)",
  stock: "var(--amber)",
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
  // Which portfolio a "New holding" opened from a group's empty state targets.
  const [addFor, setAddFor] = useState<number | null>(null)
  const [editing, setEditing] = useState<HoldingDTO | null>(null)
  // W3: by account (card per portfolio) or one list ranked by income.
  const [order, setOrder] = useState<"account" | "income">("account")

  useEditorIntent("holding", () => {
    setEditing(null)
    setAddFor(null)
    setShowAdd(true)
  })

  // The header's portfolio switcher scopes this page like every other one:
  // Combined lists every portfolio, a specific one lists just that group.
  const isCombined = selectedPortfolio === COMBINED_PORTFOLIO_ID
  const visiblePortfolios = useMemo(
    () =>
      isCombined
        ? portfolios
        : portfolios.filter((p) => p.id === selectedPortfolio),
    [portfolios, isCombined, selectedPortfolio]
  )
  const visibleHoldings = useMemo(() => {
    const ids = new Set(visiblePortfolios.map((p) => p.id))
    return holdings.filter((h) => ids.has(h.portfolioId))
  }, [holdings, visiblePortfolios])

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
      // Same net/gross basis as the 12-month column beside it.
      m.set(e.holdingId, (m.get(e.holdingId) ?? 0) + eventAmount(e, basis))
    }
    return m
  }, [incomeEvents, basis])

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

  const holdingCsvColumns: CsvColumn<HoldingDTO>[] = [
    { header: "name", value: (h) => h.name },
    { header: "type", value: (h) => TYPE_LABELS[h.type] },
    { header: "isin", value: (h) => h.isin },
    {
      header: "totalDividends",
      value: (h) => dividendsByHolding.get(h.id) ?? 0,
    },
    {
      header: "trailing12mIncome",
      value: (h) => trailing12ByHolding.get(h.id) ?? 0,
    },
  ]

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
            {visibleHoldings.length}{" "}
            {visibleHoldings.length === 1 ? "holding" : "holdings"} · cash
            dividends linked to each ticker
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <CsvExportButton
            filename="simvest-holdings.csv"
            buildCsv={() => toCsv(holdingCsvColumns, visibleHoldings)}
            testId="btn-export-holdings"
            disabled={visibleHoldings.length === 0}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEditing(null)
              setAddFor(null)
              setShowAdd(true)
            }}
            data-testid="btn-add-holding"
          >
            <Icon name="plus" size={15} /> Add holding
          </button>
        </div>
      </div>

      {portfolios.length > 0 && (
        <div className="holdings-order" data-testid="holdings-order-bar">
          <SegControl<"account" | "income">
            ariaLabel="Order holdings"
            testId="holdings-order"
            options={[
              { value: "account", label: "By account" },
              { value: "income", label: "Top earners" },
            ]}
            value={order}
            onChange={setOrder}
          />
          <span className="muted small" style={{ fontSize: "var(--fs-2xs)" }}>
            {order === "income"
              ? "Every holding in one list, biggest income over the last 12 months first"
              : "Grouped by the account each holding sits in"}
          </span>
        </div>
      )}

      {portfolios.length === 0 ? (
        <div className="card card-pad muted">
          Create a portfolio first before adding holdings.
        </div>
      ) : order === "income" ? (
        <TopEarners
          portfolios={visiblePortfolios}
          holdings={visibleHoldings}
          dividendsByHolding={dividendsByHolding}
          trailing12ByHolding={trailing12ByHolding}
          interestByPortfolio={interestByPortfolio}
          onEdit={(h) => {
            setShowAdd(false)
            setEditing(h)
          }}
        />
      ) : (
        // Every portfolio gets a group — one with no holdings yet shows an
        // empty state with a way to add the first, instead of vanishing.
        visiblePortfolios.map((p) => (
          <PortfolioGroup
            key={p.id}
            portfolio={p}
            holdings={grouped.get(p.id) ?? []}
            dividendsByHolding={dividendsByHolding}
            trailing12ByHolding={trailing12ByHolding}
            portfolioInterest={interestByPortfolio.get(p.id) ?? 0}
            onAdd={() => {
              setEditing(null)
              setAddFor(p.id)
              setShowAdd(true)
            }}
            onEdit={(h) => {
              setShowAdd(false)
              setEditing(h)
            }}
            onDelete={async (h) => {
              await deleteHolding(h.id)
            }}
          />
        ))
      )}

      <HoldingEditor
        open={showAdd || editing !== null}
        onOpenChange={(o) => {
          if (!o) {
            setShowAdd(false)
            setAddFor(null)
            setEditing(null)
          }
        }}
        holding={editing}
        portfolios={portfolios}
        defaultPortfolioId={addFor ?? selectedPortfolio}
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
  onAdd,
  onEdit,
  onDelete,
}: {
  portfolio: PortfolioDTO
  holdings: HoldingDTO[]
  dividendsByHolding: Map<number, number>
  trailing12ByHolding: Map<number, number>
  portfolioInterest: number
  onAdd: () => void
  onEdit: (h: HoldingDTO) => void
  onDelete: (h: HoldingDTO) => void
}) {
  const groupTotal = holdings.reduce(
    (s, h) => s + (dividendsByHolding.get(h.id) ?? 0),
    0
  )

  const isEmpty = holdings.length === 0 && portfolioInterest <= 0

  return (
    <div
      className="card"
      style={{ marginBottom: 14, overflow: "hidden" }}
      data-testid={`holdings-group-${portfolio.id}`}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "6px 12px",
          padding: "14px 18px",
          borderBottom: "1px solid var(--border)",
          background: "var(--neutral-50)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            minWidth: 0,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 2,
              background: swatch(portfolio.color),
              flexShrink: 0,
            }}
          />
          <div style={{ fontWeight: 600, fontSize: "var(--fs-md)" }}>
            {portfolio.name}
          </div>
          <span
            className="muted small"
            style={{ fontSize: "var(--fs-2xs)" }}
            data-testid={`holdings-count-${portfolio.id}`}
          >
            {holdings.length} {holdings.length === 1 ? "holding" : "holdings"}
            {portfolioInterest > 0 ? " + interest" : ""}
          </span>
        </div>
        {/* Count what the rows below show (N15): dividends only when a holding
            exists to earn them, interest whenever the interest row is there. */}
        <div
          className="muted small mono"
          style={{ fontSize: "var(--fs-xs)" }}
          data-testid={`holdings-summary-${portfolio.id}`}
        >
          {[
            holdings.length > 0 || portfolioInterest <= 0
              ? `${fmtEUR(groupTotal)} dividends to date`
              : null,
            portfolioInterest > 0
              ? `${fmtEUR(portfolioInterest)} interest (12 mo)`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>
      {isEmpty ? (
        <div
          className="holdings-empty"
          data-testid={`holdings-empty-${portfolio.id}`}
        >
          <div>
            <div style={{ fontWeight: 600, color: "var(--neutral-800)" }}>
              No holdings in {portfolio.name} yet
            </div>
            <div className="muted small">
              Add the ETFs or stocks you hold here to link their dividends to
              them.
            </div>
          </div>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onAdd}
            data-testid={`holdings-empty-add-${portfolio.id}`}
          >
            <Icon name="plus" size={14} /> Add your first holding
          </button>
        </div>
      ) : (
        <table className="holdings-table table">
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
                  <td
                    className="td-holding-name"
                    style={{ paddingLeft: 18, color: "var(--neutral-800)" }}
                  >
                    <span
                      className="holding-name-text"
                      style={{ fontWeight: 600 }}
                      title={h.name}
                    >
                      {h.name}
                    </span>
                  </td>
                  <td
                    className="mono small td-holding-isin"
                    data-label="ISIN"
                    style={{ color: "var(--neutral-500)" }}
                  >
                    {h.isin ?? <span className="muted">—</span>}
                  </td>
                  <td className="td-holding-type">
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
                  <td
                    className="num mono td-holding-dividends"
                    data-label="Dividends received"
                  >
                    {total > 0 ? (
                      // W6: a holding's payouts are one click away, even
                      // when nothing arrived in the last 12 months.
                      <Link
                        href={`/income?${INCOME_HOLDING_PARAM}=${h.id}`}
                        className="pos holding-payouts-link tap-pad"
                        data-testid={`holding-payouts-link-${h.id}`}
                        title={`See every payout from ${h.name}`}
                      >
                        {fmtEUR(total)}
                      </Link>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td
                    className="num mono td-holding-income"
                    data-label="Income (12 mo)"
                  >
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
                  <td className="td-holding-actions">
                    <div className="row-actions">
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
                            aria-label={`Delete ${h.name}`}
                          >
                            <Icon name="trash" size={14} />
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>
                              Delete {h.name}?
                            </AlertDialogTitle>
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
                <td
                  className="td-holding-name"
                  style={{ paddingLeft: 18, color: "var(--neutral-800)" }}
                >
                  <span style={{ fontWeight: 600 }}>Interest</span>
                  <div className="muted small">Not linked to a holding</div>
                </td>
                <td
                  className="mono small td-holding-isin"
                  data-label="ISIN"
                  style={{ color: "var(--neutral-500)" }}
                >
                  <span className="muted">—</span>
                </td>
                <td className="td-holding-type">
                  <span className="muted small">Crowdlending / cash</span>
                </td>
                <td
                  className="num mono td-holding-dividends"
                  data-label="Dividends received"
                >
                  <span className="muted">—</span>
                </td>
                <td
                  className="num mono td-holding-income"
                  data-label="Income (12 mo)"
                >
                  <span className="pos">{fmtEUR(portfolioInterest)}</span>
                </td>
                <td className="td-holding-actions" aria-hidden="true"></td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}

type EarnerRow = {
  key: string
  name: string
  holding: HoldingDTO | null
  portfolio: PortfolioDTO
  trailing12: number
  total: number
}

/**
 * W3: every visible holding (plus each account's unlinked interest) in one
 * table, ranked by trailing-12-month income — the same ranking the Income
 * page's per-holding table offers, so the top earner is never hidden by card
 * order.
 */
function TopEarners({
  portfolios,
  holdings,
  dividendsByHolding,
  trailing12ByHolding,
  interestByPortfolio,
  onEdit,
}: {
  portfolios: PortfolioDTO[]
  holdings: HoldingDTO[]
  dividendsByHolding: Map<number, number>
  trailing12ByHolding: Map<number, number>
  interestByPortfolio: Map<number, number>
  onEdit: (h: HoldingDTO) => void
}) {
  const rows = useMemo(() => {
    const byId = new Map(portfolios.map((p) => [p.id, p]))
    const out: EarnerRow[] = []
    for (const h of holdings) {
      const p = byId.get(h.portfolioId)
      if (!p) continue
      out.push({
        key: `h-${h.id}`,
        name: h.name,
        holding: h,
        portfolio: p,
        trailing12: trailing12ByHolding.get(h.id) ?? 0,
        total: dividendsByHolding.get(h.id) ?? 0,
      })
    }
    for (const p of portfolios) {
      const interest = interestByPortfolio.get(p.id) ?? 0
      if (interest <= 0) continue
      out.push({
        key: `i-${p.id}`,
        name: "Interest",
        holding: null,
        portfolio: p,
        trailing12: interest,
        total: 0,
      })
    }
    return rankByIncome(out)
  }, [
    portfolios,
    holdings,
    dividendsByHolding,
    trailing12ByHolding,
    interestByPortfolio,
  ])

  if (rows.length === 0) {
    return (
      <div className="card card-pad muted" data-testid="holdings-earners-empty">
        No holdings here yet — add one to see what it earns.
      </div>
    )
  }

  return (
    <div
      className="card"
      style={{ marginBottom: 14, overflow: "hidden" }}
      data-testid="holdings-earners"
    >
      <table className="holdings-table earners-table table">
        <thead>
          <tr>
            <th style={{ paddingLeft: 18, width: 56 }}>#</th>
            <th>Name</th>
            <th style={{ width: 100 }}>Type</th>
            <th className="num" style={{ width: 180 }}>
              Dividends received
            </th>
            <th className="num" style={{ width: 170 }}>
              Income (12 mo)
            </th>
            <th style={{ width: 60 }} aria-label="Actions" scope="col"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.key} data-testid={`earner-row-${r.key}`}>
              <td
                className="mono muted td-earner-rank"
                style={{ paddingLeft: 18 }}
              >
                {i + 1}
              </td>
              <td
                className="td-holding-name"
                style={{ color: "var(--neutral-800)" }}
              >
                <span
                  className="holding-name-text"
                  style={{ fontWeight: 600 }}
                  title={r.name}
                >
                  {r.name}
                </span>
                <div className="muted small earner-account">
                  <span
                    aria-hidden="true"
                    className="earner-swatch"
                    style={{ background: swatch(r.portfolio.color) }}
                  />
                  {r.portfolio.name}
                </div>
              </td>
              <td className="td-holding-type">
                {r.holding ? (
                  <span
                    className="chip"
                    style={{
                      background: TYPE_TINT[r.holding.type],
                      color: TYPE_INK[r.holding.type],
                      fontWeight: 600,
                    }}
                  >
                    {TYPE_LABELS[r.holding.type]}
                  </span>
                ) : (
                  <span className="muted small">Crowdlending / cash</span>
                )}
              </td>
              <td
                className="num mono td-holding-dividends"
                data-label="Dividends received"
              >
                {r.total > 0 ? (
                  <span className="pos">{fmtEUR(r.total)}</span>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td
                className="num mono td-holding-income"
                data-label="Income (12 mo)"
              >
                {r.trailing12 > 0 ? (
                  <Link
                    href={`/income?${INCOME_HOLDING_PARAM}=${r.holding ? r.holding.id : "interest"}`}
                    className="chip primary"
                    data-testid={`earner-income-link-${r.key}`}
                    style={{
                      textDecoration: "none",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {fmtEUR(r.trailing12)}
                    <Icon name="chevronRight" size={12} />
                  </Link>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td className="td-holding-actions">
                {r.holding ? (
                  <div className="row-actions">
                    <button
                      type="button"
                      className="btn btn-icon btn-ghost btn-sm"
                      aria-label={`Edit ${r.name}`}
                      onClick={() => onEdit(r.holding!)}
                    >
                      <Icon name="edit" size={14} />
                    </button>
                  </div>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
