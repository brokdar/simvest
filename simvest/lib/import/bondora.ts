import * as XLSX from "xlsx"
import { toISODate } from "@/lib/dates"
import { csvToObjects } from "./csv"
import type {
  BrokerParseResult,
  BrokerParser,
  ParsedIncomeEvent,
  ParsedMonthAggregate,
} from "./types"

/**
 * Bondora Go & Grow account-statement parser.
 *
 * Bondora has shipped two export shapes over time:
 *
 * 1. The legacy semicolon-separated CSV, English headers, German-formatted
 *    numbers (decimal comma) and US-style `M/D/YYYY` dates:
 *
 *      Date;Payment type;In;Out;Balance
 *      1/2/2024;SEPA payment;100;;5716,09
 *      1/3/2024;Go & Grow returns;0,93;;5717,02
 *
 * 2. The current `.xlsx` "Kontoauszug" export: German headers, German-locale
 *    `DD.MM.YYYY` dates, real numeric cells (no comma-decimal text), and a
 *    few preamble rows (account holder, date range, summary) before the
 *    actual transaction table:
 *
 *      Datum;Zahlungsart;Eingänge;Ausgänge;Guthaben
 *      01.06.2026;Go & Grow Zinsen;2.51;;15743.44
 *      01.06.2026;SEPA-Banküberweisung;100;;15843.44
 *
 * The upload UI reads `.xlsx` files client-side and hands this parser a
 * base64-encoded workbook prefixed with `XLSX_MARKER` — the wire format
 * (`csv: string`) never changes, so nothing downstream (engine, API routes,
 * DataProvider) needs to know which shape produced it.
 *
 * Mapping into the app model (shared by both shapes):
 *   - a returns/interest row ("Go & Grow returns" / "Go & Grow Zinsen") → a
 *     daily interest income event (tax 0; Bondora pays gross). One event per
 *     row.
 *   - any other cash movement (SEPA deposit, withdrawal) → that month's net
 *     contribution (In − Out; a withdrawal nets negative).
 *   - the running balance → the month-end portfolio value (last row of the
 *     month, after a defensive date sort).
 *
 * Idempotency hinges on a stable, date-derived `sourceTransactionId`
 * (`bondora:ret:YYYY-MM-DD:n`) so re-importing the same — or an extended —
 * statement skips rows already imported and only inserts genuinely new days.
 */

export const XLSX_MARKER = "BONDORA_XLSX_B64:"

const REQUIRED_COLUMNS = ["Date", "Payment type", "In", "Out", "Balance"]
const HEADER_DATE_LABELS = new Set(["Date", "Datum"])
const HEADER_TYPE_LABELS = new Set(["Payment type", "Zahlungsart"])
const DEPOSIT_TYPES = new Set(["SEPA payment", "SEPA-Banküberweisung"])
const RETURNS_RE = /returns|zinsen/i

const EMPTY: BrokerParseResult = {
  monthsAggregated: [],
  income: [],
  holdingsCandidates: [],
  warnings: [],
  errors: [],
}

/** German number → JS number. `"11.434,28"`→11434.28, `"5598,95"`→5598.95,
 *  `"6244"`→6244. Returns null on garbage. Empty string → 0. */
function parseGermanAmount(raw: string): number | null {
  const s = raw.trim()
  if (s === "") return 0
  const n = Number(s.replace(/\./g, "").replace(",", "."))
  return Number.isFinite(n) ? n : null
}

/** Balance cell → number, or null when blank/unreadable (no value recorded). */
function parseBalance(raw: string): number | null {
  if (raw.trim() === "") return null
  return parseGermanAmount(raw)
}

type ParsedDate = { year: number; month: number; day: number }

/** `M/D/YYYY` (US, unpadded). Returns null on shape/range failure — month>12
 *  fails rather than silently swapping to D/M. */
function parseUsDate(raw: string): ParsedDate | null {
  const m = raw.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (!m) return null
  const month = Number(m[1])
  const day = Number(m[2])
  const year = Number(m[3])
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  if (year < 1970 || year > 2100) return null
  return { year, month, day }
}

/** `DD.MM.YYYY` (German-locale, unpadded). Used by the `.xlsx` export. */
function parseDeDate(raw: string): ParsedDate | null {
  const m = raw.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!m) return null
  const day = Number(m[1])
  const month = Number(m[2])
  const year = Number(m[3])
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  if (year < 1970 || year > 2100) return null
  return { year, month, day }
}

/** A worksheet numeric cell is already a JS number; a blank cell reads back
 *  as `""`. Only fall back to German-text parsing for the rare stringly cell. */
function cellToAmount(v: string | number | undefined): number | null {
  if (v === undefined || v === "") return 0
  if (typeof v === "number") return v
  return parseGermanAmount(v)
}

function cellToBalance(v: string | number | undefined): number | null {
  if (v === undefined || v === "") return null
  if (typeof v === "number") return v
  return parseGermanAmount(v)
}

type Row = {
  idx: number
  year: number
  month: number
  day: number
  type: string
  net: number
  balance: number | null
}

/** Shared aggregation over already-normalized rows — feeds off either the
 *  legacy CSV rows or the `.xlsx` worksheet rows. */
function aggregateRows(rows: Row[]): BrokerParseResult {
  const warnings: string[] = []

  // Defensive sort: chronological, original order breaks ties. Makes the
  // month-end value and the per-date interest index deterministic
  // regardless of the export's row order.
  const sorted = [...rows].sort(
    (a, b) =>
      a.year - b.year || a.month - b.month || a.day - b.day || a.idx - b.idx
  )

  const monthMap = new Map<string, ParsedMonthAggregate>()
  const income: ParsedIncomeEvent[] = []
  const returnsPerDate = new Map<string, number>()
  const depositsPerDate = new Map<string, number>()

  for (const r of sorted) {
    const iso = toISODate(r.year, r.month, r.day)
    const monthKey = `${r.year}-${r.month}`
    let m = monthMap.get(monthKey)
    if (!m) {
      m = {
        year: r.year,
        month: r.month,
        deposits: 0,
        sourceTransactionIds: [],
        value: null,
      }
      monthMap.set(monthKey, m)
    }
    // Month-end value = the last row of the month (rows are sorted).
    if (r.balance !== null) m.value = r.balance

    if (RETURNS_RE.test(r.type)) {
      if (r.net === 0) continue // no payout to record
      const n = (returnsPerDate.get(iso) ?? 0) + 1
      returnsPerDate.set(iso, n)
      income.push({
        kind: "interest",
        isin: null,
        holdingName: null,
        assetClass: null,
        paidDate: iso,
        amount: r.net,
        tax: 0,
        sourceTransactionId: `bondora:ret:${iso}:${n}`,
      })
      continue
    }

    // Any non-returns row is a cash movement (deposit / withdrawal).
    if (r.net !== 0) {
      const n = (depositsPerDate.get(iso) ?? 0) + 1
      depositsPerDate.set(iso, n)
      m.deposits += r.net
      m.sourceTransactionIds.push(`bondora:dep:${iso}:${n}`)
    }
    if (!DEPOSIT_TYPES.has(r.type)) {
      warnings.push(
        `Unrecognized payment type "${r.type}" on ${iso} — treated as a ${
          r.net < 0 ? "withdrawal" : "deposit"
        }.`
      )
    }
  }

  // Surface days with more than one returns row — kept faithfully, but a
  // genuine duplicate-export glitch would otherwise double-count silently.
  for (const [iso, count] of returnsPerDate) {
    if (count > 1) {
      warnings.push(
        `${count} "Go & Grow returns" rows on ${iso} — kept all; check the export for a duplicate.`
      )
    }
  }

  // Opening-balance reminder: the first row's balance already includes
  // principal funded before the export window.
  const first = sorted[0]
  if (first && first.balance !== null) {
    const opening = first.balance - first.net
    if (opening > 0.005) {
      warnings.push(
        `Statement opens at €${opening.toFixed(
          2
        )} of prior principal not represented as deposits. Set the portfolio's Starting value to keep cost basis and gains accurate.`
      )
    }
  }

  const monthsAggregated = [...monthMap.values()].sort(
    (a, b) => a.year * 12 + a.month - (b.year * 12 + b.month)
  )

  return {
    monthsAggregated,
    income,
    holdingsCandidates: [],
    warnings,
    errors: [],
  }
}

function parseCsvText(csv: string): BrokerParseResult {
  let objs: Record<string, string>[]
  try {
    objs = csvToObjects(csv, ";")
  } catch (err) {
    return {
      ...EMPTY,
      errors: [
        `Could not parse CSV: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      ],
    }
  }

  if (objs.length === 0) return EMPTY

  const missing = REQUIRED_COLUMNS.filter((c) => !(c in objs[0]))
  if (missing.length) {
    return {
      ...EMPTY,
      errors: [
        `CSV is missing required columns: ${missing.join(
          ", "
        )}. Expected a Bondora Go & Grow account statement (semicolon-separated).`,
      ],
    }
  }

  const rows: Row[] = []
  const errors: string[] = []
  for (let i = 0; i < objs.length; i++) {
    const o = objs[i]
    const dateRaw = (o["Date"] ?? "").trim()
    if (dateRaw === "") continue // trailing/blank line

    const rowNo = i + 2 // +1 for header, +1 for 1-based
    const d = parseUsDate(dateRaw)
    if (!d) {
      errors.push(
        `Row ${rowNo}: invalid date "${dateRaw}" (expected M/D/YYYY).`
      )
      continue
    }
    const inAmt = parseGermanAmount(o["In"] ?? "")
    const outAmt = parseGermanAmount(o["Out"] ?? "")
    if (inAmt === null || outAmt === null) {
      errors.push(
        `Row ${rowNo}: couldn't read In/Out amount ("${o["In"]}" / "${o["Out"]}").`
      )
      continue
    }
    rows.push({
      idx: i,
      year: d.year,
      month: d.month,
      day: d.day,
      type: (o["Payment type"] ?? "").trim(),
      net: inAmt - outAmt,
      balance: parseBalance(o["Balance"] ?? ""),
    })
  }

  const result = aggregateRows(rows)
  return { ...result, errors }
}

function parseXlsxBase64(base64: string): BrokerParseResult {
  let buf: Buffer
  try {
    buf = Buffer.from(base64, "base64")
  } catch {
    return { ...EMPTY, errors: ["Could not decode the uploaded file."] }
  }

  let workbook: XLSX.WorkBook
  try {
    workbook = XLSX.read(buf, { type: "buffer" })
  } catch (err) {
    return {
      ...EMPTY,
      errors: [
        `Could not read the Excel file: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      ],
    }
  }

  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return { ...EMPTY, errors: ["The Excel file has no sheets."] }
  const sheetRows = XLSX.utils.sheet_to_json<(string | number)[]>(
    workbook.Sheets[sheetName],
    { header: 1, raw: true, defval: "" }
  )

  const headerIdx = sheetRows.findIndex(
    (r) =>
      HEADER_DATE_LABELS.has(String(r[0] ?? "").trim()) &&
      HEADER_TYPE_LABELS.has(String(r[1] ?? "").trim())
  )
  if (headerIdx === -1) {
    return {
      ...EMPTY,
      errors: [
        `Could not find the transaction table (a row starting "Datum;Zahlungsart;…"). Expected a Bondora Go & Grow account statement.`,
      ],
    }
  }

  const rows: Row[] = []
  const errors: string[] = []
  const dataRows = sheetRows.slice(headerIdx + 1)
  for (let i = 0; i < dataRows.length; i++) {
    const r = dataRows[i]
    const dateRaw = String(r[0] ?? "").trim()
    if (dateRaw === "") continue // trailing/blank row

    const rowNo = headerIdx + i + 2 // +1 for header, +1 for 1-based
    const d = parseDeDate(dateRaw) ?? parseUsDate(dateRaw)
    if (!d) {
      errors.push(
        `Row ${rowNo}: invalid date "${dateRaw}" (expected DD.MM.YYYY).`
      )
      continue
    }
    const inAmt = cellToAmount(r[2])
    const outAmt = cellToAmount(r[3])
    if (inAmt === null || outAmt === null) {
      errors.push(
        `Row ${rowNo}: couldn't read Eingänge/Ausgänge amount ("${r[2]}" / "${r[3]}").`
      )
      continue
    }
    rows.push({
      idx: i,
      year: d.year,
      month: d.month,
      day: d.day,
      type: String(r[1] ?? "").trim(),
      net: inAmt - outAmt,
      balance: cellToBalance(r[4]),
    })
  }

  const result = aggregateRows(rows)
  return { ...result, errors }
}

export const bondoraParser: BrokerParser = {
  id: "bondora",
  label: "Bondora (Go & Grow)",
  parse(csv: string): BrokerParseResult {
    if (csv.startsWith(XLSX_MARKER)) {
      return parseXlsxBase64(csv.slice(XLSX_MARKER.length))
    }
    return parseCsvText(csv)
  },
}
