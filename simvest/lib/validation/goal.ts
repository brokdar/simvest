import { GOAL_KINDS, GOAL_SCOPES } from "@/lib/types"
import type { GoalKind, GoalScope } from "@/lib/types"
import {
  asEnumValue,
  asFiniteNumber,
  asNonEmptyString,
  asString,
  err,
  isObject,
  ok,
  type ValidationResult,
} from "./_helpers"

const SWR_MAX = 20
const YIELD_MAX = 20
const SWR_RANGE_MSG = `swr must be > 0 and ≤ ${SWR_MAX}`
const YIELD_RANGE_MSG = `yieldAssumed must be > 0 and ≤ ${YIELD_MAX}`

export type GoalCreate = {
  name: string
  color: string
  kind: GoalKind
  scope: GoalScope
  portfolioId: number | null
  target: number
  targetYear: number
  swr: number | null
  yieldAssumed: number | null
}

export type GoalPatch = Partial<GoalCreate>

export function validateGoalCreate(
  body: unknown
): ValidationResult<GoalCreate> {
  if (!isObject(body)) return err("invalid body")

  const name = asNonEmptyString(body.name)
  if (name === null) return err("name is required")

  const kind = asEnumValue<GoalKind>(body.kind, GOAL_KINDS)
  if (kind === null) return err("invalid kind")

  const scope = asEnumValue<GoalScope>(body.scope, GOAL_SCOPES)
  if (scope === null) return err("invalid scope")

  let portfolioId: number | null = null
  if (scope === "portfolio") {
    const pid = asFiniteNumber(body.portfolioId)
    if (pid === null) {
      return err("portfolioId is required when scope is 'portfolio'")
    }
    portfolioId = pid
  }

  const target = asFiniteNumber(body.target)
  if (target === null || target <= 0) {
    return err("target must be a positive number")
  }

  const targetYear = asFiniteNumber(body.targetYear)
  if (targetYear === null) return err("targetYear is required")

  let swr: number | null = null
  if (kind === "annual_income" && body.swr != null) {
    const n = asFiniteNumber(body.swr)
    if (n === null || n <= 0 || n > SWR_MAX) {
      return err(SWR_RANGE_MSG)
    }
    swr = n
  }

  let yieldAssumed: number | null = null
  if (kind.startsWith("dividend_") && body.yieldAssumed != null) {
    const n = asFiniteNumber(body.yieldAssumed)
    if (n === null || n <= 0 || n > YIELD_MAX) {
      return err(YIELD_RANGE_MSG)
    }
    yieldAssumed = n
  }

  const color = asString(body.color) || "#1E40AF"

  return ok({
    name,
    color,
    kind,
    scope,
    portfolioId,
    target,
    targetYear: Math.floor(targetYear),
    swr,
    yieldAssumed,
  })
}

/**
 * PATCH validator. Only fields that appear in `body` are returned in `.data`,
 * so callers can spread the patch into their drizzle `.set(...)`. Cross-field
 * effects (kind change → blank swr/yieldAssumed; scope change → blank
 * portfolioId) need the existing record's kind/scope, so the route loads
 * the row and feeds both into `applyGoalCrossFieldRules` after this validator.
 */
export function validateGoalPatch(body: unknown): ValidationResult<GoalPatch> {
  if (!isObject(body)) return err("invalid body")
  const patch: GoalPatch = {}

  if (body.name !== undefined) {
    const name = asNonEmptyString(body.name)
    if (name === null) return err("name empty")
    patch.name = name
  }
  if (body.color !== undefined) {
    const color = asString(body.color)
    if (color !== null) patch.color = color
  }
  if (body.kind !== undefined) {
    const kind = asEnumValue<GoalKind>(body.kind, GOAL_KINDS)
    if (kind === null) return err("invalid kind")
    patch.kind = kind
  }
  if (body.scope !== undefined) {
    const scope = asEnumValue<GoalScope>(body.scope, GOAL_SCOPES)
    if (scope === null) return err("invalid scope")
    patch.scope = scope
  }
  if (body.portfolioId !== undefined) {
    if (body.portfolioId === null) {
      patch.portfolioId = null
    } else {
      const pid = asFiniteNumber(body.portfolioId)
      if (pid === null) return err("invalid portfolioId")
      patch.portfolioId = pid
    }
  }
  if (body.target !== undefined) {
    const t = asFiniteNumber(body.target)
    if (t === null || t <= 0) return err("target must be positive")
    patch.target = t
  }
  if (body.targetYear !== undefined) {
    const ty = asFiniteNumber(body.targetYear)
    if (ty === null) return err("invalid targetYear")
    patch.targetYear = Math.floor(ty)
  }
  if (body.swr !== undefined) {
    if (body.swr === null) {
      patch.swr = null
    } else {
      const n = asFiniteNumber(body.swr)
      if (n === null || n <= 0 || n > SWR_MAX) {
        return err(SWR_RANGE_MSG)
      }
      patch.swr = n
    }
  }
  if (body.yieldAssumed !== undefined) {
    if (body.yieldAssumed === null) {
      patch.yieldAssumed = null
    } else {
      const n = asFiniteNumber(body.yieldAssumed)
      if (n === null || n <= 0 || n > YIELD_MAX) {
        return err(YIELD_RANGE_MSG)
      }
      patch.yieldAssumed = n
    }
  }

  return ok(patch)
}

/**
 * Apply cross-field rules a PATCH validator can't enforce on its own: they
 * need the existing record's kind/scope to decide what's "effective" after
 * the merge.
 *
 * - Scope change to combined → blank portfolioId.
 * - Scope change to portfolio with no portfolioId in patch or existing → 400.
 * - Kind change → blank swr / yieldAssumed when they no longer apply.
 * - Same kind but patch sets the wrong-kind field to a real value → 400 (not
 *   silent null) so the caller knows the slider drag was rejected.
 */
export function applyGoalCrossFieldRules(
  patch: GoalPatch,
  existing: { kind: GoalKind; scope: GoalScope; portfolioId: number | null }
): ValidationResult<GoalPatch> {
  const out: GoalPatch = { ...patch }

  if (patch.scope !== undefined) {
    if (patch.scope === "combined") {
      out.portfolioId = null
    } else if (patch.scope === "portfolio") {
      const resolvedPid =
        patch.portfolioId !== undefined
          ? patch.portfolioId
          : existing.portfolioId
      if (resolvedPid == null) {
        return err("portfolioId required for portfolio scope")
      }
    }
  }

  const effectiveKind: GoalKind = patch.kind ?? existing.kind
  const kindChanged = patch.kind !== undefined && patch.kind !== existing.kind

  if (effectiveKind !== "annual_income") {
    if (kindChanged) {
      out.swr = null
    } else if (patch.swr !== undefined && patch.swr !== null) {
      return err("swr only applies when kind is 'annual_income'")
    }
  }

  if (!effectiveKind.startsWith("dividend_")) {
    if (kindChanged) {
      out.yieldAssumed = null
    } else if (
      patch.yieldAssumed !== undefined &&
      patch.yieldAssumed !== null
    ) {
      return err(
        "yieldAssumed only applies when kind is 'dividend_annual' or 'dividend_monthly'"
      )
    }
  }

  return ok(out)
}
