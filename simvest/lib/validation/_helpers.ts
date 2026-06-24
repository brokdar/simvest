/**
 * Validation primitives shared by every per-resource validator. No schema
 * library — keeps the route handlers' `parse → validate → drizzle → respond`
 * shape, just lifts the duplicated coercion/range/enum checks behind a
 * narrow seam so the rules live in one place per resource.
 */
export type ValidationResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string }

export function ok<T>(data: T): ValidationResult<T> {
  return { ok: true, data }
}

export function err(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

export function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/** Trim a string. Returns `null` if not a string. */
export function asString(v: unknown): string | null {
  return typeof v === "string" ? v.trim() : null
}

/** Trim a string and require it to be non-empty. */
export function asNonEmptyString(v: unknown): string | null {
  const s = asString(v)
  return s !== null && s.length > 0 ? s : null
}

/** Coerce to a finite number. `Number(null)` and `Number("")` reject. */
export function asFiniteNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

export function asEnumValue<T extends string>(
  v: unknown,
  allowed: readonly T[]
): T | null {
  if (typeof v !== "string") return null
  return (allowed as readonly string[]).includes(v) ? (v as T) : null
}

export function inRange(n: number, min: number, max: number): boolean {
  return n >= min && n <= max
}
