import type { EntryDTO, PortfolioDTO } from "@/lib/types"
import { daysInMonth, resolveEntryDay } from "@/lib/dates"

export type CellKey = "invested" | "value" | "note"

export type DraftRow = {
  key: string
  original: EntryDTO | null
  year: number
  month: number
  day: number
  invested: number
  value: number | null
  note: string
  toDelete: boolean
  touched: Set<CellKey>
  error: string | null
}

export function fromEntry(entry: EntryDTO): DraftRow {
  return {
    key: `entry-${entry.id}`,
    original: entry,
    year: entry.year,
    month: entry.month,
    day: entry.day,
    invested: entry.invested,
    value: entry.value,
    note: entry.note,
    toDelete: false,
    touched: new Set(),
    error: null,
  }
}

export function emptyDraft(
  key: string,
  base: { year: number; month: number; day: number },
  defaults: { invested?: number; value?: number | null; note?: string } = {}
): DraftRow {
  return {
    key,
    original: null,
    year: base.year,
    month: base.month,
    day: base.day,
    invested: defaults.invested ?? 0,
    value: defaults.value ?? null,
    note: defaults.note ?? "",
    toDelete: false,
    touched: new Set(),
    error: null,
  }
}

export function isDirty(draft: DraftRow): boolean {
  return draft.toDelete || draft.original === null || draft.touched.size > 0
}

export function validate(
  draft: DraftRow,
  ctx: { existingByMonth?: Map<string, EntryDTO> } = {}
): string | null {
  if (!Number.isFinite(draft.year) || draft.year < 1970) {
    return "Year must be 1970 or later"
  }
  if (!Number.isFinite(draft.month) || draft.month < 1 || draft.month > 12) {
    return "Month must be 1-12"
  }
  const dim = daysInMonth(draft.year, draft.month)
  if (!Number.isFinite(draft.day) || draft.day < 1 || draft.day > dim) {
    return `Day must be 1-${dim} for ${draft.year}-${String(draft.month).padStart(2, "0")}`
  }
  if (draft.original === null && ctx.existingByMonth) {
    const monthKey = `${draft.year}-${draft.month}`
    if (ctx.existingByMonth.has(monthKey)) {
      return `An entry for ${draft.year}-${String(draft.month).padStart(2, "0")} already exists`
    }
  }
  return null
}

export function nextMonthAfter(
  portfolio: PortfolioDTO,
  defaultEntryDay: string
): { year: number; month: number; day: number } {
  const last = portfolio.entries.at(-1)
  if (!last) {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth() + 1
    return { year, month, day: resolveEntryDay(defaultEntryDay, year, month) }
  }
  const year = last.month === 12 ? last.year + 1 : last.year
  const month = last.month === 12 ? 1 : last.month + 1
  return { year, month, day: resolveEntryDay(defaultEntryDay, year, month) }
}

export function touchCell(draft: DraftRow, cell: CellKey): DraftRow {
  if (draft.touched.has(cell)) return draft
  const touched = new Set(draft.touched)
  touched.add(cell)
  return { ...draft, touched }
}

export function setCellValue<K extends CellKey>(
  draft: DraftRow,
  cell: K,
  value: K extends "invested"
    ? number
    : K extends "value"
      ? number | null
      : string
): DraftRow {
  const next: DraftRow = { ...draft, touched: new Set(draft.touched) }
  if (cell === "invested") {
    next.invested = value as number
  } else if (cell === "value") {
    next.value = value as number | null
  } else if (cell === "note") {
    next.note = value as string
  }
  const originalValue =
    draft.original === null
      ? null
      : cell === "invested"
        ? draft.original.invested
        : cell === "value"
          ? draft.original.value
          : draft.original.note
  if (draft.original !== null && originalValue === value) {
    next.touched.delete(cell)
  } else {
    next.touched.add(cell)
  }
  return next
}
