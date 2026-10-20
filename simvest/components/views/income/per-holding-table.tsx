"use client"

import { useMemo } from "react"
import { Sparkline } from "@/components/sparkline"
import { eventAmount, inferCadence } from "@/lib/calc"
import {
  bucketByMonthEnding,
  dateMonthIdx,
  fromMonthIdx,
  recordedSpan,
} from "@/lib/income-window"
import { fmtEUR, fmtPct } from "@/lib/format"
import { fmtDate, fmtMonth, fromISODate } from "@/lib/dates"
import {
  CADENCE_HINT,
  CADENCE_LABEL,
  type DividendBasis,
  type IncomeCadence,
  type IncomeEventDTO,
} from "@/lib/types"
import type { IncomeSortDir, IncomeSortKey } from "./use-income-search-params"

type Props = {
  events: IncomeEventDTO[]
  basis: DividendBasis
  totalScoped: number
  sort: { key: IncomeSortKey; dir: IncomeSortDir }
  onSortChange: (next: { key: IncomeSortKey; dir: IncomeSortDir }) => void
  highlightedHoldingId: number | "interest" | null
  /** The persistent `?holding=` filter — drives each name button's aria-pressed. */
  selectedHoldingId: number | "interest" | null
  onRowHover: (id: number | "interest" | null) => void
  onRowSelect: (id: number | "interest") => void
  /** SSR-anchored "now" — see DataProvider.today. */
  asOf: Date
}

type Row = {
  id: number | "interest"
  name: string
  received: number
  lastPaid: string | null
  count: number
  cadence: IncomeCadence
  pct: number
  spark: number[]
}

const CADENCE_RANK: Record<IncomeCadence, number> = {
  daily: 0,
  weekly: 1,
  monthly: 2,
  quarterly: 3,
  "semi-annual": 4,
  annual: 5,
  irregular: 6,
  single: 7,
}

export function PerHoldingTable({
  events,
  basis,
  totalScoped,
  sort,
  onSortChange,
  highlightedHoldingId,
  selectedHoldingId,
  onRowHover,
  onRowSelect,
  asOf,
}: Props) {
  // Trend windows end with the last recorded month in view, not today, so
  // months that haven't been imported yet don't draw as a drop to zero.
  const trendEnd = useMemo(
    () => recordedSpan(events)?.last ?? dateMonthIdx(asOf),
    [events, asOf]
  )
  const rows = useMemo<Row[]>(() => {
    const grouped = new Map<string, IncomeEventDTO[]>()
    for (const e of events) {
      const key =
        e.kind === "interest" ? "interest" : `h:${e.holdingId ?? "null"}`
      const list = grouped.get(key) ?? []
      list.push(e)
      grouped.set(key, list)
    }
    const out: Row[] = []
    for (const [key, list] of grouped.entries()) {
      const received = list.reduce((s, e) => s + eventAmount(e, basis), 0)
      const sortedAsc = [...list].sort((a, b) =>
        a.paidDate < b.paidDate ? -1 : 1
      )
      const last = sortedAsc[sortedAsc.length - 1]
      const id: number | "interest" =
        key === "interest" ? "interest" : list[0].holdingId!
      const name =
        list[0].kind === "interest" ? "Interest" : (list[0].holdingName ?? "—")
      out.push({
        id,
        name,
        received,
        lastPaid: last?.paidDate ?? null,
        count: list.length,
        cadence: inferCadence(list),
        pct: totalScoped > 0 ? (received / totalScoped) * 100 : 0,
        spark: bucketByMonthEnding(list, trendEnd, 24, basis),
      })
    }
    out.sort((a, b) => compareRows(a, b, sort.key, sort.dir))
    return out
  }, [events, basis, totalScoped, sort, trendEnd])
  // One scale for the whole column (N12): a row's peak is drawn against the
  // biggest month of any row, so a 10× smaller source looks 10× smaller.
  const sparkDomain = useMemo(
    () => ({ min: 0, max: Math.max(1, ...rows.flatMap((r) => r.spark)) }),
    [rows]
  )
  const trendLabel = (() => {
    const { year, month } = fromMonthIdx(trendEnd)
    return `24 mo to ${fmtMonth(year, month)}`
  })()

  if (rows.length === 0) {
    return (
      <div className="muted small" style={{ padding: "20px 0" }}>
        No payouts recorded yet.
      </div>
    )
  }

  return (
    <div
      className="card"
      style={{ padding: 0, overflow: "hidden" }}
      data-testid="income-per-holding-table"
    >
      <table className="per-holding-table table">
        <thead>
          <tr>
            <Th
              label="Holding"
              sortKey="name"
              sort={sort}
              onSort={onSortChange}
            />
            <Th
              label="Received"
              sortKey="received"
              sort={sort}
              onSort={onSortChange}
              numeric
            />
            <Th
              label="Last paid"
              sortKey="lastPaid"
              sort={sort}
              onSort={onSortChange}
            />
            <Th
              label="Count"
              sortKey="count"
              sort={sort}
              onSort={onSortChange}
              numeric
            />
            <Th
              label="Cadence"
              sortKey="cadence"
              sort={sort}
              onSort={onSortChange}
            />
            <Th
              label="Share"
              sortKey="share"
              sort={sort}
              onSort={onSortChange}
              numeric
            />
            <th
              style={{ width: 140 }}
              title="Monthly payouts, every row on the same scale"
              data-testid="income-trend-header"
            >
              {trendLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isHighlighted =
              highlightedHoldingId !== null && highlightedHoldingId === r.id
            const date = r.lastPaid ? fromISODate(r.lastPaid) : null
            return (
              <tr
                key={String(r.id)}
                data-testid={`income-holding-row-${r.id}`}
                onMouseEnter={() => onRowHover(r.id)}
                onMouseLeave={() => onRowHover(null)}
                style={{
                  background: isHighlighted ? "var(--primary-50)" : undefined,
                }}
              >
                <td
                  className="td-ph-name"
                  style={{ paddingLeft: 18, minWidth: 0 }}
                >
                  <button
                    type="button"
                    onClick={() => onRowSelect(r.id)}
                    className="ph-name-btn tap-pad focus-ring"
                    aria-label={`Filter income by ${r.name}`}
                    aria-pressed={selectedHoldingId === r.id}
                    translate="no"
                    title={r.name}
                    style={{
                      background: "transparent",
                      border: "none",
                      font: "inherit",
                      color: "inherit",
                      cursor: "pointer",
                      fontWeight: 600,
                      display: "block",
                      maxWidth: 280,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      textAlign: "left",
                    }}
                  >
                    {r.name}
                  </button>
                </td>
                <td className="num mono td-ph-received" data-label="Received">
                  {fmtEUR(r.received)}
                </td>
                <td className="small td-ph-lastpaid" data-label="Last paid">
                  {date ? fmtDate(date.year, date.month, date.day) : "—"}
                </td>
                <td className="num mono td-ph-count" data-label="Count">
                  {r.count}
                </td>
                <td className="td-ph-cadence" data-label="Cadence">
                  <span
                    className="chip"
                    title={CADENCE_HINT[r.cadence]}
                    data-testid={`income-cadence-${r.id}`}
                  >
                    {CADENCE_LABEL[r.cadence]}
                  </span>
                </td>
                <td
                  className="num mono td-ph-share"
                  style={{ position: "relative" }}
                >
                  <div
                    aria-hidden="true"
                    className="ph-share-bar"
                    style={{
                      position: "absolute",
                      left: 18,
                      right: 18,
                      bottom: 8,
                      height: 4,
                      background: "var(--neutral-100)",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, r.pct)}%`,
                        height: "100%",
                        background: "var(--primary)",
                      }}
                    />
                  </div>
                  <span
                    className="ph-share-value"
                    style={{ position: "relative" }}
                  >
                    {fmtPct(r.pct, 1)}
                  </span>
                </td>
                <td className="td-ph-spark">
                  <Sparkline data={r.spark} domain={sparkDomain} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function compareRows(
  a: Row,
  b: Row,
  key: IncomeSortKey,
  dir: IncomeSortDir
): number {
  const mult = dir === "asc" ? 1 : -1
  switch (key) {
    case "name":
      return a.name.localeCompare(b.name) * mult
    case "received":
      return (a.received - b.received) * mult
    case "lastPaid":
      return ((a.lastPaid ?? "") < (b.lastPaid ?? "") ? -1 : 1) * mult
    case "count":
      return (a.count - b.count) * mult
    case "cadence":
      return (CADENCE_RANK[a.cadence] - CADENCE_RANK[b.cadence]) * mult
    case "share":
      return (a.pct - b.pct) * mult
  }
}

function Th({
  label,
  sortKey,
  sort,
  onSort,
  numeric = false,
}: {
  label: string
  sortKey: IncomeSortKey
  sort: { key: IncomeSortKey; dir: IncomeSortDir }
  onSort: (next: { key: IncomeSortKey; dir: IncomeSortDir }) => void
  numeric?: boolean
}) {
  const active = sort.key === sortKey
  const ariaSort = active
    ? sort.dir === "asc"
      ? "ascending"
      : "descending"
    : "none"
  const handleClick = () => {
    if (active)
      onSort({ key: sortKey, dir: sort.dir === "asc" ? "desc" : "asc" })
    else onSort({ key: sortKey, dir: sortKey === "name" ? "asc" : "desc" })
  }
  return (
    <th
      className={numeric ? "num" : ""}
      style={{ paddingLeft: numeric ? undefined : 18 }}
      aria-sort={ariaSort}
      data-testid={`income-sort-${sortKey}`}
    >
      <button
        type="button"
        onClick={handleClick}
        className="focus-ring"
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          background: "transparent",
          border: "none",
          padding: 0,
          font: "inherit",
          color: "inherit",
          cursor: "pointer",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          fontSize: "var(--fs-2xs)",
          fontWeight: 600,
        }}
        aria-label={`Sort by ${label}`}
      >
        {label}
        <span aria-hidden="true" style={{ opacity: active ? 1 : 0.25 }}>
          {active && sort.dir === "asc" ? "▲" : "▼"}
        </span>
      </button>
    </th>
  )
}
