"use client"

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
import { nextMonthAfter } from "@/components/entries-grid/draft-row"
import type { UseEditableEntries } from "@/components/entries-grid/use-editable-entries"
import type { EntryDTO, PortfolioDTO, SettingsDTO } from "@/lib/types"
import { formatEntryDate } from "@/lib/dates"

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

  const confirmCancel = useCallback(() => {
    setCancelConfirmOpen(false)
    exitEditMode()
  }, [exitEditMode])

  const confirmDelete = useCallback(() => {
    if (pendingDelete) toggleDelete(pendingDelete)
    setPendingDelete(null)
  }, [pendingDelete, toggleDelete])

  // Reverse-chronological for read mode; same order in edit mode so users
  // see drafts at the top and history below.
  const reversedEntries = useMemo(
    () => [...portfolio.entries].reverse(),
    [portfolio.entries]
  )

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
        <div className="muted small" data-testid="entries-grid-mode-hint">
          {editMode
            ? "Editing — make changes, then Save all"
            : "Read-only — click Edit table to make changes"}
        </div>
        <div style={{ display: "flex", gap: 8 }}>
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
        style={{ padding: 0, overflow: "hidden" }}
        data-testid="entries-table"
        data-edit-mode={editMode ? "true" : "false"}
      >
        <table className="table">
          <thead>
            <tr>
              <th style={{ paddingLeft: 20 }}>Date</th>
              <th className="num">Invested</th>
              <th className="num">Portfolio value</th>
              <th className="num">M/M Δ</th>
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
                  prev={null}
                  editMode={true}
                  defaultEntryDay={settings.defaultEntryDay}
                  isFocusPending={pendingFocusKey === draft.key}
                  onUpdateCell={(cell, value) =>
                    updateCell(draft.key, cell, value)
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
              const prev =
                originalIdx > 0 ? portfolio.entries[originalIdx - 1] : null
              const draft = drafts.get(`entry-${e.id}`) ?? null
              return (
                <EditableRow
                  key={`entry-${e.id}`}
                  entry={e}
                  draft={draft}
                  prev={prev}
                  editMode={editMode}
                  defaultEntryDay={settings.defaultEntryDay}
                  isFocusPending={pendingFocusKey === `entry-${e.id}`}
                  onUpdateCell={(cell, value) => updateCell(e, cell, value)}
                  onUpdateDate={() => {
                    /* read-only on existing rows */
                  }}
                  onRestore={() => toggleDelete(e)}
                  onRequestDelete={() => setPendingDelete(e)}
                  onRemoveDraft={() => {}}
                  onFocusConsumed={() => consumeFocus(`entry-${e.id}`)}
                  testIdSuffix={String(e.id)}
                />
              )
            })}
          </tbody>
        </table>
      </div>

      {editMode && (
        <SaveFooter
          dirtyCount={dirtyCount}
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
                  {formatEntryDate(
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
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Discard {dirtyCount} {dirtyCount === 1 ? "change" : "changes"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Your pending edits will be lost. Saved entries are not affected.
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
