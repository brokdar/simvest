"use client"

import { useToast } from "@/components/providers/toast"
import { useCallback, useEffect, useMemo, useState } from "react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Icon } from "@/components/icon"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { EditableRow } from "@/components/entries-grid/editable-row"
import { SaveFooter } from "@/components/entries-grid/save-footer"
import {
  describeChange,
  nextMonthAfter,
} from "@/components/entries-grid/draft-row"
import type { UseEditableEntries } from "@/components/entries-grid/use-editable-entries"
import type { EntryDTO, PortfolioDTO, SettingsDTO } from "@/lib/types"
import { MonthYearPicker } from "@/components/month-year-picker"
import { fmtDate } from "@/lib/dates"
import { fmtCount } from "@/lib/format"

type Props = {
  portfolio: PortfolioDTO
  isCombined: boolean
  controller: UseEditableEntries
  settings: SettingsDTO
}

export function EditableEntriesTable({
  portfolio,
  isCombined,
  controller,
  settings,
}: Props) {
  const {
    drafts,
    draftRows,
    editMode,
    isSaving,
    saveStatus,
    pendingFocusKey,
    dirtyCount,
    dirtyDrafts,
    errorCount,
    toggleEdit,
    exitEditMode,
    addDraft,
    focusKey,
    updateCell,
    toggleDelete,
    saveAll,
    consumeFocus,
  } = controller

  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false)
  // Shared delete confirmation — one AlertDialog instance for the whole table
  // instead of one per row.
  const [pendingDelete, setPendingDelete] = useState<EntryDTO | null>(null)

  const handleEditClick = useCallback(() => {
    toggleEdit(true)
  }, [toggleEdit])

  const handleAddRow = useCallback(() => {
    const base = nextMonthAfter(portfolio, settings.defaultEntryDay)
    addDraft(base)
  }, [addDraft, portfolio, settings.defaultEntryDay])

  // Single-click "Add entry" from read mode: enter edit mode, append a draft,
  // and focus its first input — same path as the topbar "+ New entry" intent.
  const handleAddEntryFromRead = useCallback(() => {
    toggleEdit(true)
    const base = nextMonthAfter(portfolio, settings.defaultEntryDay)
    const key = addDraft(base)
    focusKey(key)
  }, [toggleEdit, portfolio, settings.defaultEntryDay, addDraft, focusKey])

  const handleCancel = useCallback(() => {
    if (dirtyCount > 0) {
      setCancelConfirmOpen(true)
    } else {
      exitEditMode()
    }
  }, [dirtyCount, exitEditMode])

  const { toast } = useToast()
  const confirmCancel = useCallback(() => {
    setCancelConfirmOpen(false)
    exitEditMode()
    // D6: discarding must not look like saving — say what was thrown away.
    toast(
      `Discarded ${fmtCount(dirtyCount, "change", "changes")} — nothing was saved`,
      "info"
    )
  }, [exitEditMode, toast, dirtyCount])

  const confirmDelete = useCallback(() => {
    if (pendingDelete) toggleDelete(pendingDelete)
    setPendingDelete(null)
  }, [pendingDelete, toggleDelete])

  // D7: name what Discard throws away — month plus old → new values.
  const pendingChanges = useMemo(
    () => dirtyDrafts.map(describeChange),
    [dirtyDrafts]
  )
  const MAX_LISTED = 5

  // Reverse-chronological for read mode; same order in edit mode so users
  // see drafts at the top and history below.
  const reversedEntries = useMemo(
    () => [...portfolio.entries].reverse(),
    [portfolio.entries]
  )

  // M8: jump straight to a month instead of scrolling through years of rows.
  // Only months that have a row are pickable, so a jump always lands.
  const entryMonths = useMemo(
    () => new Set(portfolio.entries.map((e) => `${e.year}-${e.month}`)),
    [portfolio.entries]
  )
  const firstEntry = portfolio.entries[0]
  const lastEntry = portfolio.entries.at(-1)
  const jumpTo = useCallback((v: { year: number; month: number } | null) => {
    if (!v) return
    const row = document.querySelector<HTMLElement>(
      `[data-testid="entries-table"] tr[data-month="${v.year}-${v.month}"]`
    )
    if (!row) return
    row.scrollIntoView({ block: "center" })
    row.dataset.flash = "true"
    window.setTimeout(() => delete row.dataset.flash, 1800)
  }, [])

  // Keyboard shortcuts: only fire when the user isn't typing into a field.
  //   E         — toggle edit mode (only when not already in it)
  //   Esc       — cancel edit mode (with AlertDialog if dirty)
  //   Cmd/Ctrl+Enter — save all
  useEffect(() => {
    function isTypingTarget(t: EventTarget | null): boolean {
      if (!(t instanceof HTMLElement)) return false
      const tag = t.tagName
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
      if (t.isContentEditable) return true
      return false
    }
    function onKey(e: KeyboardEvent) {
      if (isCombined) return
      if (!editMode) {
        if (
          e.key === "e" &&
          !e.metaKey &&
          !e.ctrlKey &&
          !e.altKey &&
          !e.shiftKey &&
          !isTypingTarget(e.target)
        ) {
          e.preventDefault()
          handleEditClick()
        }
        return
      }
      // edit mode
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault()
        if (!isSaving && dirtyCount > 0) saveAll()
        return
      }
      if (
        e.key === "Escape" &&
        !isTypingTarget(e.target) &&
        !cancelConfirmOpen
      ) {
        e.preventDefault()
        handleCancel()
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [
    isCombined,
    editMode,
    isSaving,
    dirtyCount,
    cancelConfirmOpen,
    handleEditClick,
    handleCancel,
    saveAll,
  ])

  return (
    <>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 10,
          gap: 8,
          flexWrap: "wrap",
        }}
      >
        <div className="entries-grid-lead">
          <div className="muted small" data-testid="entries-grid-mode-hint">
            {isCombined
              ? "All accounts added up, month by month — pick an account in the header to edit its rows"
              : editMode
                ? "Editing — make changes, then Save all"
                : "Read-only — click Edit table to make changes"}
          </div>
          {firstEntry && lastEntry && portfolio.entries.length > 12 && (
            <div className="entries-jump">
              <MonthYearPicker
                value={null}
                onChange={jumpTo}
                placeholder="Jump to month"
                ariaLabel="Jump to month"
                testId="entries-jump"
                maxDate={{ year: lastEntry.year, month: lastEntry.month }}
                minYear={firstEntry.year}
                isMonthEnabled={(y, m) => entryMonths.has(`${y}-${m}`)}
              />
            </div>
          )}
        </div>
        <div
          className="entries-grid-actions"
          style={{ display: "flex", gap: 8 }}
        >
          {editMode && (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleAddRow}
              data-testid="btn-add-row"
              disabled={isSaving}
            >
              <Icon name="plus" size={14} /> Add row
            </button>
          )}
          {!editMode && (
            <>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={isCombined ? 0 : undefined}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleAddEntryFromRead}
                      disabled={isCombined}
                      data-testid="btn-add-entry"
                    >
                      <Icon name="plus" size={15} /> Add entry
                    </button>
                  </span>
                </TooltipTrigger>
                {isCombined && (
                  <TooltipContent>
                    Switch to a specific portfolio to add entries
                  </TooltipContent>
                )}
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span tabIndex={isCombined ? 0 : undefined}>
                    <button
                      type="button"
                      className="btn btn-secondary"
                      onClick={handleEditClick}
                      disabled={isCombined}
                      data-testid="btn-edit-table"
                      aria-pressed={editMode}
                    >
                      <Icon name="edit" size={15} /> Edit table
                    </button>
                  </span>
                </TooltipTrigger>
                {isCombined && (
                  <TooltipContent>
                    Switch to a specific portfolio to edit entries
                  </TooltipContent>
                )}
              </Tooltip>
            </>
          )}
        </div>
      </div>

      <div
        className="card"
        // clip (not hidden): rounds the corners without becoming a scroll
        // container, which would pin the sticky header to the card.
        style={{ padding: 0, overflow: "clip" }}
        data-testid="entries-table"
        data-edit-mode={editMode ? "true" : "false"}
      >
        <table className="entries-table table">
          <thead>
            <tr>
              <th className="th-date">Date</th>
              <th className="num">Added this month</th>
              <th className="num">Portfolio value</th>
              <th
                className="num"
                title="Change in value since the previous recorded month, minus what you added"
              >
                M/M Δ
              </th>
              <th>Note</th>
              <th style={{ width: 80 }} aria-label="Actions" scope="col"></th>
            </tr>
          </thead>
          <tbody>
            {editMode &&
              draftRows.map((draft) => (
                <EditableRow
                  key={draft.key}
                  entry={null}
                  draft={draft}
                  history={null}
                  editMode={true}
                  defaultEntryDay={settings.defaultEntryDay}
                  isFocusPending={pendingFocusKey === draft.key}
                  onUpdateCell={(cell, value) =>
                    updateCell(draft.key, cell, value)
                  }
                  onCellError={(cell, err) =>
                    controller.setCellError(draft.key, cell, err)
                  }
                  onUpdateDate={(next) => {
                    controller.updateDraftDate(draft.key, next)
                  }}
                  onRestore={() => {}}
                  onRequestDelete={() => {}}
                  onRemoveDraft={() => controller.removeDraft(draft.key)}
                  onFocusConsumed={() => consumeFocus(draft.key)}
                  testIdSuffix={draft.key}
                />
              ))}
            {reversedEntries.map((e, idx) => {
              const originalIdx = portfolio.entries.length - 1 - idx
              const draft = drafts.get(`entry-${e.id}`) ?? null
              // Combined rows are synthetic (shared id) — key them by month.
              const rowKey =
                e.id > 0 ? `entry-${e.id}` : `month-${e.year}-${e.month}`
              return (
                <EditableRow
                  key={rowKey}
                  entry={e}
                  draft={draft}
                  history={{ entries: portfolio.entries, index: originalIdx }}
                  editMode={editMode}
                  defaultEntryDay={settings.defaultEntryDay}
                  isFocusPending={pendingFocusKey === `entry-${e.id}`}
                  onUpdateCell={(cell, value) => updateCell(e, cell, value)}
                  onCellError={(cell, err) =>
                    controller.setCellError(e, cell, err)
                  }
                  onUpdateDate={() => {
                    /* read-only on existing rows */
                  }}
                  onRestore={() => toggleDelete(e)}
                  onRequestDelete={() => setPendingDelete(e)}
                  onRemoveDraft={() => {}}
                  onFocusConsumed={() => consumeFocus(`entry-${e.id}`)}
                  testIdSuffix={
                    e.id === -1 ? `c-${e.year}-${e.month}` : String(e.id)
                  }
                />
              )
            })}
          </tbody>
        </table>
      </div>

      {editMode && (
        <SaveFooter
          dirtyCount={dirtyCount}
          errorCount={errorCount}
          isSaving={isSaving}
          saveStatus={saveStatus}
          onSave={saveAll}
          onCancel={handleCancel}
        />
      )}

      {/* Shared delete confirmation — one instance for every row in the grid */}
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(o) => {
          if (!o) setPendingDelete(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete entry?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete ? (
                <>
                  This will mark the{" "}
                  {fmtDate(
                    pendingDelete.year,
                    pendingDelete.month,
                    pendingDelete.day
                  )}{" "}
                  snapshot for deletion. The change is applied when you save.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              data-testid={
                pendingDelete
                  ? `row-delete-confirm-${pendingDelete.id}`
                  : undefined
              }
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <AlertDialogContent data-testid="entries-grid-discard-dialog">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingChanges.length === 1
                ? `Discard your change to ${pendingChanges[0].month}?`
                : `Discard ${fmtCount(pendingChanges.length, "change", "changes")}?`}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                <ul
                  className="discard-list"
                  data-testid="entries-grid-discard-list"
                >
                  {pendingChanges.slice(0, MAX_LISTED).map((c, i) => (
                    <li key={i}>
                      <strong>{c.month}</strong>
                      <span>{c.detail}</span>
                    </li>
                  ))}
                  {pendingChanges.length > MAX_LISTED && (
                    <li className="muted">
                      …and {pendingChanges.length - MAX_LISTED} more
                    </li>
                  )}
                </ul>
                <p style={{ marginTop: 10 }}>
                  Your pending edits will be lost. Saved entries are not
                  affected.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancel}
              data-testid="entries-grid-confirm-discard"
            >
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
