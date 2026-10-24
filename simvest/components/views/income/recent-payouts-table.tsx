"use client"

import { useEffect, useMemo, useRef, useState } from "react"
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
import { eventAmount } from "@/lib/calc"
import { groupInterestRuns, type PayoutItem } from "@/lib/payout-runs"
import { fmtEUR } from "@/lib/format"
import { fmtDate, fmtMonthKey, fromISODate } from "@/lib/dates"
import {
  BASIS_LABEL,
  type DividendBasis,
  type IncomeEventDTO,
} from "@/lib/types"

const DEFAULT_LIMIT = 20

type Props = {
  events: IncomeEventDTO[]
  basis: DividendBasis
  selectedMonth: string | null
  /** Clears the month selection (`?month=`). */
  onClearMonth?: () => void
  /** Portfolio id → display name, for the folded interest rows. */
  portfolioName: (id: number) => string
  onEdit: (event: IncomeEventDTO) => void
  onDelete: (id: number) => void
}

export function RecentPayoutsTable({
  events,
  basis,
  selectedMonth,
  onClearMonth,
  portfolioName,
  onEdit,
  onDelete,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  // Folded interest runs the user opened up, by run key.
  const [openRuns, setOpenRuns] = useState<Set<string>>(() => new Set())
  const containerRef = useRef<HTMLDivElement | null>(null)

  const sorted = useMemo(
    () => [...events].sort((a, b) => (a.paidDate > b.paidDate ? -1 : 1)),
    [events]
  )
  // T3: a month of daily interest from one account is one line, so the
  // dividends aren't buried under hundreds of identical rows.
  const items = useMemo(() => groupInterestRuns(sorted), [sorted])
  const selectedRowIdx = useMemo(
    () =>
      selectedMonth
        ? items.findIndex((it) => itemMonth(it) === selectedMonth)
        : -1,
    [items, selectedMonth]
  )
  const effectiveExpanded = expanded || selectedRowIdx >= DEFAULT_LIMIT
  const visible = effectiveExpanded ? items : items.slice(0, DEFAULT_LIMIT)
  const hasMore = items.length > DEFAULT_LIMIT
  const toggleRun = (key: string) =>
    setOpenRuns((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  useEffect(() => {
    if (!selectedMonth || !containerRef.current) return
    const el = containerRef.current.querySelector(
      `[data-testid="income-anchor-row-${selectedMonth}"]`
    ) as HTMLElement | null
    if (!el) return
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    el.scrollIntoView({
      behavior: reduced ? "auto" : "smooth",
      block: "center",
    })
  }, [selectedMonth, visible])

  const renderEvent = (e: IncomeEventDTO) => {
    const { year, month, day } = fromISODate(e.paidDate)
    const monthKey = `${year}-${String(month).padStart(2, "0")}`
    const highlight = selectedMonth === monthKey
    return (
      <tr
        key={e.id}
        data-testid={`income-row-${e.id}`}
        style={{
          background: highlight ? "var(--primary-50)" : undefined,
        }}
      >
        <td
          className="td-rp-date"
          style={{ paddingLeft: 18 }}
          data-testid={`income-anchor-row-${monthKey}`}
        >
          <div style={{ fontWeight: 600 }}>{fmtDate(year, month, day)}</div>
        </td>
        <td className="td-rp-source" data-label="Source">
          {e.kind === "interest" ? (
            <span className="muted small">Broker-paid interest</span>
          ) : (
            <span style={{ fontWeight: 600 }}>{e.holdingName ?? "—"}</span>
          )}
        </td>
        <td className="td-rp-kind">
          <span
            className="chip"
            style={{
              background:
                e.kind === "dividend"
                  ? "var(--primary-50)"
                  : "var(--tertiary-50)",
              color:
                e.kind === "dividend" ? "var(--primary)" : "var(--tertiary)",
              fontWeight: 600,
              fontSize: "var(--fs-2xs)",
            }}
          >
            {e.kind === "dividend" ? "Dividend" : "Interest"}
          </span>
        </td>
        <td
          className="num mono pos td-rp-amount"
          data-label={`Amount (${BASIS_LABEL[basis]})`}
        >
          {fmtEUR(eventAmount(e, basis))}
        </td>
        <td
          className="td-rp-note"
          data-label="Note"
          data-empty={e.note ? undefined : "true"}
          style={{
            color: "var(--neutral-500)",
            fontStyle: e.note ? "normal" : "italic",
          }}
        >
          {e.note || <span className="muted">—</span>}
        </td>
        <td className="td-rp-actions">
          <div className="row-actions">
            <button
              type="button"
              className="btn btn-icon btn-ghost btn-sm"
              aria-label="Edit income event"
              onClick={() => onEdit(e)}
            >
              <Icon name="edit" size={14} />
            </button>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  className="btn btn-icon btn-ghost btn-sm"
                  aria-label="Delete income event"
                >
                  <Icon name="trash" size={14} />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete entry?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {e.kind === "dividend"
                      ? `${e.holdingName ?? "Dividend"} · `
                      : "Interest · "}
                    {fmtDate(year, month, day)} will be permanently removed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => onDelete(e.id)}>
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </td>
      </tr>
    )
  }

  return (
    <div
      ref={containerRef}
      className="card"
      style={{ padding: 0, overflow: "hidden" }}
      data-testid="income-recent-table"
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 18px",
          borderBottom: "1px solid var(--border)",
          background: "var(--neutral-50)",
        }}
      >
        <div style={{ fontSize: "var(--fs-sm)", fontWeight: 600 }}>
          Recent Payouts
        </div>
        {selectedMonth && onClearMonth && (
          <div
            data-testid="income-month-header"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              fontSize: "var(--fs-sm)",
            }}
          >
            <span>Showing {fmtMonthKey(selectedMonth)}</span>
            <button
              type="button"
              className="btn btn-secondary btn-sm focus-ring"
              data-testid="income-month-clear"
              onClick={onClearMonth}
              style={{ minHeight: 44 }}
            >
              Show all months
            </button>
          </div>
        )}
        {hasMore && (
          <button
            type="button"
            className="btn btn-secondary btn-sm focus-ring"
            data-testid="income-recent-toggle"
            onClick={() => setExpanded((e) => !e)}
            aria-expanded={effectiveExpanded}
          >
            {effectiveExpanded
              ? "Show Fewer"
              : `Show All Payouts (${sorted.length})`}
          </button>
        )}
      </div>
      <table className="recent-payouts-table table">
        <thead>
          <tr>
            <th style={{ paddingLeft: 18 }}>Paid date</th>
            <th>Source</th>
            <th>Kind</th>
            <th className="num">Amount ({BASIS_LABEL[basis]})</th>
            <th>Note</th>
            <th style={{ width: 80 }} aria-label="Actions" scope="col"></th>
          </tr>
        </thead>
        <tbody>
          {visible.flatMap((it) => {
            if (it.type === "event") return [renderEvent(it.event)]
            const open = openRuns.has(it.key)
            const total = it.events.reduce(
              (sum, e) => sum + eventAmount(e, basis),
              0
            )
            const head = (
              <tr
                key={`run-${it.key}`}
                data-testid={`income-run-${it.key}`}
                style={{
                  background:
                    selectedMonth === it.month
                      ? "var(--primary-50)"
                      : undefined,
                }}
              >
                <td
                  className="td-rp-date"
                  style={{ paddingLeft: 18 }}
                  data-testid={`income-anchor-row-${it.month}`}
                >
                  <div style={{ fontWeight: 600 }}>{fmtMonthKey(it.month)}</div>
                </td>
                <td className="td-rp-source" data-label="Source">
                  <span style={{ fontWeight: 600 }}>
                    {portfolioName(it.portfolioId)} interest
                  </span>{" "}
                  <span className="muted small">
                    · {it.events.length} payouts
                  </span>
                </td>
                <td className="td-rp-kind">
                  <span
                    className="chip"
                    style={{
                      background: "var(--tertiary-50)",
                      color: "var(--tertiary)",
                      fontWeight: 600,
                      fontSize: "var(--fs-2xs)",
                    }}
                  >
                    Interest
                  </span>
                </td>
                <td
                  className="num mono pos td-rp-amount"
                  data-label={`Amount (${BASIS_LABEL[basis]})`}
                >
                  {fmtEUR(total)}
                </td>
                <td className="td-rp-note" data-label="Note">
                  <span className="muted small">One line per month</span>
                </td>
                <td className="td-rp-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    aria-expanded={open}
                    aria-label={`${open ? "Hide" : "Show"} the ${it.events.length} ${portfolioName(it.portfolioId)} interest payouts`}
                    onClick={() => toggleRun(it.key)}
                    data-testid={`income-run-toggle-${it.key}`}
                  >
                    {open ? "Hide" : "Show"}
                  </button>
                </td>
              </tr>
            )
            return open ? [head, ...it.events.map(renderEvent)] : [head]
          })}
          {visible.length === 0 && (
            <tr>
              <td colSpan={6} style={{ padding: 24 }}>
                <span className="muted small">
                  No income events in this view.
                </span>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

function itemMonth(it: PayoutItem): string {
  return it.type === "run" ? it.month : it.event.paidDate.slice(0, 7)
}
