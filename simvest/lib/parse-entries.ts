import type { EntryDTO } from "@/lib/types"
import { daysInMonth } from "@/lib/dates"
import { getSeparators, parseMoneyExpression } from "@/lib/locale"

export type DateFormat = "DMY-dot" | "ISO-ym" | "MY-slash" | "DMY-slash"

export type FormatHints = {
  numberLocale: string
  dateFormat: DateFormat
  hasHeader: boolean
}

export type ColumnMapping = {
  date: number
  invested: number | null
  value: number | null
  note: number | null
}

/**
 * A whole-paste structural problem with the columns themselves (not a single
 * row's data). `column`/`header` are null for the "no date column" case, which
 * is not tied to one offending header.
 */
export type StructuralError = {
  column: number | null
  header: string | null
  text: string
}

export type MappingResult = {
  mapping: ColumnMapping
  structuralErrors: StructuralError[]
}

export type RowStatus = "new" | "update" | "warning" | "error"

export type RowMessage = {
  field: "date" | "invested" | "value" | "note" | "row"
  level: "error" | "warning"
  text: string
}

export type ParsedRow = {
  index: number
  raw: string[]
  parsed: {
    year: number
    month: number
    day: number
    invested: number
    value: number | null
    note: string
  } | null
  status: RowStatus
  messages: RowMessage[]
  existingEntryId: number | null
  action: "apply" | "skip"
}

export type ParseContext = {
  existingByMonth: Map<string, EntryDTO>
  todayYear: number
  todayMonth: number
  defaultDay: (year: number, month: number) => number
  /** Portfolio's targetMonthlyContribution — used for a blank invested cell on a new month. */
  defaultInvested: number
}

const SYNONYMS = {
  date: ["date", "datum", "monat", "periode", "month"],
  invested: [
    "invested",
    "eingezahlt",
    "einzahlung",
    "beitrag",
    "contribution",
    "deposit",
  ],
  value: [
    "value",
    "wert",
    "depotwert",
    "portfoliowert",
    "portfoliovalue",
    "balance",
    "stand",
  ],
  note: ["note", "notiz", "kommentar", "comment"],
} as const

function normalizeHeader(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "")
}

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

export function describeDateFormat(fmt: DateFormat): string {
  switch (fmt) {
    case "DMY-dot":
      return "DD.MM.YYYY"
    case "ISO-ym":
      return "YYYY-MM"
    case "MY-slash":
      return "MM/YYYY"
    case "DMY-slash":
      return "DD/MM/YYYY"
  }
}

export function exampleForDateFormat(fmt: DateFormat): string {
  switch (fmt) {
    case "DMY-dot":
      return "03.05.2026"
    case "ISO-ym":
      return "2026-05"
    case "MY-slash":
      return "05/2026"
    case "DMY-slash":
      return "03/05/2026"
  }
}

export function exampleForNumberLocale(locale: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(1234.56)
  } catch {
    return "1,234.56"
  }
}

export function splitRows(text: string): string[][] {
  const cleaned = text.replace(/\r/g, "")
  const lines = cleaned.split("\n")
  // Find the first non-empty line to sniff the delimiter from.
  // Prefer a content-bearing line for delimiter detection, but fall back to
  // the first raw line so an all-empty-cells row (e.g. "\t\t\t") still
  // detects tabs as the delimiter.
  const sniff =
    lines.find((l) => l.trim().length > 0) ??
    lines.find((l) => l.length > 0) ??
    ""
  let delim = ","
  if (sniff.includes("\t")) delim = "\t"
  else if (sniff.includes(";")) delim = ";"
  const rows: string[][] = []
  for (const line of lines) {
    // Drop fully-blank lines, but keep rows that contain delimiters even when
    // every cell ends up empty — the parser surfaces those as warning/empty.
    if (line.length === 0) continue
    if (!line.includes(delim) && line.trim().length === 0) continue
    rows.push(line.split(delim).map((cell) => cell.trim()))
  }
  return rows
}

type DateParseOk = { ok: true; year: number; month: number; day: number | null }
type DateParseErr = { ok: false }

function tryParseDate(
  raw: string,
  hint: DateFormat
): DateParseOk | DateParseErr {
  const s = raw.trim()
  if (s.length === 0) return { ok: false }

  // Try the primary form for the hint first, then sensible fallbacks. Each
  // hint accepts both a "with day" and a "month-year" variant — the user
  // confirmed this in the open-decisions check.
  const tries: Array<(s: string) => DateParseOk | null> = []
  const dmyDot = (x: string) => {
    const m = x.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
    if (!m) return null
    return {
      ok: true as const,
      day: parseInt(m[1], 10),
      month: parseInt(m[2], 10),
      year: parseInt(m[3], 10),
    }
  }
  const myDot = (x: string) => {
    const m = x.match(/^(\d{1,2})\.(\d{4})$/)
    if (!m) return null
    return {
      ok: true as const,
      day: null,
      month: parseInt(m[1], 10),
      year: parseInt(m[2], 10),
    }
  }
  const isoYmd = (x: string) => {
    const m = x.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
    if (!m) return null
    return {
      ok: true as const,
      year: parseInt(m[1], 10),
      month: parseInt(m[2], 10),
      day: parseInt(m[3], 10),
    }
  }
  const isoYm = (x: string) => {
    const m = x.match(/^(\d{4})-(\d{1,2})$/)
    if (!m) return null
    return {
      ok: true as const,
      year: parseInt(m[1], 10),
      month: parseInt(m[2], 10),
      day: null,
    }
  }
  const mySlash = (x: string) => {
    const m = x.match(/^(\d{1,2})\/(\d{4})$/)
    if (!m) return null
    return {
      ok: true as const,
      day: null,
      month: parseInt(m[1], 10),
      year: parseInt(m[2], 10),
    }
  }
  const dmySlash = (x: string) => {
    const m = x.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (!m) return null
    return {
      ok: true as const,
      day: parseInt(m[1], 10),
      month: parseInt(m[2], 10),
      year: parseInt(m[3], 10),
    }
  }

  switch (hint) {
    case "DMY-dot":
      tries.push(dmyDot, myDot)
      break
    case "ISO-ym":
      tries.push(isoYmd, isoYm)
      break
    case "MY-slash":
      tries.push(mySlash, dmySlash)
      break
    case "DMY-slash":
      tries.push(dmySlash, mySlash)
      break
  }

  for (const t of tries) {
    const r = t(s)
    if (r) {
      // Validate month range here; year range checked by caller.
      if (r.month < 1 || r.month > 12) continue
      if (r.day !== null && (r.day < 1 || r.day > 31)) continue
      return r
    }
  }
  return { ok: false }
}

function looksLikeAnyDate(s: string): boolean {
  if (s.length === 0) return false
  return (
    /^\d{1,2}\.\d{1,2}\.\d{4}$/.test(s) ||
    /^\d{1,2}\.\d{4}$/.test(s) ||
    /^\d{4}-\d{1,2}(-\d{1,2})?$/.test(s) ||
    /^\d{1,2}\/\d{4}$/.test(s) ||
    /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)
  )
}

export function detectFormat(text: string, locale: string): FormatHints {
  const rows = splitRows(text)
  if (rows.length === 0) {
    const { decimal } = getSeparators(locale)
    return {
      numberLocale: locale,
      dateFormat: decimal === "," ? "DMY-dot" : "ISO-ym",
      hasHeader: false,
    }
  }

  // Header sniff: if the first row's first non-empty cell isn't date-shaped,
  // assume it's a header row.
  const firstRow = rows[0]
  const firstNonEmpty = firstRow.find((c) => c.length > 0) ?? ""
  const hasHeader = !looksLikeAnyDate(firstNonEmpty)

  const dataRows = hasHeader ? rows.slice(1) : rows
  const sampleRow = dataRows[0] ?? firstRow
  const sampleDateCell = sampleRow.find((c) => c.length > 0) ?? ""

  let dateFormat: DateFormat = "ISO-ym"
  if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(sampleDateCell)) dateFormat = "DMY-dot"
  else if (/^\d{1,2}\.\d{4}$/.test(sampleDateCell)) dateFormat = "DMY-dot"
  else if (/^\d{4}-\d{1,2}/.test(sampleDateCell)) dateFormat = "ISO-ym"
  else if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(sampleDateCell))
    dateFormat = "DMY-slash"
  else if (/^\d{1,2}\/\d{4}$/.test(sampleDateCell)) dateFormat = "MY-slash"
  else {
    const { decimal } = getSeparators(locale)
    dateFormat = decimal === "," ? "DMY-dot" : "ISO-ym"
  }

  // Number locale sniff: scan a few numeric-looking cells from data rows
  // (skip the date column, which is column 0 in most pastes — but we don't
  // know the mapping yet, so scan every cell).
  const numericCells: string[] = []
  for (const row of dataRows.slice(0, 5)) {
    for (const cell of row) {
      const stripped = cell.replace(/[€$£¥₹\s]/g, "")
      if (/^-?[\d.,]+$/.test(stripped) && /\d/.test(stripped)) {
        // Skip the date cell — date-shaped strings shouldn't influence the
        // number-locale sniff (e.g. "01.03.2026" looks numeric).
        if (looksLikeAnyDate(cell)) continue
        numericCells.push(stripped)
      }
    }
  }

  let numberLocale = locale
  if (numericCells.length > 0) {
    const germanish = numericCells.some((c) => {
      const dotIdx = c.lastIndexOf(".")
      const commaIdx = c.lastIndexOf(",")
      if (dotIdx >= 0 && commaIdx >= 0) return commaIdx > dotIdx
      if (commaIdx >= 0 && dotIdx < 0) {
        // ',' alone with 1-2 trailing digits looks like a decimal comma.
        return /,\d{1,2}$/.test(c)
      }
      return false
    })
    const englishish = numericCells.some((c) => {
      const dotIdx = c.lastIndexOf(".")
      const commaIdx = c.lastIndexOf(",")
      if (dotIdx >= 0 && commaIdx >= 0) return dotIdx > commaIdx
      if (dotIdx >= 0 && commaIdx < 0) return /\.\d{1,2}$/.test(c)
      return false
    })
    if (germanish && !englishish) numberLocale = "de-DE"
    else if (englishish && !germanish) numberLocale = "en-US"
  }

  return { numberLocale, dateFormat, hasHeader }
}

export function detectMapping(
  headers: string[],
  hasHeader: boolean,
  columnCount: number
): MappingResult {
  // No header → trust positional columns; no structural checks are possible.
  if (!hasHeader) {
    return {
      mapping: {
        date: 0,
        invested: columnCount > 1 ? 1 : null,
        value: columnCount > 2 ? 2 : null,
        note: columnCount > 3 ? 3 : null,
      },
      structuralErrors: [],
    }
  }
  const normalized = headers.map(normalizeHeader)
  function findCol(synonyms: readonly string[]): number | null {
    for (let i = 0; i < normalized.length; i++) {
      if (synonyms.includes(normalized[i])) return i
    }
    return null
  }
  const dateCol = findCol(SYNONYMS.date)
  const mapping: ColumnMapping = {
    date: dateCol ?? 0,
    invested: findCol(SYNONYMS.invested),
    value: findCol(SYNONYMS.value),
    note: findCol(SYNONYMS.note),
  }

  const structuralErrors: StructuralError[] = []
  if (dateCol === null) {
    structuralErrors.push({
      column: null,
      header: null,
      text: "No date column found. Add a “Date” header, or remove the header row to use positional columns (date, invested, value, note).",
    })
  }
  const known = new Set<string>([
    ...SYNONYMS.date,
    ...SYNONYMS.invested,
    ...SYNONYMS.value,
    ...SYNONYMS.note,
  ])
  for (let i = 0; i < headers.length; i++) {
    const norm = normalized[i]
    if (norm.length === 0) continue // blank header (trailing tab) → absent column
    if (!known.has(norm)) {
      structuralErrors.push({
        column: i,
        header: headers[i],
        text: `Unrecognized column “${headers[i]}”. Rename it to Date, Invested, Value, or Note, or remove the header row.`,
      })
    }
  }

  return { mapping, structuralErrors }
}

function formatExampleEur(n: number, locale: string): string {
  try {
    return `€${new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Math.round(n))}`
  } catch {
    return `€${Math.round(n)}`
  }
}

export function parseEntries(
  text: string,
  hints: FormatHints,
  mapping: ColumnMapping,
  ctx: ParseContext
): ParsedRow[] {
  const allRows = splitRows(text)
  const dataRows = hints.hasHeader ? allRows.slice(1) : allRows
  const result: ParsedRow[] = []
  const seenMonths = new Map<string, number>()
  let prevValue: number | null = null

  for (let i = 0; i < dataRows.length; i++) {
    const raw = dataRows[i]
    const index = i + 1
    const messages: RowMessage[] = []

    // Empty row → soft skip (warning, not committable).
    if (raw.every((cell) => cell.length === 0)) {
      result.push({
        index,
        raw,
        parsed: null,
        status: "warning",
        messages: [
          {
            field: "row",
            level: "warning",
            text: `Row ${index}: skipped — no numeric data.`,
          },
        ],
        existingEntryId: null,
        action: "skip",
      })
      continue
    }

    // A column is "declared" when the mapping points at a real index, and
    // "blank" when the declared cell is empty. Absent and blank columns resolve
    // against the missing-value rules below rather than being parsed.
    const investedDeclared = mapping.invested !== null
    const valueDeclared = mapping.value !== null
    const noteDeclared = mapping.note !== null

    const dateRaw = raw[mapping.date] ?? ""
    const investedRaw = investedDeclared ? (raw[mapping.invested!] ?? "") : ""
    const valueRaw = valueDeclared ? (raw[mapping.value!] ?? "") : ""
    const noteRaw = noteDeclared ? (raw[mapping.note!] ?? "") : ""

    const investedBlank = investedDeclared && investedRaw.trim() === ""
    const valueBlank = valueDeclared && valueRaw.trim() === ""
    const noteBlank = noteDeclared && noteRaw.trim() === ""

    const dateParse = tryParseDate(dateRaw, hints.dateFormat)
    if (!dateParse.ok) {
      messages.push({
        field: "date",
        level: "error",
        text: `Row ${index}: couldn't read "${dateRaw}" as a date. Expected ${describeDateFormat(hints.dateFormat)}.`,
      })
    }

    // Only parse declared, non-blank numeric cells.
    let investedParsed: number | null = null
    if (investedDeclared && !investedBlank) {
      const r = parseMoneyExpression(investedRaw, hints.numberLocale, {
        allowEmpty: false,
      })
      if (!r.ok) {
        messages.push({
          field: "invested",
          level: "error",
          text: `Row ${index}, Invested: couldn't read "${investedRaw}" as a number. Try ${exampleForNumberLocale(hints.numberLocale)}.`,
        })
      } else {
        investedParsed = r.value
      }
    }

    let valueParsed: number | null = null
    if (valueDeclared && !valueBlank) {
      const r = parseMoneyExpression(valueRaw, hints.numberLocale, {
        allowEmpty: false,
      })
      if (!r.ok) {
        messages.push({
          field: "value",
          level: "error",
          text: `Row ${index}, Value: couldn't read "${valueRaw}" as a number. Try ${exampleForNumberLocale(hints.numberLocale)}.`,
        })
      } else {
        valueParsed = r.value
      }
    }

    if (!dateParse.ok || messages.some((m) => m.level === "error")) {
      result.push({
        index,
        raw,
        parsed: null,
        status: "error",
        messages,
        existingEntryId: null,
        action: "skip",
      })
      continue
    }

    const { year, month } = dateParse
    const day = dateParse.day

    // Year range check (error).
    if (year < 1970 || year > ctx.todayYear + 1) {
      const text =
        year < 1970
          ? `Row ${index}: year ${year} is before 1970.`
          : `Row ${index}: year ${year} is too far in the future (allowed up to ${ctx.todayYear + 1}).`
      result.push({
        index,
        raw,
        parsed: null,
        status: "error",
        messages: [...messages, { field: "date", level: "error", text }],
        existingEntryId: null,
        action: "skip",
      })
      continue
    }

    // Duplicate check (error).
    const key = `${year}-${month}`
    const seenAt = seenMonths.get(key)
    if (seenAt !== undefined) {
      result.push({
        index,
        raw,
        parsed: null,
        status: "error",
        messages: [
          ...messages,
          {
            field: "date",
            level: "error",
            text: `Row ${index}: duplicate of row ${seenAt} (${year}-${pad2(month)}). Keep only one.`,
          },
        ],
        existingEntryId: null,
        action: "skip",
      })
      continue
    }
    seenMonths.set(key, index)

    const existing = ctx.existingByMonth.get(key)

    // Resolve / clamp day. An explicit day always wins (clamped to the month);
    // a month-only date keeps an existing entry's stored day, or falls back to
    // the configured default for a brand-new month.
    let resolvedDay: number
    if (day !== null) {
      const dim = daysInMonth(year, month)
      if (day > dim) {
        resolvedDay = dim
        messages.push({
          field: "date",
          level: "warning",
          text: `Row ${index}: ${pad2(day)}.${pad2(month)}.${year} doesn't exist; using ${pad2(resolvedDay)}.${pad2(month)}.${year}.`,
        })
      } else {
        resolvedDay = day
      }
    } else if (existing) {
      resolvedDay = existing.day
    } else {
      resolvedDay = ctx.defaultDay(year, month)
    }

    // Missing-value rules. For an existing month, an absent or blank column
    // keeps the stored value, so only declared, non-blank columns overwrite.
    let resolvedInvested: number
    if (!investedDeclared) resolvedInvested = existing ? existing.invested : 0
    else if (investedBlank)
      resolvedInvested = existing ? existing.invested : ctx.defaultInvested
    else resolvedInvested = investedParsed!

    let resolvedValue: number | null
    if (!valueDeclared || valueBlank)
      resolvedValue = existing ? existing.value : null
    else resolvedValue = valueParsed!

    let resolvedNote: string
    if (!noteDeclared || noteBlank) resolvedNote = existing ? existing.note : ""
    else resolvedNote = noteRaw

    // Future warning.
    if (
      year > ctx.todayYear ||
      (year === ctx.todayYear && month > ctx.todayMonth)
    ) {
      messages.push({
        field: "date",
        level: "warning",
        text: `Row ${index}: ${year}-${pad2(month)} is in the future — confirm.`,
      })
    }

    // value < invested warning.
    if (
      resolvedValue !== null &&
      resolvedInvested > 0 &&
      resolvedValue > 0 &&
      resolvedValue < resolvedInvested
    ) {
      messages.push({
        field: "value",
        level: "warning",
        text: `Row ${index}: value ${formatExampleEur(resolvedValue, hints.numberLocale)} is below invested ${formatExampleEur(resolvedInvested, hints.numberLocale)} — confirm it isn't a typo.`,
      })
    }

    // Jump warning (uses in-paste prev row if present, else existing-by-month).
    let prevForJump = prevValue
    if (prevForJump === null) {
      const prevMonth =
        month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }
      const ex = ctx.existingByMonth.get(`${prevMonth.year}-${prevMonth.month}`)
      if (ex) prevForJump = ex.value
    }
    if (resolvedValue !== null && prevForJump !== null && prevForJump !== 0) {
      const ratio =
        Math.abs(resolvedValue - prevForJump) / Math.abs(prevForJump)
      if (ratio > 5) {
        messages.push({
          field: "value",
          level: "warning",
          text: `Row ${index}: value jumped ${ratio.toFixed(1)}× since previous month — likely misplaced decimal.`,
        })
      }
    }
    prevValue = resolvedValue

    const parsed = {
      year,
      month,
      day: resolvedDay,
      invested: resolvedInvested,
      value: resolvedValue,
      note: resolvedNote,
    }

    result.push({
      index,
      raw,
      parsed,
      status: existing ? "update" : "new",
      messages,
      existingEntryId: existing ? existing.id : null,
      action: "apply",
    })
  }

  return result
}
