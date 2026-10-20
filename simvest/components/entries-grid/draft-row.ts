import type { EntryDTO, PortfolioDTO } from "@/lib/types"
import { daysInMonth, fmtMonthLong, resolveEntryDay } from "@/lib/dates"
import { fmtEUR } from "@/lib/format"

export type CellKey = "invested" | "value" | "note"
export type MoneyCellKey = "invested" | "value"

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
  /**
   * Amounts the user typed that couldn't be read (D1). While a cell has an
   * error its stored number is left untouched and the row can't be saved —
   * a rejected "1234.56" must never quietly become 0 or the old value.
   */
  cellErrors: Partial<Record<MoneyCellKey, string>>
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
    cellErrors: {},
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
    cellErrors: {},
  }
}

export function hasCellErrors(draft: DraftRow): boolean {
  return Object.keys(draft.cellErrors).length > 0
}

export function isDirty(draft: DraftRow): boolean {
  return (
    draft.toDelete ||
    draft.original === null ||
    draft.touched.size > 0 ||
    hasCellErrors(draft)
  )
}

export function setCellError(
  draft: DraftRow,
  cell: MoneyCellKey,
  error: string | null
): DraftRow {
  if ((draft.cellErrors[cell] ?? null) === error) return draft
  const cellErrors = { ...draft.cellErrors }
  if (error === null) delete cellErrors[cell]
  else cellErrors[cell] = error
  return { ...draft, cellErrors }
}

export function validate(
  draft: DraftRow,
  ctx: {
    existingByMonth?: Map<string, EntryDTO>
    /** monthKey → keys of the *new* drafts for that month, in table order. */
    newDraftMonths?: Map<string, string[]>
  } = {}
): string | null {
  if (draft.toDelete) return null
  if (draft.cellErrors.invested || draft.cellErrors.value) {
    const cells = [
      draft.cellErrors.invested ? "Invested" : null,
      draft.cellErrors.value ? "Portfolio value" : null,
    ].filter(Boolean)
    return `Fix the ${cells.join(" and ")} amount before saving.`
  }
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
  if (draft.original === null) {
    const monthKey = `${draft.year}-${draft.month}`
    const label = fmtMonthLong(draft.year, draft.month)
    if (ctx.existingByMonth?.has(monthKey)) {
      return `An entry for ${label} already exists — pick another month, or edit that row instead.`
    }
    const siblings = ctx.newDraftMonths?.get(monthKey)
    if (siblings && siblings.length > 1 && siblings[0] !== draft.key) {
      return `Another new row is also for ${label} — keep only one.`
    }
  }
  return null
}

/** Group new (unsaved) drafts by month so `validate` can spot duplicates. */
export function newDraftMonths(
  drafts: Iterable<DraftRow>
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const d of drafts) {
    if (d.original !== null) continue
    const k = `${d.year}-${d.month}`
    const list = out.get(k)
    if (list) list.push(d.key)
    else out.set(k, [d.key])
  }
  return out
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

export type ChangeSummary = {
  /** "May 2026" */
  month: string
  /** What happens to that month, e.g. "Portfolio value €15.728,37 → €15.740,93". */
  detail: string
}

/**
 * Plain-language description of one pending change, for the discard dialog
 * (D7): which month, and old → new for every field that differs.
 */
export function describeChange(draft: DraftRow): ChangeSummary {
  const month = fmtMonthLong(draft.year, draft.month)
  if (draft.toDelete) return { month, detail: "Delete this entry" }
  if (draft.original === null) {
    const parts = [`invested ${fmtEUR(draft.invested)}`]
    if (draft.value !== null) parts.push(`value ${fmtEUR(draft.value)}`)
    return { month, detail: `New entry — ${parts.join(", ")}` }
  }
  const o = draft.original
  const parts: string[] = []
  // A cell with an unreadable amount has no "new" value to show.
  if (draft.cellErrors.invested)
    parts.push("Invested: an amount that couldn’t be read")
  else if (draft.touched.has("invested"))
    parts.push(`Invested ${fmtEUR(o.invested)} → ${fmtEUR(draft.invested)}`)
  if (draft.cellErrors.value)
    parts.push("Portfolio value: an amount that couldn’t be read")
  else if (draft.touched.has("value"))
    parts.push(`Portfolio value ${fmtEUR(o.value)} → ${fmtEUR(draft.value)}`)
  if (draft.touched.has("note"))
    parts.push(draft.note ? `Note “${draft.note}”` : "Note removed")
  return { month, detail: parts.join(" · ") }
}
