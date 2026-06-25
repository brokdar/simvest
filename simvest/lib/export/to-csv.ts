import { round2 } from "@/lib/calc"

/**
 * One CSV column: a header label and an accessor that pulls the cell value off
 * a row. Numbers are rounded to cents and stringified; null/undefined become an
 * empty field.
 */
export type CsvColumn<T> = {
  header: string
  value: (row: T) => string | number | null | undefined
}

function escapeField(raw: string | number | null | undefined): string {
  if (raw == null) return ""
  const s = typeof raw === "number" ? String(round2(raw)) : raw
  // RFC-4180: wrap in double quotes and double interior quotes when the field
  // contains a comma, a quote, or a line break.
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

/**
 * Serialize `rows` to an RFC-4180-ish CSV string with a leading header row.
 * Always returns at least the header line (header-only for an empty table).
 * Uses `\n` line endings.
 */
export function toCsv<T>(columns: CsvColumn<T>[], rows: T[]): string {
  const header = columns.map((c) => escapeField(c.header)).join(",")
  const body = rows.map((row) =>
    columns.map((c) => escapeField(c.value(row))).join(",")
  )
  return [header, ...body].join("\n")
}

/**
 * Trigger a client-side download of `csv` as `filename`. No-op outside the
 * browser (e.g. during SSR or unit tests).
 */
export function downloadCsv(filename: string, csv: string): void {
  if (typeof document === "undefined") return
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
