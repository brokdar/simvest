import { isValidEntryDayPref } from "@/lib/dates"
import { DIVIDEND_BASES } from "@/lib/types"
import type { DividendBasis, SettingsDTO } from "@/lib/types"
import {
  asEnumValue,
  asFiniteNumber,
  err,
  isObject,
  ok,
  type ValidationResult,
} from "./_helpers"

export type SettingsPatchValidated = Partial<
  Pick<
    SettingsDTO,
    | "inflation"
    | "conservativeReturn"
    | "optimisticReturn"
    | "monthlySaving"
    | "horizonYears"
    | "defaultEntryDay"
    | "defaultSwr"
    | "dividendBasis"
    | "locale"
  >
>

const NUMERIC_FIELDS = [
  "inflation",
  "conservativeReturn",
  "optimisticReturn",
  "monthlySaving",
  "horizonYears",
  "defaultSwr",
] as const

function validateLocale(
  v: unknown
): { ok: true; value: string | null } | { ok: false; error: string } {
  if (v === null) return { ok: true, value: null }
  if (typeof v !== "string") {
    return { ok: false, error: "locale must be a valid BCP-47 tag" }
  }
  // `Intl.getCanonicalLocales` only catches malformed syntax — it happily
  // accepts well-formed but unsupported tags like "qqq-Latn", which would
  // then silently fall back inside `Intl.NumberFormat`. Compare the
  // requested language subtag against what `NumberFormat` actually resolves
  // and reject the mismatch so the user sees a real error instead of a
  // setting that "saves" but does nothing.
  let canonical: string
  try {
    ;[canonical] = Intl.getCanonicalLocales(v)
  } catch {
    return {
      ok: false,
      error: "locale must be a valid BCP-47 tag (e.g. 'en-US', 'de-DE')",
    }
  }
  const resolved = new Intl.NumberFormat(canonical).resolvedOptions().locale
  const requestedLang = canonical.split("-")[0].toLowerCase()
  const resolvedLang = resolved.split("-")[0].toLowerCase()
  if (requestedLang !== resolvedLang) {
    return {
      ok: false,
      error: `locale '${canonical}' is not supported by the runtime (resolved to '${resolved}')`,
    }
  }
  return { ok: true, value: canonical }
}

export function validateSettingsPatch(
  body: unknown
): ValidationResult<SettingsPatchValidated> {
  if (!isObject(body)) return err("invalid body")
  const patch: SettingsPatchValidated = {}

  for (const key of NUMERIC_FIELDS) {
    const raw = body[key]
    if (raw === undefined) continue
    const n = asFiniteNumber(raw)
    if (n === null) return err(`${key} must be a finite number`)
    patch[key] = n
  }

  if (body.defaultEntryDay !== undefined) {
    if (
      typeof body.defaultEntryDay !== "string" ||
      !isValidEntryDayPref(body.defaultEntryDay)
    ) {
      return err("defaultEntryDay must be 'first', 'last', or a number 1–31")
    }
    patch.defaultEntryDay = body.defaultEntryDay
  }

  if (body.dividendBasis !== undefined) {
    const basis = asEnumValue<DividendBasis>(body.dividendBasis, DIVIDEND_BASES)
    if (basis === null) {
      return err("dividendBasis must be 'net' or 'gross'")
    }
    patch.dividendBasis = basis
  }

  if (body.locale !== undefined) {
    const loc = validateLocale(body.locale)
    if (!loc.ok) return err(loc.error)
    patch.locale = loc.value
  }

  if (Object.keys(patch).length === 0) return err("no changes")
  return ok(patch)
}
