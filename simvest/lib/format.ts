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
  if (compact) return fmtCompactEUR(v, { sign }, locale)
  // Money is shown with cents by default.
  const decimals = opts.decimals ?? 2
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  const body = getNumberFormatter(locale, decimals).format(Math.abs(v))
  return `${signFor(v, body, sign)}€${body}`
}

/**
 * The sign that leads a money figure: the minus goes *before* the currency
 * symbol ("-€17.242,71"), where Intl's currency style puts it, never between
 * the symbol and the digits ("€-17.242,71"). `body` is the already formatted
 * magnitude, so a value that rounds to zero ("0,00") never gets a sign.
 */
function signFor(v: number, body: string, plusForPositive: boolean): string {
  if (!/[1-9]/.test(body)) return ""
  if (v < 0) return "-"
  return plusForPositive && v > 0 ? "+" : ""
}

/**
 * The single abbreviation rule for a *standalone* money figure (KPI subline,
 * pill, legend): below €10.000 the full amount without cents, from €10.000
 * whole thousands with "k", from €1.000.000 one-decimal millions with "M".
 *
 * Never use this per tick on a chart axis — two ticks either side of the
 * €10k threshold would come out as "€8.000" and "€12k" on the same axis.
 * Axes use `fmtAxisEUR`, which picks one unit for the whole axis.
 */
export const fmtCompactEUR = (
  v: number | null | undefined,
  opts: { sign?: boolean } = {},
  locale: string = activeLocale
): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  const abs = Math.abs(v)
  let str: string
  if (abs >= 1_000_000) {
    str = getCompactMillionFormatter(locale).format(abs / 1_000_000) + "M"
  } else if (abs >= 10_000) {
    str =
      getCompactThousandFormatter(locale).format(Math.round(abs / 1000)) + "k"
  } else {
    str = getNumberFormatter(locale, 0).format(abs)
  }
  return `${signFor(v, str, opts.sign ?? false)}€${str}`
}

/**
 * Build the tick formatter for one money axis. The unit is chosen once from
 * the largest tick, using the same thresholds as `fmtCompactEUR`, and then
 * applied to *every* tick — so an axis is all-full (`€2.000 … €8.000`),
 * all-thousands (`€4k … €16k`) or all-millions (`€0,5M … €2,0M`), never mixed.
 * Decimals are the fewest that render every tick exactly: full euros use 0
 * or 2 (cents), thousands 0 or 1, millions 1 or 2 (at least one, matching
 * `fmtCompactEUR`). Zero is always plain `€0`.
 */
export function fmtAxisEUR(
  ticks: readonly number[],
  opts: { sign?: boolean } = {},
  locale: string = activeLocale
): (v: number) => string {
  const finite = ticks.filter((t) => Number.isFinite(t))
  const maxAbs = finite.reduce((m, t) => Math.max(m, Math.abs(t)), 0)
  const [divisor, suffix, decimalSteps] =
    maxAbs >= 1_000_000
      ? [1_000_000, "M", [1, 2]]
      : maxAbs >= 10_000
        ? [1000, "k", [0, 1]]
        : // Full euros: whole amounts, or cents — never a lone "€2,5".
          [1, "", [0, 2]]
  const exactAt = (d: number) =>
    finite.every((t) => {
      const scaled = (t / divisor) * 10 ** d
      return Math.abs(scaled - Math.round(scaled)) <= 1e-6
    })
  const decimals = decimalSteps.find(exactAt) ?? decimalSteps.at(-1)!
  const nf = getNumberFormatter(locale, decimals)
  return (v: number) => {
    if (!Number.isFinite(v)) return "—"
    if (v === 0) return "€0"
    const body = nf.format(Math.abs(v) / divisor)
    return `${signFor(v, body, opts.sign ?? false)}€${body}${suffix}`
  }
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

/**
 * A percentage that can't blow out its container: anything beyond ±`cap`
 * renders as "> 999%" / "< −999%". For rates like CAGR where a short or
 * odd history can produce absurd magnitudes (N6).
 */
export const fmtPctCapped = (
  v: number | null | undefined,
  decimals = 1,
  cap = 999,
  locale: string = activeLocale
): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  if (v > cap) return `> ${fmtPct(cap, 0, false, locale)}`
  if (v < -cap) return `< ${fmtPct(-cap, 0, false, locale)}`
  return fmtPct(v, decimals, false, locale)
}

export const fmtNum = (
  v: number | null | undefined,
  decimals = 0,
  locale: string = activeLocale
): string => {
  if (v === null || v === undefined || Number.isNaN(v)) return "—"
  return getNumberFormatter(locale, decimals).format(v)
}

/**
 * Pick the singular or plural noun for a count: `plural(1, "entry",
 * "entries")` → "entry". Returns the noun only; use `fmtCount` when the
 * number should be rendered too.
 */
export function plural(n: number, singular: string, pluralForm: string) {
  return n === 1 ? singular : pluralForm
}

/** `fmtCount(1, "record", "records")` → "1 record"; 1264 → "1.264 records". */
export function fmtCount(
  n: number,
  singular: string,
  pluralForm: string,
  locale: string = activeLocale
): string {
  return `${fmtNum(n, 0, locale)} ${plural(n, singular, pluralForm)}`
}

export type SliderUnit = "percent" | "years" | "money"

/**
 * A slider's readout, formatted for what it measures: "2,4%" (one decimal),
 * "20 years" (whole, pluralised), "€1.250" (money, no cents — sliders move
 * in whole steps). Never "20,0 years" or "€1.250,0".
 */
export function fmtSliderValue(
  v: number,
  unit: SliderUnit,
  locale: string = activeLocale
): string {
  switch (unit) {
    case "percent":
      return fmtPct(v, 1, false, locale)
    case "years": {
      const n = Math.round(v)
      return `${fmtNum(n, 0, locale)} ${plural(n, "year", "years")}`
    }
    case "money":
      return fmtEUR(v, { decimals: 0 }, locale)
  }
}

/**
 * Snap a slider value onto its step grid and strip binary floating-point
 * noise, so `4.900000095367432` comes out as `4.9`. Apply it to what a range
 * input emits *and* to what is displayed/stored. `origin` is the grid's
 * anchor (the slider's `min`).
 */
export function snapToStep(v: number, step: number, origin = 0): number {
  if (!Number.isFinite(v) || !(step > 0)) return v
  const snapped = Math.round((v - origin) / step) * step + origin
  const decimals = Math.max(decimalPlaces(step), decimalPlaces(origin))
  return Number(snapped.toFixed(decimals))
}

function decimalPlaces(n: number): number {
  if (!Number.isFinite(n) || Number.isInteger(n)) return 0
  const s = String(n)
  const e = s.match(/e-(\d+)$/)
  if (e) return parseInt(e[1], 10)
  return s.split(".")[1]?.length ?? 0
}
