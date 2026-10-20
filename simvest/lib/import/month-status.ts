import { fmtCount } from "@/lib/format"
import type { ImportMonthStatus } from "./types"

/**
 * How an incoming month relates to what's stored (D3):
 * - `new`        — no entry for that month yet
 * - `correction` — an entry exists and the import would change its invested
 *                  or value (e.g. stored €15.728,37, statement says €15.740,93)
 * - `unchanged`  — an entry exists and the import says the same thing
 *
 * `incomingValue` is null for brokers that don't report a balance (Trade
 * Republic); the stored value is left alone then, so it can't differ.
 */
export function classifyMonth(input: {
  exists: boolean
  currentInvested: number
  currentValue: number | null
  incomingInvested: number
  incomingValue: number | null
}): ImportMonthStatus {
  if (!input.exists) return "new"
  const investedDiffers =
    Math.abs(input.currentInvested - input.incomingInvested) >= 0.005
  const valueDiffers =
    input.incomingValue !== null &&
    (input.currentValue === null ||
      Math.abs(input.currentValue - input.incomingValue) >= 0.005)
  return investedDiffers || valueDiffers ? "correction" : "unchanged"
}

/** New months and corrections are written by default; unchanged ones skip. */
export function defaultMonthAction(
  status: ImportMonthStatus
): "replace" | "skip" {
  return status === "unchanged" ? "skip" : "replace"
}

/** "4 new · 1 correction · 1 unchanged" — zero parts are left out. */
export function summarizeMonthStatuses(statuses: ImportMonthStatus[]): string {
  const n = statuses.filter((s) => s === "new").length
  const c = statuses.filter((s) => s === "correction").length
  const u = statuses.filter((s) => s === "unchanged").length
  const parts: string[] = []
  if (n > 0) parts.push(`${n} new`)
  if (c > 0) parts.push(fmtCount(c, "correction", "corrections"))
  if (u > 0) parts.push(`${u} unchanged`)
  return parts.length > 0 ? parts.join(" · ") : "no months"
}
