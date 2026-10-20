"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useDataActions } from "@/components/providers/data-provider"
import { useToast } from "@/components/providers/toast"
import type { EntryDTO, PortfolioDTO } from "@/lib/types"
import {
  hasCellErrors,
  isDirty,
  newDraftMonths,
  validate,
  type CellKey,
  type DraftRow,
  type MoneyCellKey,
} from "@/components/entries-grid/draft-row"
import {
  addDraft as addDraftR,
  discardAll as discardAllR,
  getOrCreateDraft,
  initialState,
  removeDraft as removeDraftR,
  setCellError as setCellErrorR,
  setError as setErrorR,
  toggleDelete as toggleDeleteR,
  updateCell as updateCellR,
  updateDraftDate as updateDraftDateR,
  type EditableEntriesState,
} from "@/components/entries-grid/reducer"

export type UseEditableEntries = ReturnType<typeof useEditableEntries>

export function useEditableEntries(portfolio: PortfolioDTO) {
  const { upsertEntry, deleteEntry } = useDataActions()
  const { toast } = useToast()
  const [state, setState] = useState<EditableEntriesState>(initialState)
  const [editMode, setEditMode] = useState(false)
  const [pendingFocusKey, setPendingFocusKey] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const stateRef = useRef(state)
  useEffect(() => {
    stateRef.current = state
  }, [state])

  const existingByMonth = useMemo(() => {
    const m = new Map<string, EntryDTO>()
    for (const e of portfolio.entries) m.set(`${e.year}-${e.month}`, e)
    return m
  }, [portfolio.entries])

  // D8: a row's error describes the row as it was when Save was pressed. Once
  // the user edits, removes or restores rows, re-check every row that still
  // shows an error (so a fixed duplicate month clears itself) and drop the
  // stale footer status ("Some rows have errors…").
  const revalidate = useCallback(
    (next: EditableEntriesState): EditableEntriesState => {
      let out = next
      const siblings = newDraftMonths(next.drafts.values())
      for (const d of next.drafts.values()) {
        if (d.error === null) continue
        const err = validate(d, { existingByMonth, newDraftMonths: siblings })
        if (err !== d.error) out = setErrorR(out, d.key, err)
      }
      return out
    },
    [existingByMonth]
  )

  const mutate = useCallback(
    (fn: (curr: EditableEntriesState) => EditableEntriesState) => {
      setState((curr) => revalidate(fn(curr)))
      setSaveStatus(null)
    },
    [revalidate]
  )

  const dirtyDrafts = useMemo(
    () => Array.from(state.drafts.values()).filter(isDirty),
    [state.drafts]
  )

  const dirtyCount = dirtyDrafts.length
  const errorCount = useMemo(
    () =>
      Array.from(state.drafts.values()).filter(
        (d) => d.error !== null || hasCellErrors(d)
      ).length,
    [state.drafts]
  )

  const getDraft = useCallback(
    (entry: EntryDTO): DraftRow => getOrCreateDraft(stateRef.current, entry),
    []
  )

  const draftRows = useMemo(() => {
    const list: DraftRow[] = []
    for (const draft of state.drafts.values()) {
      if (draft.original === null) list.push(draft)
    }
    return list
  }, [state.drafts])

  const toggleEdit = useCallback((next?: boolean) => {
    setEditMode((curr) => (typeof next === "boolean" ? next : !curr))
  }, [])

  const exitEditMode = useCallback(() => {
    setEditMode(false)
    setState(discardAllR(stateRef.current))
  }, [])

  const addDraft = useCallback(
    (
      base: { year: number; month: number; day: number },
      defaults?: { invested?: number; value?: number | null; note?: string }
    ) => {
      // Pre-fill `invested` from the portfolio's target contribution so the
      // common case ("save my usual amount this month") is a single keystroke
      // (Enter). Callers can pass `defaults` to override per-row.
      const resolved = {
        invested: portfolio.targetMonthlyContribution,
        ...defaults,
      }
      const { state: next, key } = addDraftR(stateRef.current, base, resolved)
      setState(next)
      setSaveStatus(null)
      return key
    },
    [portfolio.targetMonthlyContribution]
  )

  const updateCell = useCallback(
    <K extends CellKey>(
      entryOrKey: EntryDTO | string,
      cell: K,
      value: K extends "invested"
        ? number
        : K extends "value"
          ? number | null
          : string
    ) => {
      mutate((curr) => updateCellR(curr, entryOrKey, cell, value))
    },
    [mutate]
  )

  const setCellError = useCallback(
    (
      entryOrKey: EntryDTO | string,
      cell: MoneyCellKey,
      error: string | null
    ) => {
      mutate((curr) => setCellErrorR(curr, entryOrKey, cell, error))
    },
    [mutate]
  )

  const toggleDelete = useCallback(
    (entry: EntryDTO) => {
      mutate((curr) => toggleDeleteR(curr, entry))
    },
    [mutate]
  )

  const removeDraft = useCallback(
    (key: string) => {
      mutate((curr) => removeDraftR(curr, key))
    },
    [mutate]
  )

  const updateDraftDate = useCallback(
    (key: string, date: { year: number; month: number; day: number }) => {
      mutate((curr) => updateDraftDateR(curr, key, date))
    },
    [mutate]
  )

  const discardAll = useCallback(() => {
    setState((curr) => discardAllR(curr))
  }, [])

  const focusKey = useCallback((key: string | null) => {
    setPendingFocusKey(key)
  }, [])

  const consumeFocus = useCallback((key: string) => {
    setPendingFocusKey((curr) => (curr === key ? null : curr))
  }, [])

  const saveAll = useCallback(() => {
    const drafts = Array.from(stateRef.current.drafts.values()).filter(isDirty)
    if (drafts.length === 0) {
      setEditMode(false)
      return
    }
    // Pre-validate. Any row that fails validation is short-circuited with an
    // inline error before we hit the network.
    let pre: EditableEntriesState = stateRef.current
    let hasPreError = false
    const siblings = newDraftMonths(stateRef.current.drafts.values())
    for (const d of drafts) {
      const err = validate(d, { existingByMonth, newDraftMonths: siblings })
      if (err !== null) {
        pre = setErrorR(pre, d.key, err)
        hasPreError = true
      } else if (d.error !== null) {
        pre = setErrorR(pre, d.key, null)
      }
    }
    if (hasPreError) {
      setState(pre)
      // The footer derives its message from the rows that still carry an
      // error, so it can't outlive them (D8).
      setSaveStatus(null)
      return
    }

    setIsSaving(true)
    void (async () => {
      let saved = 0
      let failed = 0
      const errors = new Map<string, string>()
      setSaveStatus(`Saving 1 of ${drafts.length}…`)
      for (let i = 0; i < drafts.length; i++) {
        const d = drafts[i]
        setSaveStatus(`Saving ${i + 1} of ${drafts.length}…`)
        try {
          if (d.toDelete && d.original) {
            await deleteEntry(portfolio.id, d.original.id)
          } else {
            await upsertEntry(portfolio.id, {
              year: d.year,
              month: d.month,
              day: d.day,
              invested: d.invested,
              value: d.value,
              note: d.note,
            })
          }
          saved++
        } catch (err) {
          failed++
          errors.set(d.key, err instanceof Error ? err.message : "Save failed")
        }
      }
      const succeededKeys = drafts
        .filter((d) => !errors.has(d.key))
        .map((d) => d.key)
      let next = stateRef.current
      for (const k of succeededKeys) next = removeDraftR(next, k)
      for (const [k, msg] of errors) next = setErrorR(next, k, msg)
      setState(next)
      if (failed === 0) {
        setEditMode(false)
        setSaveStatus(`Saved ${saved} ${saved === 1 ? "entry" : "entries"}.`)
        // The footer leaves with edit mode, so the toast is what confirms it.
        toast(
          `Saved ${saved} ${saved === 1 ? "change" : "changes"} to ${portfolio.name}`
        )
      } else {
        setSaveStatus(
          `Saved ${saved}, ${failed} failed. Review the highlighted ${failed === 1 ? "row" : "rows"}.`
        )
      }
      setIsSaving(false)
    })()
  }, [
    portfolio.id,
    portfolio.name,
    upsertEntry,
    deleteEntry,
    existingByMonth,
    toast,
  ])

  const clearSaveStatus = useCallback(() => setSaveStatus(null), [])

  return {
    // State
    drafts: state.drafts,
    draftRows,
    editMode,
    isSaving,
    saveStatus,
    pendingFocusKey,
    dirtyCount,
    dirtyDrafts,
    errorCount,
    existingByMonth,
    // Read helpers
    getDraft,
    // Actions
    toggleEdit,
    exitEditMode,
    addDraft,
    updateCell,
    setCellError,
    toggleDelete,
    removeDraft,
    updateDraftDate,
    discardAll,
    saveAll,
    focusKey,
    consumeFocus,
    clearSaveStatus,
  }
}
