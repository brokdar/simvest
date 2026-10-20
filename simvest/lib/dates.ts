export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

export function resolveEntryDay(
  pref: string,
  year: number,
  month: number
): number {
  const dim = daysInMonth(year, month)
  if (pref === "first") return 1
  if (pref === "last") return dim
  const n = parseInt(pref, 10)
  if (!Number.isFinite(n)) return dim
  return Math.min(Math.max(1, n), dim)
}

/**
 * App-wide date formats. There are exactly two visible ones:
 *
 *   fmtMonth(2026, 4)       → "Apr ’26"      (a month: entries, axes, labels)
 *   fmtDate("2026-04-30")   → "30 Apr 2026"  (a specific day)
 *
 * Month names are always the three-letter English abbreviations below —
 * the UI copy is English, so dates don't follow the *number* locale (which
 * only decides separators), and `Intl` en-GB's "Sept" can't sneak in.
 * The apostrophe is U+2019 (’), matching the year ticks on chart axes.
 *
 * `fmtMonthLong` ("April 2026") is for accessible names only (aria-label,
 * screen-reader text), where an abbreviated "Apr ’26" reads badly.
 */
export const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

const MONTH_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const

/** Two-digit year with a leading apostrophe: 2026 → "’26". */
export function fmtYearShort(year: number): string {
  return `’${String(year).slice(-2).padStart(2, "0")}`
}

/** Month + short year: (2026, 4) → "Apr ’26". `month` is 1-12. */
export function fmtMonth(year: number, month: number): string {
  return `${MONTH_SHORT[month - 1]} ${fmtYearShort(year)}`
}

/** Month key ("2026-04", or a longer ISO date) → "Apr ’26". Unparseable
 *  input is returned unchanged rather than rendering "undefined ’NaN". */
export function fmtMonthKey(key: string): string {
  const y = parseInt(key.slice(0, 4), 10)
  const m = parseInt(key.slice(5, 7), 10)
  if (!Number.isFinite(y) || !(m >= 1 && m <= 12)) return key
  return fmtMonth(y, m)
}

/** Full month + year for accessible names: (2026, 4) → "April 2026". */
export function fmtMonthLong(year: number, month: number): string {
  return `${MONTH_LONG[month - 1]} ${year}`
}

/** A specific day: "2026-04-30" or (2026, 4, 30) → "30 Apr 2026". */
export function fmtDate(iso: string): string
export function fmtDate(year: number, month: number, day: number): string
export function fmtDate(
  isoOrYear: string | number,
  month?: number,
  day?: number
): string {
  const parts =
    typeof isoOrYear === "string"
      ? fromISODate(isoOrYear)
      : { year: isoOrYear, month: month as number, day: day as number }
  return `${parts.day} ${MONTH_SHORT[parts.month - 1]} ${parts.year}`
}

export function toISODate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`
}

export function todayISO(): string {
  const d = new Date()
  return toISODate(d.getFullYear(), d.getMonth() + 1, d.getDate())
}

export function fromISODate(iso: string): {
  year: number
  month: number
  day: number
} {
  const [y, m, d] = iso.split("-").map((s) => parseInt(s, 10))
  return { year: y, month: m, day: d }
}

export function isValidEntryDayPref(pref: string): boolean {
  if (pref === "first" || pref === "last") return true
  const n = parseInt(pref, 10)
  return Number.isInteger(n) && n >= 1 && n <= 31 && String(n) === pref
}

export function addCalendarMonths(
  year: number,
  month: number,
  day: number,
  n: number
): { year: number; month: number; day: number } {
  const total0 = month - 1 + n
  const targetYear = year + Math.floor(total0 / 12)
  const targetMonth = (((total0 % 12) + 12) % 12) + 1
  const dim = daysInMonth(targetYear, targetMonth)
  return { year: targetYear, month: targetMonth, day: Math.min(day, dim) }
}

export function entryTimestamp(
  year: number,
  month: number,
  day: number
): number {
  return new Date(year, month - 1, day).getTime()
}
