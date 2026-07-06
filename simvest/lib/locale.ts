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
  | { ok: false; error: string }

export function parseMoney(
  raw: string,
  locale: string,
  opts: { allowEmpty?: boolean; min?: number } = {}
): ParseResult {
  const { allowEmpty = true, min } = opts

  const stripped = raw.replace(/[€$£¥₹\s]/g, "").trim()
  if (stripped === "") {
    if (allowEmpty) return { ok: true, value: 0 }
    return { ok: false, error: "Enter a value." }
  }

  const { group, decimal } = getSeparators(locale)
  // Strip group separators, then convert decimal separator to '.'
  const normalized = stripped.split(group).join("").replace(decimal, ".")

  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    const example = new Intl.NumberFormat(locale).format(36855.97)
    return {
      ok: false,
      error: `Couldn't read "${raw}" as a number. Try ${example}.`,
    }
  }

  const n = Number(normalized)
  if (!Number.isFinite(n)) {
    return { ok: false, error: "Number out of range." }
  }

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
  opts: { allowEmpty?: boolean; min?: number } = {}
): ParseResult {
  const { allowEmpty = true, min } = opts

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
    const r = parseMoney(body, locale, { allowEmpty: false })
    if (!r.ok) return r
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
