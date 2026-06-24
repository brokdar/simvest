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
import { formatEntryDate } from "@/lib/dates"
import { labelFor, type EntryDTO } from "@/lib/types"

type Props = {
  entry: EntryDTO | null
  draft: DraftRow | null
  prev: EntryDTO | null
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
  prev,
  editMode,
  defaultEntryDay,
  isFocusPending,
  onUpdateCell,
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

  const delta =
    prev &&
    display.value !== null &&
    prev.value !== null &&
    isExisting &&
    !isToDelete
      ? display.value - prev.value - display.invested
      : 0

  const rowOpacity = isToDelete ? 0.45 : 1
  const rowDecoration = isToDelete ? "line-through" : "none"
  // Short label used in per-row aria-labels (e.g. "Note for Dec 23") so screen
  // readers can disambiguate which row's input has focus.
  const monthLabel = labelFor(display.year, display.month)

  if (!editMode) {
    return (
      <tr data-testid={`entry-row-${testIdSuffix}`}>
        <td style={{ paddingLeft: 20 }}>
          <div style={{ fontWeight: 600 }}>
            {formatEntryDate(display.year, display.month, display.day)}
          </div>
        </td>
        <td className="num">
          <Money
            value={display.invested}
            sign
            tone={display.invested < 0 ? "neg" : "none"}
          />
        </td>
        <td className="num" style={{ fontWeight: 600 }}>
          <Money value={display.value} />
        </td>
        <td className="num">
          {display.value == null || prev?.value == null ? (
            <span className="muted mono">—</span>
          ) : (
            <Money value={delta} sign tone="auto" />
          )}
        </td>
        <td
          style={{
            color: "var(--neutral-500)",
            fontStyle: display.note ? "normal" : "italic",
          }}
        >
          {display.note || <span className="muted">—</span>}
        </td>
        <td></td>
      </tr>
    )
  }

  // editMode
  return (
    <Fragment>
      <tr
        data-testid={`entry-row-${testIdSuffix}`}
        data-dirty={isToDelete || display.touched.size > 0 ? "true" : undefined}
        data-draft={!isExisting ? "true" : undefined}
        style={{ opacity: rowOpacity, textDecoration: rowDecoration }}
      >
        <td style={{ paddingLeft: 20 }} ref={firstFocusRef}>
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
        <td className="num">
          <CellMoney
            value={display.invested}
            onChange={(v) => onUpdateCell("invested", v ?? 0)}
            ariaLabel="Invested"
            dirty={display.touched.has("invested")}
            allowEmpty={true}
            min={undefined}
            testId={`cell-invested-${testIdSuffix}`}
          />
        </td>
        <td className="num">
          <CellMoney
            value={display.value}
            onChange={(v) => onUpdateCell("value", v)}
            ariaLabel="Portfolio value"
            dirty={display.touched.has("value")}
            allowEmpty={true}
            min={undefined}
            testId={`cell-value-${testIdSuffix}`}
          />
        </td>
        <td className="num">
          {display.value == null || prev?.value == null ? (
            <span className="muted mono">—</span>
          ) : (
            <Money value={delta} sign tone="auto" />
          )}
        </td>
        <td>
          <CellNote
            value={display.note}
            onChange={(v) => onUpdateCell("note", v)}
            dirty={display.touched.has("note")}
            testId={`cell-note-${testIdSuffix}`}
            monthLabel={monthLabel}
          />
        </td>
        <td>
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
                  style={{ color: "var(--neg)" }}
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
        <tr data-testid={`row-error-${testIdSuffix}`}>
          <td colSpan={6} style={{ paddingTop: 0, paddingBottom: 8 }}>
            <div
              role="alert"
              style={{
                color: "var(--danger, #B91C1C)",
                fontSize: 12,
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
