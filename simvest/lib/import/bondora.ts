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
 * The export is semicolon-separated with German-formatted numbers (decimal
 * comma) and US-style `M/D/YYYY` dates:
 *
 *   Date;Payment type;In;Out;Balance
 *   1/2/2024;SEPA payment;100;;5716,09
 *   1/3/2024;Go & Grow returns;0,93;;5717,02
 *
 * Mapping into the app model:
 *   - "Go & Grow returns" → a daily interest income event (tax 0; Bondora
 *     pays gross). One event per CSV row.
 *   - any other cash movement ("SEPA payment", withdrawals) → that month's
 *     net contribution (In − Out; a withdrawal nets negative).
 *   - the running `Balance` → the month-end portfolio value (last row of the
 *     month, after a defensive date sort).
 *
 * Idempotency hinges on a stable, date-derived `sourceTransactionId`
 * (`bondora:ret:YYYY-MM-DD:n`) so re-importing the same — or an extended —
 * statement skips rows already imported and only inserts genuinely new days.
 */

const REQUIRED_COLUMNS = ["Date", "Payment type", "In", "Out", "Balance"]
const DEPOSIT_TYPE = "SEPA payment"
const RETURNS_RE = /returns/i

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

type Row = {
  idx: number
  year: number
  month: number
  day: number
  type: string
  net: number
  balance: number | null
}

export const bondoraParser: BrokerParser = {
  id: "bondora",
  label: "Bondora (Go & Grow)",
  parse(csv: string): BrokerParseResult {
    const warnings: string[] = []
    const errors: string[] = []

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

    // ── Parse rows ──────────────────────────────────────────────────────
    const rows: Row[] = []
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

    // Defensive sort: chronological, original order breaks ties. Makes the
    // month-end value and the per-date interest index deterministic
    // regardless of the export's row order.
    rows.sort(
      (a, b) =>
        a.year - b.year || a.month - b.month || a.day - b.day || a.idx - b.idx
    )

    // ── Aggregate ───────────────────────────────────────────────────────
    const monthMap = new Map<string, ParsedMonthAggregate>()
    const income: ParsedIncomeEvent[] = []
    const returnsPerDate = new Map<string, number>()
    const depositsPerDate = new Map<string, number>()

    for (const r of rows) {
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
      if (r.type !== DEPOSIT_TYPE) {
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
    const first = rows[0]
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
      errors,
    }
  },
}
