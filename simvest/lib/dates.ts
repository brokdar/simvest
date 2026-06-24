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

export function formatEntryDate(
  year: number,
  month: number,
  day: number
): string {
  return new Date(year, month - 1, day).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
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
