import {
  asFiniteNumber,
  asNonEmptyString,
  asString,
  err,
  isObject,
  ok,
  type ValidationResult,
} from "./_helpers"

export type PortfolioCreate = {
  name: string
  color: string
  targetMonthlyContribution: number
  startingValue: number
  startingDate: string | null
}

export type PortfolioPatchValidated = Partial<PortfolioCreate>

const STARTING_DATE_RE = /^\d{4}-\d{2}$/

function validateStartingDate(
  v: unknown
): { ok: true; value: string | null } | { ok: false } {
  if (v === null || v === "") return { ok: true, value: null }
  if (typeof v !== "string") return { ok: false }
  return STARTING_DATE_RE.test(v) ? { ok: true, value: v } : { ok: false }
}

export function validatePortfolioCreate(
  body: unknown
): ValidationResult<PortfolioCreate> {
  if (!isObject(body)) return err("invalid body")

  const name = asNonEmptyString(body.name)
  if (name === null) return err("name is required")

  const color = asString(body.color) || "#1E40AF"

  const tmcRaw = asFiniteNumber(body.targetMonthlyContribution)
  const targetMonthlyContribution = tmcRaw !== null && tmcRaw >= 0 ? tmcRaw : 0

  const svRaw = asFiniteNumber(body.startingValue)
  const startingValue = svRaw !== null && svRaw >= 0 ? svRaw : 0

  let startingDate: string | null = null
  if (body.startingDate !== undefined) {
    const sd = validateStartingDate(body.startingDate)
    if (!sd.ok) return err("startingDate must be YYYY-MM or null")
    startingDate = sd.value
  }

  return ok({
    name,
    color,
    targetMonthlyContribution,
    startingValue,
    startingDate,
  })
}

export function validatePortfolioPatch(
  body: unknown
): ValidationResult<PortfolioPatchValidated> {
  if (!isObject(body)) return err("invalid body")
  const patch: PortfolioPatchValidated = {}

  if (body.name !== undefined) {
    const name = asNonEmptyString(body.name)
    if (name === null) return err("name cannot be empty")
    patch.name = name
  }
  if (body.color !== undefined) {
    const color = asString(body.color)
    if (color !== null) patch.color = color
  }
  if (body.targetMonthlyContribution !== undefined) {
    const n = asFiniteNumber(body.targetMonthlyContribution)
    if (n === null || n < 0) {
      return err("targetMonthlyContribution must be a non-negative number")
    }
    patch.targetMonthlyContribution = n
  }
  if (body.startingValue !== undefined) {
    const n = asFiniteNumber(body.startingValue)
    if (n === null || n < 0) {
      return err("startingValue must be a non-negative number")
    }
    patch.startingValue = n
  }
  if (body.startingDate !== undefined) {
    const sd = validateStartingDate(body.startingDate)
    if (!sd.ok) return err("startingDate must be YYYY-MM or null")
    patch.startingDate = sd.value
  }

  if (Object.keys(patch).length === 0) return err("no changes")
  return ok(patch)
}
