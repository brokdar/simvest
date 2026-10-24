import { err, isObject, ok, type ValidationResult } from "./_helpers"

const MAX_IDS = 200
const MAX_ID_LENGTH = 100

/** Accepts `{ id }` or `{ ids: [...] }` and returns the distinct ids. */
export function validateMilestoneDismiss(
  body: unknown
): ValidationResult<string[]> {
  if (!isObject(body)) return err("invalid body")
  const raw = body.ids !== undefined ? body.ids : [body.id]
  if (!Array.isArray(raw) || raw.length === 0) return err("id is required")
  if (raw.length > MAX_IDS) return err("too many ids")
  for (const id of raw) {
    if (
      typeof id !== "string" ||
      id.length === 0 ||
      id.length > MAX_ID_LENGTH
    ) {
      return err("id must be a non-empty string")
    }
  }
  return ok([...new Set(raw as string[])])
}
