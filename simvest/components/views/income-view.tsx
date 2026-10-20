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
import { GoalProgressStrip } from "@/components/goal-progress-strip"
import { KpiRow } from "@/components/views/income/kpi-row"
import { ComingUpCard } from "@/components/views/income/coming-up-card"
import { PerHoldingTable } from "@/components/views/income/per-holding-table"
import { RecentPayoutsTable } from "@/components/views/income/recent-payouts-table"
import { useIncomeSearchParams } from "@/components/views/income/use-income-search-params"
import { SegControl } from "@/components/ui/seg-control"
import { CsvExportButton } from "@/components/csv-export-button"
import { ViewHeadline } from "@/components/view-headline"
import { eventAmount, totalIncome } from "@/lib/calc"
import { incomeWindow } from "@/lib/income-window"
import { incomeHeadline } from "@/lib/narrative"
import { toCsv, type CsvColumn } from "@/lib/export/to-csv"
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
    goals,
    goalEvals,
    settings,
    today,
  } = useData()
  // Close the record→plan loop where income lives: show progress for dividend
  // goals only. Hidden entirely when there are none.
  const dividendGoals = useMemo(
    () =>
      goals.filter(
        (g) => g.kind === "dividend_annual" || g.kind === "dividend_monthly"
      ),
    [goals]
  )
  const incomeCsvColumns: CsvColumn<IncomeEventDTO>[] = [
    { header: "paidDate", value: (e) => e.paidDate },
    { header: "kind", value: (e) => e.kind },
    { header: "holdingName", value: (e) => e.holdingName },
    { header: "amount", value: (e) => e.amount },
    { header: "tax", value: (e) => e.tax },
    { header: "note", value: (e) => e.note },
  ]
  // Single Date instance per render so memo deps stay stable.
  const asOf = useMemo(() => new Date(today), [today])
  const {
    addIncomeEvent,
    updateIncomeEvent,
    deleteIncomeEvent,
    updateSettings,
  } = useDataActions()

  const portfolioName = (id: number) =>
    portfolios.find((p) => p.id === id)?.name ?? "A portfolio"

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

  // The persistent `?holding=` filter narrows the two lists (per-holding table
  // and recent payouts) to that source; the charts keep every source and dim
  // the rest, so the filtered state stays visible next to its context.
  const holdingFilter = params.holding
  const filteredEvents = useMemo(
    () =>
      holdingFilter === null
        ? scopedEvents
        : scopedEvents.filter((e) =>
            holdingFilter === "interest"
              ? e.kind === "interest"
              : e.holdingId === holdingFilter
          ),
    [scopedEvents, holdingFilter]
  )
  const holdingFilterName =
    holdingFilter === null
      ? null
      : holdingFilter === "interest"
        ? "Interest"
        : (holdings.find((h) => h.id === holdingFilter)?.name ??
          "an unknown holding")

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
  // P7: the page's one sentence, from the same like-for-like window the
  // "Last 12 months" KPI uses.
  const headline = useMemo(() => {
    const window = incomeWindow(scopedEvents, { basis, now: asOf })
    return incomeHeadline({
      events: scopedEvents,
      basis,
      window,
      now: asOf,
      noun:
        kindFilter === "dividend"
          ? "dividends"
          : kindFilter === "interest"
            ? "interest"
            : "income",
      lagging: window.lagging.map((l) => ({
        name:
          portfolios.find((p) => p.id === l.portfolioId)?.name ?? "A portfolio",
      })),
    })
  }, [scopedEvents, basis, asOf, kindFilter, portfolios])
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
          <ViewHeadline text={headline} testId="income-headline" />
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <CsvExportButton
            filename="simvest-income.csv"
            buildCsv={() => toCsv(incomeCsvColumns, scopedEvents)}
            testId="btn-export-income"
          />
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
            className="btn btn-primary income-dividend-action"
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
        {/* C9: say "tax" out loud — Net/Gross alone is jargon. */}
        <SegControl<"net" | "gross">
          ariaLabel="Show amounts before or after tax"
          testId="income-basis-toggle"
          options={[
            { value: "net", label: "After tax" },
            { value: "gross", label: "Before tax" },
          ]}
          value={basis}
          onChange={(v) => updateSettings({ dividendBasis: v })}
        />
        <span
          className="muted small"
          style={{ fontSize: "var(--fs-2xs)" }}
          data-testid="income-basis-hint"
        >
          {basis === "net"
            ? "What reached your account, after withholding tax"
            : "What was paid out, before withholding tax"}
        </span>
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
            portfolioName={portfolioName}
          />
          <div className="card card-pad" data-testid="income-empty-state">
            <div className="empty-state">
              <div className="empty-title">
                {kindFilter === "interest"
                  ? "No interest recorded yet"
                  : kindFilter === "dividend"
                    ? "No dividends recorded yet"
                    : "No payouts recorded yet"}
              </div>
              <div className="empty-sub">
                Record a dividend or an interest payment — or import a broker
                export from Monthly entries — and the charts and totals fill in.
              </div>
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  justifyContent: "center",
                }}
              >
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    setEditing(null)
                    setShowDividendEditor(true)
                  }}
                  data-testid="income-empty-dividend"
                >
                  <Icon name="plus" size={14} /> Record dividend
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => {
                    setEditing(null)
                    setShowInterestEditor(true)
                  }}
                  data-testid="income-empty-interest"
                >
                  <Icon name="plus" size={14} /> Record interest
                </button>
              </div>
            </div>
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
            portfolioName={portfolioName}
          />

          <ComingUpCard
            events={scopedEvents}
            basis={basis}
            today={today}
            portfolioName={portfolioName}
          />

          {holdingFilterName !== null && (
            <div
              className="income-filter-bar"
              role="status"
              data-testid="income-holding-filter"
            >
              <span className="muted small">
                Showing payouts from{" "}
                <strong style={{ color: "var(--neutral-800)" }}>
                  {holdingFilterName}
                </strong>{" "}
                · {filteredEvents.length}{" "}
                {filteredEvents.length === 1 ? "payout" : "payouts"}
              </span>
              <button
                type="button"
                className="chip primary income-filter-clear"
                onClick={() => toggleHolding(holdingFilter!)}
                aria-label="Clear filter: show all sources"
                data-testid="income-holding-filter-clear"
              >
                <Icon name="close" size={12} /> Show all
              </button>
            </div>
          )}

          <GoalProgressStrip
            goals={dividendGoals}
            goalEvals={goalEvals}
            portfolios={portfolios}
            title="Dividend goal progress"
            testId="income-goal-progress"
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
                <h3 style={{ fontSize: "var(--fs-lg)" }}>Monthly Payouts</h3>
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
              <h3 style={{ fontSize: "var(--fs-lg)", marginBottom: 12 }}>
                By Source
              </h3>
              <DonutBySource
                events={scopedEvents}
                basis={basis}
                kindFilter={kindFilter}
                highlightedHoldingId={highlightedHoldingId}
                onHighlightChange={setHoverHoldingId}
                onSelect={(id) => toggleHolding(id)}
                selectedHoldingId={params.holding}
              />
            </div>
          </div>

          <div style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: "var(--fs-lg)", marginBottom: 8 }}>
              Per Holding
            </h3>
            <PerHoldingTable
              events={filteredEvents}
              basis={basis}
              totalScoped={totalScoped}
              sort={sort}
              onSortChange={setSort}
              highlightedHoldingId={highlightedHoldingId}
              selectedHoldingId={params.holding}
              onRowHover={setHoverHoldingId}
              onRowSelect={(id) => toggleHolding(id)}
              asOf={asOf}
            />
          </div>

          <div className="card card-pad" style={{ marginTop: 16 }}>
            <h3 style={{ fontSize: "var(--fs-lg)", marginBottom: 12 }}>
              Calendar Heatmap
            </h3>
            <IncomeCalendarHeatmap
              events={scopedEvents}
              basis={basis}
              selectedMonth={params.month}
              onMonthSelect={setMonth}
              asOf={asOf}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <RecentPayoutsTable
              events={filteredEvents}
              basis={basis}
              selectedMonth={params.month}
              portfolioName={portfolioName}
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
