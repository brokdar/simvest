import type { GoalKind, HoldingType, IncomeKind } from "@/lib/types"

export const TRANSFER_FILE_VERSION = 1
export const TRANSFER_FILE_KIND = "simvest.portfolio" as const

/**
 * Wire shape for the per-portfolio transfer bundle. See
 * `feature-export-import.md` for the canonical schema. Field invariants:
 *
 * - `holdings[i].holdingRef === i` — the in-file index, redundant with array
 *   position but explicit so consumers can verify it.
 * - `incomeEvents[i].holdingRef` indexes `holdings` (null only when
 *   `kind === "interest"`).
 * - `entries[i].value` is nullable end-to-end — null means "month-end not
 *   recorded," never zero.
 * - Combined goals (`scope: "combined"`) are excluded from the bundle.
 */
export type TransferPortfolioFile = {
  version: typeof TRANSFER_FILE_VERSION
  kind: typeof TRANSFER_FILE_KIND
  exportedAt: string
  sourceAppVersion: string
  portfolio: {
    name: string
    color: string
    targetMonthlyContribution: number
    startingValue: number
    startingDate: string | null
    createdAt: number
  }
  entries: Array<{
    year: number
    month: number
    day: number
    invested: number
    value: number | null
    note: string
  }>
  holdings: Array<{
    holdingRef: number
    name: string
    type: HoldingType
    isin: string | null
    createdAt: number
  }>
  incomeEvents: Array<{
    holdingRef: number | null
    paidDate: string
    amount: number
    kind: IncomeKind
    tax: number
    note: string
    createdAt: number
  }>
  goals: Array<{
    name: string
    color: string
    kind: GoalKind
    targetYear: number
    target: number
    swr: number | null
    yieldAssumed: number | null
    createdAt: number
  }>
  /**
   * Informational metadata about the export. Travels alongside the data so
   * the importing instance can surface signals that aren't reconstructible
   * from the payload itself (e.g. how many combined goals the source
   * elected not to ship). Optional so older v1 exports — written before
   * this field landed — still validate.
   */
  meta?: {
    combinedGoalsExcluded?: number
  }
}

/**
 * Pre-commit preview returned by the import/preview route. The dialog
 * renders counts + warnings, lets the user confirm the resolved name, and
 * posts to the commit route. Errors are surfaced at the upload step (this
 * shape only describes the happy path).
 */
export type TransferPreview = {
  resolvedName: string
  collidedWithExistingName: boolean
  counts: {
    entries: number
    holdings: number
    dividends: number
    interest: number
    goals: number
  }
  warnings: string[]
}

export type RestoreSummary = {
  newPortfolioId: number
  resolvedName: string
  entriesCreated: number
  holdingsCreated: number
  dividendsCreated: number
  interestCreated: number
  goalsCreated: number
}
