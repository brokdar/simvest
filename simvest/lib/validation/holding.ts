import { ISIN_RE } from "@/lib/types"
import type { HoldingType } from "@/lib/types"
import {
  asEnumValue,
  asFiniteNumber,
  asNonEmptyString,
  err,
  isObject,
  ok,
  type ValidationResult,
} from "./_helpers"

export const HOLDING_TYPES: HoldingType[] = ["stock", "etf", "bond", "other"]

export type HoldingCreate = {
  portfolioId: number
  name: string
  type: HoldingType
  isin: string | null
}

export type HoldingPatchValidated = {
  name?: string
  type?: HoldingType
  isin?: string | null
}

function normalizeIsin(v: unknown): string | null | "invalid" {
  if (v == null) return null
  if (typeof v !== "string") return "invalid"
  const trimmed = v.trim()
  if (trimmed === "") return null
  const candidate = trimmed.toUpperCase()
  return ISIN_RE.test(candidate) ? candidate : "invalid"
}

export function validateHoldingCreate(
  body: unknown
): ValidationResult<HoldingCreate> {
  if (!isObject(body)) return err("invalid body")

  const portfolioId = asFiniteNumber(body.portfolioId)
  if (portfolioId === null) return err("portfolioId is required")

  const name = asNonEmptyString(body.name)
  if (name === null) return err("name is required")

  const rawType = body.type ?? "etf"
  const type = asEnumValue<HoldingType>(rawType, HOLDING_TYPES)
  if (type === null) {
    return err(`type must be one of ${HOLDING_TYPES.join(", ")}`)
  }

  const isin = normalizeIsin(body.isin)
  if (isin === "invalid") {
    return err("isin must match ISO 6166 (e.g. US0378331005)")
  }

  return ok({ portfolioId, name, type, isin })
}

export function validateHoldingPatch(
  body: unknown
): ValidationResult<HoldingPatchValidated> {
  if (!isObject(body)) return err("invalid body")
  const patch: HoldingPatchValidated = {}

  if (body.name !== undefined) {
    const name = asNonEmptyString(body.name)
    if (name === null) return err("name cannot be empty")
    patch.name = name
  }
  if (body.type !== undefined) {
    const type = asEnumValue<HoldingType>(body.type, HOLDING_TYPES)
    if (type === null) {
      return err(`type must be one of ${HOLDING_TYPES.join(", ")}`)
    }
    patch.type = type
  }
  if (body.isin !== undefined) {
    const isin = normalizeIsin(body.isin)
    if (isin === "invalid") {
      return err("isin must match ISO 6166 (e.g. US0378331005)")
    }
    patch.isin = isin
  }

  if (Object.keys(patch).length === 0) return err("no changes")
  return ok(patch)
}

/**
 * String coercion / trim for a single ISIN (no validation). Useful where the
 * route needs to canonicalize before a DB lookup (duplicate check) but the
 * patch validator has already vetted the shape.
 */
export function normalizeIsinOrThrow(raw: string): string {
  return raw.trim().toUpperCase()
}
