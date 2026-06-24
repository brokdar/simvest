import type { EntryDTO } from "@/lib/types"
import {
  emptyDraft,
  fromEntry,
  setCellValue,
  type CellKey,
  type DraftRow,
} from "@/components/entries-grid/draft-row"

export type EditableEntriesState = {
  drafts: Map<string, DraftRow>
  draftCounter: number
}

export const initialState: EditableEntriesState = {
  drafts: new Map(),
  draftCounter: 0,
}

function setDraft(
  state: EditableEntriesState,
  key: string,
  draft: DraftRow
): EditableEntriesState {
  const drafts = new Map(state.drafts)
  drafts.set(key, draft)
  return { ...state, drafts }
}

export function getOrCreateDraft(
  state: EditableEntriesState,
  entry: EntryDTO
): DraftRow {
  return state.drafts.get(`entry-${entry.id}`) ?? fromEntry(entry)
}

export function addDraft(
  state: EditableEntriesState,
  base: { year: number; month: number; day: number },
  defaults: { invested?: number; value?: number | null; note?: string } = {}
): { state: EditableEntriesState; key: string } {
  const n = state.draftCounter + 1
  const key = `draft-${n}`
  const draft = emptyDraft(key, base, defaults)
  const drafts = new Map(state.drafts)
  drafts.set(key, draft)
  return { state: { drafts, draftCounter: n }, key }
}

export function updateCell<K extends CellKey>(
  state: EditableEntriesState,
  entryOrKey: EntryDTO | string,
  cell: K,
  value: K extends "invested"
    ? number
    : K extends "value"
      ? number | null
      : string
): EditableEntriesState {
  const key =
    typeof entryOrKey === "string" ? entryOrKey : `entry-${entryOrKey.id}`
  const existing = state.drafts.get(key)
  const seed =
    existing ?? (typeof entryOrKey === "string" ? null : fromEntry(entryOrKey))
  if (seed === null) return state
  const next = setCellValue(seed, cell, value)
  return setDraft(state, key, next)
}

export function toggleDelete(
  state: EditableEntriesState,
  entry: EntryDTO
): EditableEntriesState {
  const key = `entry-${entry.id}`
  const existing = state.drafts.get(key) ?? fromEntry(entry)
  return setDraft(state, key, { ...existing, toDelete: !existing.toDelete })
}

/**
 * Update a draft row's date (year/month/day). Only meaningful for new drafts
 * (original === null); existing rows cannot have their date edited inline.
 */
export function updateDraftDate(
  state: EditableEntriesState,
  key: string,
  date: { year: number; month: number; day: number }
): EditableEntriesState {
  const existing = state.drafts.get(key)
  if (!existing) return state
  if (existing.original !== null) return state
  return setDraft(state, key, {
    ...existing,
    year: date.year,
    month: date.month,
    day: date.day,
  })
}

export function removeDraft(
  state: EditableEntriesState,
  key: string
): EditableEntriesState {
  if (!state.drafts.has(key)) return state
  const drafts = new Map(state.drafts)
  drafts.delete(key)
  return { ...state, drafts }
}

export function setError(
  state: EditableEntriesState,
  key: string,
  error: string | null
): EditableEntriesState {
  const existing = state.drafts.get(key)
  if (!existing) return state
  return setDraft(state, key, { ...existing, error })
}

export function discardAll(state: EditableEntriesState): EditableEntriesState {
  if (state.drafts.size === 0) return state
  return { drafts: new Map(), draftCounter: state.draftCounter }
}
