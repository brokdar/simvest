"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useData, useDataActions } from "@/components/providers/data-provider"
import { useEditorIntent } from "@/components/providers/editor-intent"
import { DividendEditor } from "@/components/dividend-editor"
import { InterestEditor } from "@/components/interest-editor"
import { Icon } from "@/components/icon"
import { DonutBySource } from "@/components/charts/donut-by-source"
import { IncomeCalendarHeatmap } from "@/components/charts/income-calendar-heatmap"
import { MonthlyPayoutsChart } from "@/components/charts/monthly-payouts-chart"
import { KpiRow } from "@/components/views/income/kpi-row"
import { PerHoldingTable } from "@/components/views/income/per-holding-table"
import { RecentPayoutsTable } from "@/components/views/income/recent-payouts-table"
import { useIncomeSearchParams } from "@/components/views/income/use-income-search-params"
import { SegControl } from "@/components/ui/seg-control"
import { eventAmount, totalIncome } from "@/lib/calc"
import { fmtEUR } from "@/lib/format"
import {
  COMBINED_PORTFOLIO_ID,
  type IncomeEventDTO,
  type IncomeKind,
} from "@/lib/types"

type KindFilter = IncomeKind | "all"

export function IncomeView() {
  const {
    portfolios,
    holdings,
    incomeEvents,
    activePortfolio,
    settings,
    today,
  } = useData()
  // Single Date instance per render so memo deps stay stable.
  const asOf = useMemo(() => new Date(today), [today])
  const {
    addIncomeEvent,
    updateIncomeEvent,
    deleteIncomeEvent,
    updateSettings,
  } = useDataActions()

  const scopeId =
    activePortfolio.id === COMBINED_PORTFOLIO_ID
      ? undefined
      : activePortfolio.id

  const [showDividendEditor, setShowDividendEditor] = useState(false)
  const [showInterestEditor, setShowInterestEditor] = useState(false)
  const [editing, setEditing] = useState<IncomeEventDTO | null>(null)

  const { params, setMonth, setHolding, setSort, setKind } =
    useIncomeSearchParams()
  const kindFilter: KindFilter = params.kind

  // Transient highlight from hover; the URL `?holding=` acts as the persistent
  // base. Effective highlight = hover override when present, otherwise URL.
  const [hoverHoldingId, setHoverHoldingId] = useState<
    number | "interest" | null
  >(null)
  const highlightedHoldingId = hoverHoldingId ?? params.holding

  // Toggle the persistent holding filter on click/tap. When toggling OFF we
  // also clear the transient hover: on touch (no mouseleave) the synthesized
  // mouseenter would otherwise keep the highlight pinned after deselect.
  const toggleHolding = (id: number | "interest") => {
    const next = params.holding === id ? null : id
    setHolding(next)
    if (next === null) setHoverHoldingId(null)
  }

  useEditorIntent("dividend", () => {
    setEditing(null)
    setShowDividendEditor(true)
  })

  const basis = settings.dividendBasis

  const scopedEvents = useMemo(() => {
    let result = incomeEvents
    if (scopeId !== undefined) {
      result = result.filter((e) => e.portfolioId === scopeId)
    }
    if (kindFilter !== "all") {
      result = result.filter((e) => e.kind === kindFilter)
    }
    return result
  }, [incomeEvents, scopeId, kindFilter])

  const totalScoped = useMemo(
    () => scopedEvents.reduce((s, e) => s + eventAmount(e, basis), 0),
    [scopedEvents, basis]
  )

  const noHoldings = holdings.length === 0
  const noEvents = scopedEvents.length === 0

  const kindCount = (k: IncomeKind) =>
    scopedEvents.filter((e) => e.kind === k).length

  const portfolioScopedCount = useMemo(
    () =>
      scopeId === undefined
        ? incomeEvents.length
        : incomeEvents.filter((e) => e.portfolioId === scopeId).length,
    [incomeEvents, scopeId]
  )

  const totalDividend = useMemo(
    () => totalIncome(incomeEvents, scopeId, "dividend", basis),
    [incomeEvents, scopeId, basis]
  )
  const totalInterest = useMemo(
    () => totalIncome(incomeEvents, scopeId, "interest", basis),
    [incomeEvents, scopeId, basis]
  )
  const sort = useMemo(
    () => ({ key: params.sortKey, dir: params.sortDir }),
    [params.sortKey, params.sortDir]
  )

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
          <h1 className="title">Income</h1>
          <div
            className="muted small"
            style={{ marginTop: 4 }}
            data-testid="income-subtitle"
          >
            {`${scopedEvents.length}\u00A0${
              scopedEvents.length === 1 ? "payout" : "payouts"
            }`}{" "}
            · {fmtEUR(totalDividend)} dividends, {fmtEUR(totalInterest)}{" "}
            interest
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => {
              setEditing(null)
              setShowInterestEditor(true)
            }}
            data-testid="btn-add-interest"
          >
            <Icon name="plus" size={15} /> Record interest
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setEditing(null)
              setShowDividendEditor(true)
            }}
            data-testid="btn-add-dividend"
          >
            <Icon name="plus" size={15} /> Record dividend
          </button>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          flexWrap: "wrap",
          marginBottom: 12,
        }}
      >
        <SegControl<KindFilter>
          ariaLabel="Income kind"
          testId="income-kind-filter"
          options={[
            {
              value: "all",
              label: `All (${portfolioScopedCount})`,
            },
            {
              value: "dividend",
              label: `Dividends${kindFilter === "dividend" ? ` (${kindCount("dividend")})` : ""}`,
            },
            {
              value: "interest",
              label: `Interest${kindFilter === "interest" ? ` (${kindCount("interest")})` : ""}`,
            },
          ]}
          value={kindFilter}
          onChange={(v) => setKind(v)}
        />
        <SegControl<"net" | "gross">
          ariaLabel="Basis"
          testId="income-basis-toggle"
          options={[
            { value: "net", label: "Net" },
            { value: "gross", label: "Gross" },
          ]}
          value={basis}
          onChange={(v) => updateSettings({ dividendBasis: v })}
        />
      </div>

      {noHoldings && kindFilter !== "interest" ? (
        <div
          className="card card-pad muted"
          data-testid="income-empty-state"
          style={{ textAlign: "center" }}
        >
          No holdings yet — record your first dividend and you can create the
          holding right from the form.
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setEditing(null)
                setShowDividendEditor(true)
              }}
              data-testid="income-empty-record-dividend"
            >
              <Icon name="plus" size={15} /> Record dividend
            </button>
          </div>
          <div className="small" style={{ marginTop: 8 }}>
            or{" "}
            <Link href="/holdings" style={{ color: "var(--primary)" }}>
              manage holdings
            </Link>
          </div>
        </div>
      ) : noEvents ? (
        <>
          <KpiRow
            events={scopedEvents}
            scopeId={scopeId}
            kindFilter={kindFilter}
            basis={basis}
            totalScoped={totalScoped}
            asOf={asOf}
          />
          <div
            className="card card-pad muted"
            data-testid="income-empty-state"
            style={{ textAlign: "center" }}
          >
            No payouts recorded yet — record your first to populate this view.
          </div>
        </>
      ) : (
        <>
          <KpiRow
            events={scopedEvents}
            scopeId={scopeId}
            kindFilter={kindFilter}
            basis={basis}
            totalScoped={totalScoped}
            asOf={asOf}
          />

          <div className="overview-grid">
            <div className="card card-pad" data-testid="income-monthly-card">
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  marginBottom: 12,
                }}
              >
                <h3 style={{ fontSize: 15 }}>Monthly Payouts</h3>
                <div className="muted small">
                  Stacked by holding · line = trailing-12-mo income
                </div>
              </div>
              <MonthlyPayoutsChart
                events={scopedEvents}
                basis={basis}
                kindFilter={kindFilter}
                selectedMonth={params.month}
                onMonthSelect={setMonth}
                highlightedHoldingId={highlightedHoldingId}
              />
            </div>

            <div className="card card-pad" data-testid="income-sources-card">
              <h3 style={{ fontSize: 15, marginBottom: 12 }}>By Source</h3>
              <DonutBySource
                events={scopedEvents}
                basis={basis}
                kindFilter={kindFilter}
                highlightedHoldingId={highlightedHoldingId}
                onHighlightChange={setHoverHoldingId}
                onSelect={(id) => toggleHolding(id)}
              />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 15, marginBottom: 8 }}>Per Holding</h3>
            <PerHoldingTable
              events={scopedEvents}
              basis={basis}
              totalScoped={totalScoped}
              sort={sort}
              onSortChange={setSort}
              highlightedHoldingId={highlightedHoldingId}
              onRowHover={setHoverHoldingId}
              onRowSelect={(id) => toggleHolding(id)}
              asOf={asOf}
            />
          </div>

          <div className="card card-pad" style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: 15, marginBottom: 12 }}>Calendar Heatmap</h3>
            <IncomeCalendarHeatmap
              events={scopedEvents}
              basis={basis}
              selectedMonth={params.month}
              onMonthSelect={setMonth}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <RecentPayoutsTable
              events={scopedEvents}
              basis={basis}
              selectedMonth={params.month}
              onEdit={(e) => {
                setShowDividendEditor(false)
                setShowInterestEditor(false)
                setEditing(e)
              }}
              onDelete={(id) => deleteIncomeEvent(id)}
            />
          </div>
        </>
      )}

      <DividendEditor
        open={
          showDividendEditor ||
          (editing !== null && editing.kind === "dividend")
        }
        onOpenChange={(o) => {
          if (!o) {
            setShowDividendEditor(false)
            setEditing(null)
          }
        }}
        event={editing && editing.kind === "dividend" ? editing : null}
        portfolios={portfolios}
        holdings={holdings}
        defaultPortfolioId={activePortfolio.id}
        onSave={async (form) => {
          if (editing) {
            await updateIncomeEvent(editing.id, {
              kind: "dividend",
              holdingId: form.holdingId,
              paidDate: form.paidDate,
              amount: form.amount,
              tax: form.tax,
              note: form.note,
            })
          } else {
            await addIncomeEvent({
              kind: "dividend",
              holdingId: form.holdingId,
              paidDate: form.paidDate,
              amount: form.amount,
              tax: form.tax,
              note: form.note,
            })
          }
        }}
      />

      <InterestEditor
        open={
          showInterestEditor ||
          (editing !== null && editing.kind === "interest")
        }
        onOpenChange={(o) => {
          if (!o) {
            setShowInterestEditor(false)
            setEditing(null)
          }
        }}
        event={editing && editing.kind === "interest" ? editing : null}
        portfolios={portfolios}
        defaultPortfolioId={activePortfolio.id}
        onSave={async (form) => {
          if (editing) {
            await updateIncomeEvent(editing.id, {
              kind: "interest",
              holdingId: null,
              paidDate: form.paidDate,
              amount: form.amount,
              note: form.note,
            })
          } else {
            await addIncomeEvent({
              kind: "interest",
              portfolioId: form.portfolioId,
              holdingId: null,
              paidDate: form.paidDate,
              amount: form.amount,
              note: form.note,
            })
          }
        }}
      />
    </div>
  )
}
