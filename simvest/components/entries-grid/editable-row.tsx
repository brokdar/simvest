"use client"

import { Fragment, useEffect, useMemo, useRef } from "react"
import { Icon } from "@/components/icon"
import { Money } from "@/components/ui/money"
import { CellMoney } from "@/components/entries-grid/cell-money"
import { CellNote } from "@/components/entries-grid/cell-note"
import { CellDate } from "@/components/entries-grid/cell-date"
import {
  fromEntry,
  type CellKey,
  type DraftRow,
} from "@/components/entries-grid/draft-row"
import { fmtDate, fmtMonthLong } from "@/lib/dates"
import { valueChange } from "@/lib/calc"
import type { EntryDTO } from "@/lib/types"

type Props = {
  entry: EntryDTO | null
  draft: DraftRow | null
  /**
   * The portfolio's saved entries and this row's index in them, so the M/M Δ
   * can compare with the closest earlier *valued* row over the real gap
   * (N13). Null for draft rows, which have no history position yet.
   */
  history: { entries: EntryDTO[]; index: number } | null
  editMode: boolean
  defaultEntryDay: string
  isFocusPending: boolean
  onUpdateCell: <K extends CellKey>(
    cell: K,
    value: K extends "invested"
      ? number
      : K extends "value"
        ? number | null
        : string
  ) => void
  onCellError: (cell: "invested" | "value", error: string | null) => void
  onUpdateDate: (next: { year: number; month: number; day: number }) => void
  /** Restore an existing row that was already marked for deletion. */
  onRestore: () => void
  /** Open the shared delete-confirmation dialog (table-level) for this row. */
  onRequestDelete: () => void
  onRemoveDraft: () => void
  onFocusConsumed: () => void
  testIdSuffix: string
}

export function EditableRow({
  entry,
  draft,
  history,
  editMode,
  defaultEntryDay,
  isFocusPending,
  onUpdateCell,
  onCellError,
  onUpdateDate,
  onRestore,
  onRequestDelete,
  onRemoveDraft,
  onFocusConsumed,
  testIdSuffix,
}: Props) {
  // Hooks must run unconditionally regardless of whether we have something to
  // render. We always call useRef + useEffect; rendering is gated below.
  const firstFocusRef = useRef<HTMLTableCellElement>(null)
  useEffect(() => {
    if (!isFocusPending) return
    // Don't pop the on-screen keyboard on touch devices: a new draft row would
    // otherwise steal focus into its first cell the instant it's added. Consume
    // the pending focus so it doesn't linger for a later pointer/keyboard visit.
    const coarse =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches
    if (coarse) {
      onFocusConsumed()
      return
    }
    const el = firstFocusRef.current?.querySelector<HTMLElement>(
      "input, button, [contenteditable]"
    )
    if (el) {
      el.focus()
      onFocusConsumed()
    }
  }, [isFocusPending, onFocusConsumed])

  // display = draft if present, else derived from entry. fromEntry allocates a
  // Set + object, so we memoize: a 60-row table hit on every keystroke without
  // this was the hottest path in render profiles.
  const display: DraftRow | null = useMemo(
    () => draft ?? (entry !== null ? fromEntry(entry) : null),
    [draft, entry]
  )
  if (!display) return null

  const isExisting = display.original !== null
  const isToDelete = display.toDelete

  const change =
    history && isExisting && !isToDelete
      ? valueChange(history.entries, history.index, {
          value: display.value,
          invested: display.invested,
        })
      : null

  // A rejected amount means the row's numbers are unresolved: don't derive
  // anything (M/M Δ) from the last good value as if it still stood.
  const unresolved = Boolean(
    display.cellErrors.value || display.cellErrors.invested
  )

  const rowOpacity = isToDelete ? 0.45 : 1
  const rowDecoration = isToDelete ? "line-through" : "none"
  // Spelled-out month for per-row aria-labels ("Note for April 2026") so
  // screen readers can tell which row's input has focus — "Apr 26" read
  // aloud sounds like a day of the month.
  const monthLabel = fmtMonthLong(display.year, display.month)

  if (!editMode) {
    return (
      <tr
        data-testid={`entry-row-${testIdSuffix}`}
        data-month={`${display.year}-${display.month}`}
      >
        <td className="td-date">
          <div style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
            {fmtDate(display.year, display.month, display.day)}
          </div>
        </td>
        <td className="num td-invested" data-label="Added this month">
          <Money
            value={display.invested}
            sign
            tone={display.invested < 0 ? "neg" : "none"}
          />
        </td>
        <td
          className="num td-value"
          data-label="Portfolio value"
          style={{ fontWeight: 600 }}
        >
          <Money value={display.value} />
        </td>
        <td className="num td-delta" data-label="M/M Δ">
          <DeltaCell change={change} />
        </td>
        <td
          className="td-note"
          data-label="Note"
          data-empty={display.note ? undefined : "true"}
          style={{
            color: "var(--neutral-500)",
            fontStyle: display.note ? "normal" : "italic",
          }}
        >
          {/* L9: an empty note is just empty — 200 em-dashes said nothing. */}
          {display.note}
        </td>
        <td className="td-actions"></td>
      </tr>
    )
  }

  // editMode
  return (
    <Fragment>
      <tr
        data-testid={`entry-row-${testIdSuffix}`}
        data-month={`${display.year}-${display.month}`}
        data-dirty={isToDelete || display.touched.size > 0 ? "true" : undefined}
        data-draft={!isExisting ? "true" : undefined}
        style={{ opacity: rowOpacity, textDecoration: rowDecoration }}
      >
        <td className="td-date" ref={firstFocusRef}>
          <CellDate
            year={display.year}
            month={display.month}
            day={display.day}
            isDraft={!isExisting}
            defaultEntryDay={defaultEntryDay}
            onChange={onUpdateDate}
            testId={`cell-date-${testIdSuffix}`}
          />
        </td>
        <td className="num td-invested" data-label="Added this month">
          <CellMoney
            value={display.invested}
            onChange={(v) => onUpdateCell("invested", v ?? 0)}
            onError={(err) => onCellError("invested", err)}
            ariaLabel="Added this month"
            dirty={display.touched.has("invested")}
            allowEmpty={true}
            min={undefined}
            testId={`cell-invested-${testIdSuffix}`}
          />
        </td>
        <td className="num td-value" data-label="Portfolio value">
          <CellMoney
            value={display.value}
            onChange={(v) => onUpdateCell("value", v)}
            onError={(err) => onCellError("value", err)}
            ariaLabel="Portfolio value"
            dirty={display.touched.has("value")}
            allowEmpty={true}
            min={undefined}
            testId={`cell-value-${testIdSuffix}`}
          />
        </td>
        <td
          className="num td-delta"
          data-label="M/M Δ"
          data-testid={`cell-delta-${testIdSuffix}`}
        >
          {unresolved ? (
            <span
              className="muted mono"
              title="Fix the amount to see the change"
            >
              —
            </span>
          ) : (
            <DeltaCell change={change} />
          )}
        </td>
        <td className="td-note" data-label="Note">
          <CellNote
            value={display.note}
            onChange={(v) => onUpdateCell("note", v)}
            dirty={display.touched.has("note")}
            testId={`cell-note-${testIdSuffix}`}
            monthLabel={monthLabel}
          />
        </td>
        <td className="td-actions">
          <div style={{ display: "flex", gap: 4, opacity: 0.85 }}>
            {isExisting ? (
              isToDelete ? (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={onRestore}
                  aria-label="Restore entry"
                  data-testid={`row-restore-${testIdSuffix}`}
                  title="Restore"
                >
                  Restore
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-icon btn-ghost btn-sm"
                  aria-label="Delete entry"
                  data-testid={`row-delete-${testIdSuffix}`}
                  onClick={onRequestDelete}
                >
                  <Icon name="trash" size={14} />
                </button>
              )
            ) : (
              <button
                type="button"
                className="btn btn-icon btn-ghost btn-sm"
                onClick={onRemoveDraft}
                aria-label="Remove draft row"
                data-testid={`row-remove-${testIdSuffix}`}
                title="Discard this row"
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        </td>
      </tr>
      {display.error && (
        <tr data-testid={`row-error-${testIdSuffix}`} className="row-error">
          <td colSpan={6} style={{ paddingTop: 0, paddingBottom: 8 }}>
            <div
              role="alert"
              style={{
                color: "var(--critical)",
                fontSize: "var(--fs-xs)",
                paddingLeft: 20,
              }}
            >
              {display.error}
            </div>
          </td>
        </tr>
      )}
    </Fragment>
  )
}

/**
 * Value change net of contributions. When the closest earlier valued row is
 * more than one month back, the figure covers that whole gap — say so rather
 * than passing a multi-month change off as one month (N13).
 */
function DeltaCell({ change }: { change: ReturnType<typeof valueChange> }) {
  if (!change) return <span className="muted mono">—</span>
  if (change.gapMonths === 1) {
    return <Money value={change.delta} sign tone="auto" />
  }
  return (
    <span
      title={`Change over ${change.gapMonths} months — no value was recorded in between`}
      data-testid="delta-gap"
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "flex-end",
      }}
    >
      <Money value={change.delta} sign tone="auto" />
      <span className="muted" style={{ fontSize: "var(--fs-2xs)" }}>
        over {change.gapMonths} mo
      </span>
    </span>
  )
}
