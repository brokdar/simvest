"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useDataActions } from "@/components/providers/data-provider"
import type { EntryDTO, PortfolioDTO } from "@/lib/types"
import {
  isDirty,
  validate,
  type CellKey,
  type DraftRow,
} from "@/components/entries-grid/draft-row"
import {
  addDraft as addDraftR,
  discardAll as discardAllR,
  getOrCreateDraft,
  initialState,
  removeDraft as removeDraftR,
  setError as setErrorR,
  toggleDelete as toggleDeleteR,
  updateCell as updateCellR,
  updateDraftDate as updateDraftDateR,
  type EditableEntriesState,
} from "@/components/entries-grid/reducer"

export type UseEditableEntries = ReturnType<typeof useEditableEntries>

export function useEditableEntries(portfolio: PortfolioDTO) {
  const { upsertEntry, deleteEntry } = useDataActions()
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

  const dirtyDrafts = useMemo(
    () => Array.from(state.drafts.values()).filter(isDirty),
    [state.drafts]
  )

  const dirtyCount = dirtyDrafts.length

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
      setState((curr) => updateCellR(curr, entryOrKey, cell, value))
    },
    []
  )

  const toggleDelete = useCallback((entry: EntryDTO) => {
    setState((curr) => toggleDeleteR(curr, entry))
  }, [])

  const removeDraft = useCallback((key: string) => {
    setState((curr) => removeDraftR(curr, key))
  }, [])

  const updateDraftDate = useCallback(
    (key: string, date: { year: number; month: number; day: number }) => {
      setState((curr) => updateDraftDateR(curr, key, date))
    },
    []
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
    for (const d of drafts) {
      const err = validate(d, { existingByMonth })
      if (err !== null) {
        pre = setErrorR(pre, d.key, err)
        hasPreError = true
      } else if (d.error !== null) {
        pre = setErrorR(pre, d.key, null)
      }
    }
    if (hasPreError) {
      setState(pre)
      setSaveStatus("Some rows have errors. Fix them and try again.")
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
      } else {
        setSaveStatus(
          `Saved ${saved}, ${failed} failed. Review the highlighted ${failed === 1 ? "row" : "rows"}.`
        )
      }
      setIsSaving(false)
    })()
  }, [portfolio.id, upsertEntry, deleteEntry, existingByMonth])

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
    existingByMonth,
    // Read helpers
    getDraft,
    // Actions
    toggleEdit,
    exitEditMode,
    addDraft,
    updateCell,
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
