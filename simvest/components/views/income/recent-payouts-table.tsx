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
import { fmtEUR } from "@/lib/format"
import { formatEntryDate, fromISODate } from "@/lib/dates"
import type { DividendBasis, IncomeEventDTO } from "@/lib/types"

const DEFAULT_LIMIT = 20

type Props = {
  events: IncomeEventDTO[]
  basis: DividendBasis
  selectedMonth: string | null
  onEdit: (event: IncomeEventDTO) => void
  onDelete: (id: number) => void
}

export function RecentPayoutsTable({
  events,
  basis,
  selectedMonth,
  onEdit,
  onDelete,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)

  const sorted = useMemo(
    () => [...events].sort((a, b) => (a.paidDate > b.paidDate ? -1 : 1)),
    [events]
  )
  const selectedRowIdx = useMemo(
    () =>
      selectedMonth
        ? sorted.findIndex((e) => e.paidDate.startsWith(selectedMonth))
        : -1,
    [sorted, selectedMonth]
  )
  const effectiveExpanded = expanded || selectedRowIdx >= DEFAULT_LIMIT
  const visible = effectiveExpanded ? sorted : sorted.slice(0, DEFAULT_LIMIT)
  const hasMore = sorted.length > DEFAULT_LIMIT

  useEffect(() => {
    if (!selectedMonth || !containerRef.current) return
    const el = containerRef.current.querySelector(
      `[data-testid="income-row-anchor-${selectedMonth}"]`
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
        <div style={{ fontSize: 13, fontWeight: 600 }}>Recent Payouts</div>
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
      <table className="table">
        <thead>
          <tr>
            <th style={{ paddingLeft: 18 }}>Paid date</th>
            <th>Source</th>
            <th>Kind</th>
            <th className="num">Amount ({basis})</th>
            <th>Note</th>
            <th style={{ width: 80 }} aria-label="Actions" scope="col"></th>
          </tr>
        </thead>
        <tbody>
          {visible.map((e) => {
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
                  style={{ paddingLeft: 18 }}
                  data-testid={`income-row-anchor-${monthKey}`}
                >
                  <div style={{ fontWeight: 600 }}>
                    {formatEntryDate(year, month, day)}
                  </div>
                </td>
                <td>
                  {e.kind === "interest" ? (
                    <span className="muted small">Broker-paid interest</span>
                  ) : (
                    <span style={{ fontWeight: 600 }}>
                      {e.holdingName ?? "—"}
                    </span>
                  )}
                </td>
                <td>
                  <span
                    className="chip"
                    style={{
                      background:
                        e.kind === "dividend"
                          ? "var(--primary-50)"
                          : "var(--tertiary-50)",
                      color:
                        e.kind === "dividend"
                          ? "var(--primary)"
                          : "var(--tertiary)",
                      fontWeight: 600,
                      fontSize: 11,
                    }}
                  >
                    {e.kind === "dividend" ? "Dividend" : "Interest"}
                  </span>
                </td>
                <td className="num mono pos">
                  {fmtEUR(eventAmount(e, basis))}
                </td>
                <td
                  style={{
                    color: "var(--neutral-500)",
                    fontStyle: e.note ? "normal" : "italic",
                  }}
                >
                  {e.note || <span className="muted">—</span>}
                </td>
                <td>
                  <div style={{ display: "flex", gap: 4, opacity: 0.7 }}>
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
                          style={{ color: "var(--neg)" }}
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
                            {formatEntryDate(year, month, day)} will be
                            permanently removed.
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
