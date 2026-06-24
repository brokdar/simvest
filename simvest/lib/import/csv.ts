/**
 * Minimal RFC 4180-ish CSV parser. Handles quoted fields, escaped quotes
 * (`""`), embedded delimiters and newlines inside quoted fields, and CRLF
 * line endings. The delimiter defaults to `,`; pass `";"` for the
 * semicolon-separated exports some European brokers (e.g. Bondora) produce.
 * A leading UTF-8 BOM is stripped so the first header cell parses cleanly.
 */
export function parseCsv(text: string, delimiter = ","): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let inQuotes = false
  let i = 0

  // Strip a leading UTF-8 BOM — otherwise it prefixes the first header cell
  // ("﻿Date") and breaks header matching.
  if (text.charCodeAt(0) === 0xfeff) i = 1

  while (i < text.length) {
    const ch = text[i]
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i++
      continue
    }
    if (ch === delimiter) {
      row.push(field)
      field = ""
      i++
      continue
    }
    if (ch === "\n") {
      row.push(field)
      rows.push(row)
      row = []
      field = ""
      i++
      continue
    }
    if (ch === "\r") {
      i++
      continue
    }
    field += ch
    i++
  }

  // Tail: flush the last field/row unless the file is empty.
  if (field !== "" || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

export function csvToObjects(
  text: string,
  delimiter = ","
): Record<string, string>[] {
  const rows = parseCsv(text, delimiter)
  if (rows.length === 0) return []
  const headers = rows[0]
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {}
    for (let i = 0; i < headers.length; i++) {
      obj[headers[i]] = r[i] ?? ""
    }
    return obj
  })
}
