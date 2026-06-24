export type FmtEurOpts = {
  decimals?: number
  compact?: boolean
  sign?: boolean
}

// `Intl.NumberFormat` construction is surprisingly expensive (tens of µs per
// instance on cold paths) and these formatters run dozens of times per render
// across KPI tiles, charts and tooltips. The cache is keyed by
// `${locale}:${decimals}` so switching locale at runtime stays fast after
// the first warm-up render.
//
// Locale precedence at runtime:
//   1. The `LocaleSync` client component (mounted inside DataProvider) calls
//      `setActiveLocale(resolved)` synchronously during render. The resolved
//      locale flows from `useResolvedLocale()` (settings.locale → browser →
//      "en-US"). All `fmtEUR / fmtPct / fmtNum` callers in the React tree
//      pick this up automatically without threading `locale` as a prop.
//   2. Server-side renders (RSCs that import this module before any client
//      mount) see `DEFAULT_LOCALE` — kept at "en-US" to match the
//      `useSyncExternalStore` SSR fallback in `lib/locale.ts`. The client
//      re-renders with the resolved locale after hydration; no SSR/CSR
//      money-text mismatch because both start from the same fallback.
//   3. Direct callers can override per-call via the optional `locale` arg.
const DEFAULT_LOCALE = "en-US"
let activeLocale = DEFAULT_LOCALE
const numberFormatters = new Map<string, Intl.NumberFormat>()
const compactMillionFormatters = new Map<string, Intl.NumberFormat>()
const compactThousandFormatters = new Map<string, Intl.NumberFormat>()

/**
 * Synchronizes the locale used by the default `fmtEUR / fmtPct / fmtNum`
 * exports with the user's resolved locale. Called by `<LocaleSync>` during
 * render — do not call from app code; mount `<LocaleSync>` instead.
 */
export function setActiveLocale(locale: string): void {
  if (locale && locale !== activeLocale) {
    activeLocale = locale
  }
}

export function getActiveLocale(): string {
  return activeLocale
}

function getNumberFormatter(
  locale: string,
  decimals: number
): Intl.NumberFormat {
  const key = `${locale}:${decimals}`
  let f = numberFormatters.get(key)
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    numberFormatters.set(key, f)
  }
  return f
}

function getCompactMillionFormatter(locale: string): Intl.NumberFormat {
  let f = compactMillionFormatters.get(locale)
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })
    compactMillionFormatters.set(locale, f)
  }
  return f
}

function getCompactThousandFormatter(locale: string): Intl.NumberFormat {
  let f = compactThousandFormatters.get(locale)
  if (!f) {
    f = new Intl.NumberFormat(locale, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
    compactThousandFormatters.set(locale, f)
  }
  return f
}

export const fmtEUR = (
  v: number | null | undefined,
  opts: FmtEurOpts = {},
  locale: string = activeLocale
): string => {
  const { compact = false, sign = false } = opts
  // Money is shown with cents by default. Compact mode (axis ticks, brief
  // labels) drops cents because "€1.5M,00" is absurd.
  const decimals = opts.decimals ?? (compact ? 0 : 2)
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  const abs = Math.abs(v)
  let str: string
  if (compact && abs >= 1_000_000) {
    str = getCompactMillionFormatter(locale).format(v / 1_000_000) + "M"
  } else if (compact && abs >= 10_000) {
    str = getCompactThousandFormatter(locale).format(Math.round(v / 1000)) + "k"
  } else {
    str = getNumberFormatter(locale, decimals).format(v)
  }
  const prefix = sign && v > 0 ? "+" : ""
  return `${prefix}€${str}`
}

export const fmtPct = (
  v: number | null | undefined,
  decimals = 1,
  sign = false,
  locale: string = activeLocale
): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  const s = getNumberFormatter(locale, decimals).format(v)
  const prefix = sign && v > 0 ? "+" : ""
  return `${prefix}${s}%`
}

export const fmtNum = (
  v: number | null | undefined,
  decimals = 0,
  locale: string = activeLocale
): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  return getNumberFormatter(locale, decimals).format(v)
}
