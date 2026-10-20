"use client"

import { useSyncExternalStore } from "react"

const SSR_FALLBACK = "en-US"

function subscribe() {
  return () => {}
}

/**
 * Returns the browser's preferred locale (`navigator.language`), or
 * `SSR_FALLBACK` during server render. SSR-safe via `useSyncExternalStore` so
 * the server snapshot and the first client snapshot match — no hydration
 * mismatch.
 *
 * Most consumers want the higher-level `useResolvedLocale()` from
 * `@/components/use-resolved-locale`, which layers a user override
 * (`settings.locale`) on top of this. Reach for `useLocale` directly only
 * when you specifically need the browser preference.
 */
export function useLocale(): string {
  return useSyncExternalStore(
    subscribe,
    () => navigator.language || SSR_FALLBACK,
    () => SSR_FALLBACK
  )
}

type Separators = { group: string; decimal: string }

export function getSeparators(locale: string): Separators {
  const parts = new Intl.NumberFormat(locale).formatToParts(12345.6)
  return {
    group: parts.find((p) => p.type === "group")?.value ?? ",",
    decimal: parts.find((p) => p.type === "decimal")?.value ?? ".",
  }
}

export type ParseResult =
  | { ok: true; value: number }
  | {
      ok: false
      error: string
      /**
       * The value the user most likely meant, when the input was written in
       * the *other* number convention (e.g. `1234.56` in de-DE). The parser
       * never applies it — the UI may offer it as an explicit one-tap fix.
       */
      suggestion?: number
    }

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

type Reading = { value: number; fractionDigits: number; grouped: boolean }

/**
 * Read `s` strictly in one convention: optional sign, an integer part that is
 * either plain digits or correctly grouped in threes (`1.234.567`), then an
 * optional decimal part. Anything else — a group of two, a second decimal
 * separator — is not "written this way" and returns null.
 */
function readAs(s: string, sep: Separators): Reading | null {
  const g = escapeRe(sep.group)
  const d = escapeRe(sep.decimal)
  const m = s.match(
    new RegExp(`^(-?)(\\d+|[1-9]\\d{0,2}(?:${g}\\d{3})+)(?:${d}(\\d+))?$`)
  )
  if (!m) return null
  const grouped = m[2].includes(sep.group)
  const int = m[2].split(sep.group).join("")
  const value = Number(`${m[1]}${int}${m[3] ? `.${m[3]}` : ""}`)
  if (!Number.isFinite(value)) return null
  return { value, fractionDigits: m[3]?.length ?? 0, grouped }
}

/** The convention a user from "the other side" would type: dot ↔ comma. */
function otherConvention(sep: Separators): Separators {
  return sep.decimal === ","
    ? { group: ",", decimal: "." }
    : { group: ".", decimal: "," }
}

function separatorName(ch: string): string {
  if (ch === ",") return "comma"
  if (ch === ".") return "dot"
  return `“${ch}”`
}

function formatExact(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 20 }).format(n)
}

/**
 * Parse a typed amount in the user's number format. D1: this never guesses.
 *
 * - Input written correctly for `locale` parses (`1.234,56` / `1234,56` in
 *   de-DE, `1,234.56` / `1234.56` in en-US).
 * - Input that only makes sense in the other convention (`1234.56` or
 *   `1,234.56` in de-DE) is rejected with "Did you mean 1.234,56?" and that
 *   reading as `suggestion`.
 * - A lone separator followed by exactly three digits where the locale reads
 *   it as decimals (`1,234` in de-DE, `1.234` in en-US) is rejected as
 *   ambiguous — it's how the other convention writes thousands.
 */
export type ParseOpts = {
  allowEmpty?: boolean
  min?: number
  /**
   * Reject more decimals than this (money fields pass 2: cents). The
   * suggestion is the value rounded to that many places — shown, never
   * applied silently.
   */
  maxFractionDigits?: number
}

export function parseMoney(
  raw: string,
  locale: string,
  opts: ParseOpts = {}
): ParseResult {
  const { allowEmpty = true, min, maxFractionDigits } = opts

  const stripped = raw
    .replace(/[€$£¥₹\s]/g, "")
    .replace(/\u2212/g, "-")
    .trim()
  if (stripped === "") {
    if (allowEmpty) return { ok: true, value: 0 }
    return { ok: false, error: "Enter a value." }
  }

  const sep = getSeparators(locale)
  const other = otherConvention(sep)
  const own = readAs(stripped, sep)
  const alt = readAs(stripped, other)
  const decimalName = separatorName(sep.decimal)

  if (own === null && alt !== null) {
    return {
      ok: false,
      error: `Did you mean ${formatExact(alt.value, locale)}? In your number format, a ${decimalName} marks the decimals.`,
      suggestion: alt.value,
    }
  }

  if (own === null) {
    const example = new Intl.NumberFormat(locale).format(36855.97)
    return {
      ok: false,
      error: `Couldn't read "${raw}" as a number. Try ${example}.`,
    }
  }

  if (
    own.fractionDigits === 3 &&
    !own.grouped &&
    alt !== null &&
    alt.grouped &&
    alt.value !== own.value
  ) {
    return {
      ok: false,
      error: `Did you mean ${formatExact(alt.value, locale)}? “${raw.trim()}” could be thousands or decimals — in your number format, a ${decimalName} marks the decimals.`,
      suggestion: alt.value,
    }
  }

  if (
    maxFractionDigits !== undefined &&
    own.fractionDigits > maxFractionDigits
  ) {
    const f = 10 ** maxFractionDigits
    const rounded = Math.round(own.value * f) / f
    return {
      ok: false,
      error: `Did you mean ${formatMoney(rounded, locale, { decimals: maxFractionDigits })}? Amounts go to ${maxFractionDigits === 2 ? "the cent (two decimals)" : `${maxFractionDigits} decimals`}.`,
      suggestion: rounded,
    }
  }

  const n = own.value
  if (min !== undefined && n < min) {
    return { ok: false, error: `Must be ${min} or greater.` }
  }

  return { ok: true, value: n }
}

/**
 * Parse an additive money expression like `200 + 300 + 421,32` (only `+`
 * and `-` between numeric terms, no `*` / `/` / parentheses). When the input
 * contains no operator between terms, defers to `parseMoney` and behaves
 * identically.
 *
 * Locale-aware: each term is parsed by `parseMoney`, so the active locale's
 * group + decimal separators apply per term.
 */
export function parseMoneyExpression(
  raw: string,
  locale: string,
  opts: ParseOpts = {}
): ParseResult {
  const { allowEmpty = true, min, maxFractionDigits } = opts

  const stripped = raw.replace(/[€$£¥₹\s]/g, "")
  if (stripped === "") {
    if (allowEmpty) return { ok: true, value: 0 }
    return { ok: false, error: "Enter a value." }
  }

  // Detect operators that separate terms: any `+` or `-` past index 0 splits
  // the expression. A leading `+` / `-` is the first term's unary sign.
  let hasOperator = false
  for (let i = 1; i < stripped.length; i++) {
    if (stripped[i] === "+" || stripped[i] === "-") {
      hasOperator = true
      break
    }
  }
  if (!hasOperator) return parseMoney(raw, locale, opts)

  const terms: string[] = []
  let buf = ""
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i]
    if (i > 0 && (ch === "+" || ch === "-")) {
      // Only split if buf already contains at least one digit; otherwise
      // the operator is attaching to a leading sign like `--50` → `-50`.
      if (/\d/.test(buf)) {
        terms.push(buf)
        buf = ch
        continue
      }
    }
    buf += ch
  }
  if (buf) terms.push(buf)

  let sum = 0
  for (const term of terms) {
    // Strip leading sign(s) from the term so the remainder is a plain
    // unsigned number `parseMoney` accepts. Fold consecutive signs:
    // an even number of minuses ⇒ +, odd ⇒ −.
    let sign = 1
    let body = term
    while (body.length > 0 && (body[0] === "+" || body[0] === "-")) {
      if (body[0] === "-") sign = -sign
      body = body.slice(1)
    }
    if (body === "") return { ok: false, error: "Incomplete expression." }
    const r = parseMoney(body, locale, { allowEmpty: false, maxFractionDigits })
    // Name the offending term; a suggestion for one term isn't a value for
    // the whole field, so it's dropped.
    if (!r.ok) return { ok: false, error: `“${body}”: ${r.error}` }
    sum += sign * r.value
  }

  if (min !== undefined && sum < min) {
    return { ok: false, error: `Must be ${min} or greater.` }
  }
  return { ok: true, value: sum }
}

export function formatMoney(
  n: number,
  locale: string,
  opts: { decimals?: number } = {}
): string {
  const { decimals = 2 } = opts
  return n.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
