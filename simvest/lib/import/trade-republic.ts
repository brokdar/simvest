import type { HoldingType } from "@/lib/types"
import { ISIN_RE } from "@/lib/types"
import { csvToObjects } from "./csv"
import type {
  BrokerParseResult,
  BrokerParser,
  ParsedHoldingCandidate,
  ParsedIncomeEvent,
  ParsedMonthAggregate,
} from "./types"

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const IGNORED_CATEGORIES = new Set([
  "TRADING",
  "CORPORATE_ACTION",
  "DELIVERY",
  "STOCKPERK",
  "EXCHANGE",
  "SEC_ACCOUNT",
])
const WARN_CATEGORIES = new Set(["STOCKPERK", "EXCHANGE", "SEC_ACCOUNT"])

/**
 * Map Trade Republic's `asset_class` column to our `HoldingType` enum.
 * STOCK + FUND map cleanly; DERIVATIVE and the empty case fall to "other".
 */
function mapAssetClass(raw: string): HoldingType | null {
  switch (raw) {
    case "STOCK":
      return "stock"
    case "FUND":
      return "etf"
    case "DERIVATIVE":
      return "other"
    case "":
      return null
    default:
      return "other"
  }
}

function parseAmount(raw: string): number {
  if (!raw) return 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

export const tradeRepublicParser: BrokerParser = {
  id: "trade_republic",
  label: "Trade Republic",
  parse(csv: string): BrokerParseResult {
    const warnings: string[] = []
    const errors: string[] = []

    let rows: Record<string, string>[]
    try {
      rows = csvToObjects(csv)
    } catch (err) {
      errors.push(
        `Could not parse CSV: ${err instanceof Error ? err.message : "unknown error"}`
      )
      return {
        monthsAggregated: [],
        income: [],
        holdingsCandidates: [],
        warnings,
        errors,
      }
    }

    // Validate that the file looks like a Trade Republic export.
    if (rows.length > 0) {
      const first = rows[0]
      const requiredColumns = [
        "date",
        "category",
        "type",
        "amount",
        "transaction_id",
      ]
      const missing = requiredColumns.filter((c) => !(c in first))
      if (missing.length) {
        errors.push(
          `CSV is missing required columns: ${missing.join(", ")}. Expected a Trade Republic transaction export.`
        )
        return {
          monthsAggregated: [],
          income: [],
          holdingsCandidates: [],
          warnings,
          errors,
        }
      }
    }

    const monthMap = new Map<string, ParsedMonthAggregate>()
    const income: ParsedIncomeEvent[] = []
    const holdingMap = new Map<string, ParsedHoldingCandidate>()
    // Track ISINs that actually paid dividends — we only emit holding
    // candidates for those.
    const dividendIsins = new Set<string>()

    for (const r of rows) {
      const date = r.date
      const category = r.category
      const type = r.type
      const txnId = r.transaction_id

      if (!date || !category || !type) continue
      if (!ISO_DATE_RE.test(date)) {
        errors.push(`Row ${txnId || "?"}: invalid date "${date}"`)
        continue
      }

      const year = Number(date.slice(0, 4))
      const month = Number(date.slice(5, 7))
      const amount = parseAmount(r.amount)
      const tax = parseAmount(r.tax) // negative or 0 in TR

      // ── CASH category ────────────────────────────────────────────────
      if (category === "CASH") {
        if (type === "CUSTOMER_INBOUND" || type === "TRANSFER_INBOUND") {
          if (amount <= 0) continue
          const key = `${year}-${month}`
          const existing = monthMap.get(key)
          if (existing) {
            existing.deposits += amount
            existing.sourceTransactionIds.push(txnId)
          } else {
            monthMap.set(key, {
              year,
              month,
              deposits: amount,
              sourceTransactionIds: [txnId],
            })
          }
          continue
        }
        if (type === "INTEREST_PAYMENT") {
          if (amount <= 0) continue
          income.push({
            kind: "interest",
            isin: null,
            holdingName: null,
            assetClass: null,
            paidDate: date,
            amount,
            tax,
            sourceTransactionId: txnId,
          })
          continue
        }
        if (type === "DIVIDEND") {
          if (amount <= 0) continue
          const isinRaw = (r.symbol || "").toUpperCase()
          const isin = ISIN_RE.test(isinRaw) ? isinRaw : null
          const holdingName = r.name || null
          const assetClass = mapAssetClass(r.asset_class || "")
          income.push({
            kind: "dividend",
            isin,
            holdingName,
            assetClass,
            paidDate: date,
            amount,
            tax,
            sourceTransactionId: txnId,
          })
          if (isin) {
            dividendIsins.add(isin)
            if (!holdingMap.has(isin)) {
              holdingMap.set(isin, {
                isin,
                name: holdingName ?? isin,
                type: assetClass ?? "other",
              })
            }
          }
          continue
        }
        // Other CASH types: warn but continue
        warnings.push(`Unrecognized CASH type "${type}" (txn ${txnId})`)
        continue
      }

      if (IGNORED_CATEGORIES.has(category)) {
        if (WARN_CATEGORIES.has(category)) {
          warnings.push(
            `Skipped ${category} row (txn ${txnId}) — not supported by v1`
          )
        }
        continue
      }

      warnings.push(`Unknown category "${category}" (txn ${txnId})`)
    }

    const monthsAggregated = [...monthMap.values()].sort(
      (a, b) => a.year * 12 + a.month - (b.year * 12 + b.month)
    )

    const holdingsCandidates = [...holdingMap.values()].filter((h) =>
      dividendIsins.has(h.isin)
    )

    return {
      monthsAggregated,
      income,
      holdingsCandidates,
      warnings,
      errors,
    }
  },
}
