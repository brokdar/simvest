import { INCOME_KINDS } from "@/lib/types"
import type { IncomeKind } from "@/lib/types"
import {
  asEnumValue,
  asFiniteNumber,
  asString,
  err,
  isObject,
  ok,
  type ValidationResult,
} from "./_helpers"

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Income-event create returns a discriminated union. Dividend events carry
 * `holdingId`; the route resolves `portfolioId` from the holding lookup.
 * Interest events carry `portfolioId` directly and must not have a holding.
 */
export type IncomeEventCreateValidated =
  | {
      kind: "dividend"
      holdingId: number
      paidDate: string
      amount: number
      tax: number
      note: string
    }
  | {
      kind: "interest"
      portfolioId: number
      paidDate: string
      amount: number
      tax: number
      note: string
    }

export type IncomeEventPatchValidated = {
  kind?: IncomeKind
  holdingId?: number | null
  paidDate?: string
  amount?: number
  tax?: number
  note?: string
}

function validateDate(v: unknown): string | null {
  if (typeof v !== "string") return null
  if (!ISO_DATE.test(v) || Number.isNaN(Date.parse(v))) return null
  return v
}

function validateAmount(v: unknown): number | null {
  const n = asFiniteNumber(v)
  return n !== null && n > 0 ? n : null
}

function validateTax(v: unknown): number | null {
  const n = asFiniteNumber(v)
  return n !== null && n <= 0 ? n : null
}

export function validateIncomeEventCreate(
  body: unknown
): ValidationResult<IncomeEventCreateValidated> {
  if (!isObject(body)) return err("invalid body")

  const rawKind = body.kind ?? "dividend"
  const kind = asEnumValue<IncomeKind>(rawKind, INCOME_KINDS)
  if (kind === null) {
    return err(`kind must be one of ${INCOME_KINDS.join(", ")}`)
  }

  const paidDate = validateDate(body.paidDate)
  if (paidDate === null) return err("paidDate must be ISO YYYY-MM-DD")

  const amount = validateAmount(body.amount)
  if (amount === null) return err("amount must be a positive number")

  const tax = body.tax === undefined ? 0 : validateTax(body.tax)
  if (tax === null) return err("tax must be 0 or negative (withholding)")

  const note = asString(body.note) ?? ""

  if (kind === "dividend") {
    const holdingId = asFiniteNumber(body.holdingId)
    if (holdingId === null) return err("holdingId is required for dividend")
    return ok({ kind, holdingId, paidDate, amount, tax, note })
  }

  // kind === "interest"
  if (body.holdingId != null) {
    return err("interest events must not have a holdingId")
  }
  const portfolioId = asFiniteNumber(body.portfolioId)
  if (portfolioId === null) {
    return err("portfolioId is required for interest")
  }
  return ok({ kind, portfolioId, paidDate, amount, tax, note })
}

export function validateIncomeEventPatch(
  body: unknown
): ValidationResult<IncomeEventPatchValidated> {
  if (!isObject(body)) return err("invalid body")
  const patch: IncomeEventPatchValidated = {}

  if (body.kind !== undefined) {
    const kind = asEnumValue<IncomeKind>(body.kind, INCOME_KINDS)
    if (kind === null) {
      return err(`kind must be one of ${INCOME_KINDS.join(", ")}`)
    }
    patch.kind = kind
  }
  if (body.holdingId !== undefined) {
    if (body.holdingId === null) {
      patch.holdingId = null
    } else {
      const hid = asFiniteNumber(body.holdingId)
      if (hid === null) return err("invalid holdingId")
      patch.holdingId = hid
    }
  }
  if (body.paidDate !== undefined) {
    const pd = validateDate(body.paidDate)
    if (pd === null) return err("paidDate must be ISO YYYY-MM-DD")
    patch.paidDate = pd
  }
  if (body.amount !== undefined) {
    const a = validateAmount(body.amount)
    if (a === null) return err("amount must be a positive number")
    patch.amount = a
  }
  if (body.tax !== undefined) {
    const t = validateTax(body.tax)
    if (t === null) return err("tax must be 0 or negative (withholding)")
    patch.tax = t
  }
  if (body.note !== undefined) {
    patch.note = String(body.note)
  }

  if (Object.keys(patch).length === 0) return err("no changes")
  return ok(patch)
}
