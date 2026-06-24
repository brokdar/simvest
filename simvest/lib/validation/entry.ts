import { daysInMonth } from "@/lib/dates"
import {
  asFiniteNumber,
  asString,
  err,
  isObject,
  ok,
  type ValidationResult,
} from "./_helpers"

export type EntryUpsert = {
  year: number
  month: number
  day: number
  invested: number
  value: number | null
  note: string
}

export type EntryPatchValidated = Partial<{
  year: number
  month: number
  day: number
  invested: number
  value: number | null
  note: string
}>

export function validateEntryUpsert(
  body: unknown
): ValidationResult<EntryUpsert> {
  if (!isObject(body)) return err("invalid body")

  const yearRaw = asFiniteNumber(body.year)
  const monthRaw = asFiniteNumber(body.month)
  if (yearRaw === null || monthRaw === null) {
    return err("year and month are required")
  }
  const dayRaw = asFiniteNumber(body.day)
  if (dayRaw === null) return err("day is required")

  const month = Math.max(1, Math.min(12, Math.floor(monthRaw)))
  const year = Math.floor(yearRaw)
  const day = Math.floor(dayRaw)
  const dim = daysInMonth(year, month)
  if (day < 1 || day > dim) {
    return err(`day must be between 1 and ${dim} for ${year}-${month}`)
  }

  const investedRaw = asFiniteNumber(body.invested)
  const invested = investedRaw ?? 0

  // null is a legitimate "not recorded"; only fall back when the field is
  // omitted entirely.
  let value: number | null = null
  if (body.value !== undefined) {
    if (body.value === null) {
      value = null
    } else {
      const n = asFiniteNumber(body.value)
      value = n
    }
  }

  const note = asString(body.note) ?? ""

  return ok({ year, month, day, invested, value, note })
}

/**
 * PATCH validator for `/api/entries/[id]`. The route still needs to fetch
 * `existing` to resolve effective (year, month, day) for the day-of-month
 * check — the validator can't know what the unchanged fields are.
 */
export function validateEntryPatch(
  body: unknown
): ValidationResult<EntryPatchValidated> {
  if (!isObject(body)) return err("invalid body")
  const patch: EntryPatchValidated = {}

  if (body.year !== undefined) {
    const n = asFiniteNumber(body.year)
    if (n === null) return err("invalid year")
    patch.year = Math.floor(n)
  }
  if (body.month !== undefined) {
    const n = asFiniteNumber(body.month)
    if (n === null) return err("invalid month")
    patch.month = Math.max(1, Math.min(12, Math.floor(n)))
  }
  if (body.day !== undefined) {
    const n = asFiniteNumber(body.day)
    if (n === null) return err("invalid day")
    patch.day = Math.floor(n)
  }
  if (body.invested !== undefined) {
    const n = asFiniteNumber(body.invested)
    if (n === null) return err("invalid invested")
    patch.invested = n
  }
  if (body.value !== undefined) {
    if (body.value === null) {
      patch.value = null
    } else {
      const n = asFiniteNumber(body.value)
      if (n === null) return err("invalid value")
      patch.value = n
    }
  }
  if (body.note !== undefined) {
    patch.note = String(body.note)
  }

  if (Object.keys(patch).length === 0) return err("no changes")
  return ok(patch)
}

/**
 * Re-validates day against effective year+month after the route has merged
 * the patch with the existing record. Returns `null` on success.
 */
export function validateEntryDay(
  year: number,
  month: number,
  day: number
): string | null {
  const dim = daysInMonth(year, month)
  if (day < 1 || day > dim) {
    return `day must be between 1 and ${dim} for ${year}-${month}`
  }
  return null
}
