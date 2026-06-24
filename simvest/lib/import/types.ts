import type { HoldingType, IncomeKind } from "@/lib/types"

export type BrokerId = "trade_republic" | "bondora"

export const BROKER_IDS: BrokerId[] = ["trade_republic", "bondora"]

export type ParsedMonthAggregate = {
  year: number
  month: number
  deposits: number
  sourceTransactionIds: string[]
  /**
   * Month-end portfolio value, when the source records a running balance
   * (e.g. Bondora's `Balance` column). `undefined`/`null` means the broker
   * doesn't report a value (Trade Republic) — the engine leaves the entry's
   * value untouched / null in that case.
   */
  value?: number | null
}

export type ParsedIncomeEvent = {
  kind: IncomeKind
  isin: string | null
  holdingName: string | null
  assetClass: HoldingType | null
  paidDate: string
  amount: number // gross
  tax: number // negative or 0
  sourceTransactionId: string
}

export type ParsedHoldingCandidate = {
  isin: string
  name: string
  type: HoldingType
}

export type BrokerParseResult = {
  monthsAggregated: ParsedMonthAggregate[]
  income: ParsedIncomeEvent[]
  holdingsCandidates: ParsedHoldingCandidate[]
  warnings: string[]
  errors: string[]
}

export type BrokerParser = {
  id: BrokerId
  label: string
  parse(csv: string): BrokerParseResult
}

// ── Server-side preview / commit types ──────────────────────────────────────

export type ImportPreviewMonth = {
  year: number
  month: number
  newInvested: number
  currentInvested: number
  /** Month-end value the import would write, or null if the broker reports none. */
  newValue: number | null
  /** The entry's existing value, or null if there's no entry / no value yet. */
  currentValue: number | null
  sourceTransactionIds: string[]
  breakdown: {
    deposits: number
  }
}

export type ImportPreviewIncome = {
  kind: IncomeKind
  isin: string | null
  holdingName: string | null
  paidDate: string
  amount: number
  tax: number
  sourceTransactionId: string
  alreadyImported: boolean
}

export type ImportPreviewHolding = {
  isin: string
  name: string
  type: HoldingType
  exists: boolean
}

export type ImportPreview = {
  months: ImportPreviewMonth[]
  incomeEvents: ImportPreviewIncome[]
  holdings: ImportPreviewHolding[]
  warnings: string[]
  errors: string[]
}

export type ImportDecisions = {
  months: Array<{
    year: number
    month: number
    action: "replace" | "skip"
  }>
  importDividends: boolean
  importInterest: boolean
  importHoldings: boolean
}

export type ImportApplied = {
  entriesUpserted: number
  holdingsCreated: number
  dividendsInserted: number
  interestInserted: number
  duplicatesSkipped: number
  warnings: string[]
}
