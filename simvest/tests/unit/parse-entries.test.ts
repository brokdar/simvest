import { describe, it, expect } from "vitest"
import {
  detectFormat,
  detectMapping,
  parseEntries,
  splitRows,
  type ColumnMapping,
  type ParseContext,
} from "@/lib/parse-entries"
import type { EntryDTO } from "@/lib/types"
import { labelFor } from "@/lib/types"

function ctx(
  existing: EntryDTO[] = [],
  override: Partial<ParseContext> = {}
): ParseContext {
  const m = new Map<string, EntryDTO>()
  for (const e of existing) m.set(`${e.year}-${e.month}`, e)
  return {
    existingByMonth: m,
    todayYear: 2026,
    todayMonth: 5,
    defaultDay: () => 28,
    defaultInvested: 0,
    ...override,
  }
}

function makeEntry(
  year: number,
  month: number,
  value: number | null,
  extra: Partial<EntryDTO> = {}
): EntryDTO {
  return {
    id: year * 100 + month,
    year,
    month,
    day: 1,
    label: labelFor(year, month),
    invested: 0,
    value,
    note: "",
    ...extra,
  }
}

const FULL_MAPPING: ColumnMapping = {
  date: 0,
  invested: 1,
  value: 2,
  note: 3,
}

const NO_NOTE_MAPPING: ColumnMapping = {
  date: 0,
  invested: 1,
  value: 2,
  note: null,
}

// date + value only (invested + note absent)
const DATE_VALUE_MAPPING: ColumnMapping = {
  date: 0,
  invested: null,
  value: 1,
  note: null,
}

const hintsDE = {
  numberLocale: "de-DE",
  dateFormat: "DMY-dot" as const,
  hasHeader: false,
}

// ---------------------------------------------------------------------------
// splitRows
// ---------------------------------------------------------------------------

describe("splitRows", () => {
  it("UNIT-PARSE-001 — tabs are preferred over semicolons and commas", () => {
    const rows = splitRows("a\tb\tc\nd\te\tf")
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
    ])
  })

  it("UNIT-PARSE-002 — semicolons used when no tabs present", () => {
    const rows = splitRows("a;b;c\nd;e;f")
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
    ])
  })

  it("UNIT-PARSE-003 — commas used when no tabs or semicolons", () => {
    const rows = splitRows("a,b,c\nd,e,f")
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["d", "e", "f"],
    ])
  })

  it("UNIT-PARSE-004 — strips carriage returns and skips empty lines", () => {
    const rows = splitRows("a\tb\r\n\r\nc\td")
    expect(rows).toEqual([
      ["a", "b"],
      ["c", "d"],
    ])
  })

  it("UNIT-PARSE-005 — trims whitespace from cells", () => {
    const rows = splitRows("  a  \t  b  \n c \t d ")
    expect(rows).toEqual([
      ["a", "b"],
      ["c", "d"],
    ])
  })
})

// ---------------------------------------------------------------------------
// detectFormat
// ---------------------------------------------------------------------------

describe("detectFormat", () => {
  it("UNIT-PARSE-010 — German tab-separated: de-DE + DMY-dot", () => {
    const text = "01.03.2026\t250,00\t12.840,55"
    const hints = detectFormat(text, "de-DE")
    expect(hints.numberLocale).toBe("de-DE")
    expect(hints.dateFormat).toBe("DMY-dot")
    expect(hints.hasHeader).toBe(false)
  })

  it("UNIT-PARSE-011 — English comma-separated ISO: en-US + ISO-ym", () => {
    const text = "2024-03,250.00,12840.55"
    const hints = detectFormat(text, "en-US")
    expect(hints.numberLocale).toBe("en-US")
    expect(hints.dateFormat).toBe("ISO-ym")
    expect(hints.hasHeader).toBe(false)
  })

  it("UNIT-PARSE-012 — header sniff: first row is German headers", () => {
    const text =
      "Datum\tEingezahlt\tDepotwert\tNotiz\n01.03.2026\t250,00\t12.840,55\tbonus"
    const hints = detectFormat(text, "de-DE")
    expect(hints.hasHeader).toBe(true)
    expect(hints.dateFormat).toBe("DMY-dot")
    expect(hints.numberLocale).toBe("de-DE")
  })

  it("UNIT-PARSE-013 — header sniff: first row starts with a date", () => {
    const text = "01.03.2026\t250,00\t12.840,55"
    const hints = detectFormat(text, "de-DE")
    expect(hints.hasHeader).toBe(false)
  })

  it("UNIT-PARSE-014 — DMY-slash detected from 03/05/2026", () => {
    const text = "03/05/2026,250.00,12840.55"
    const hints = detectFormat(text, "en-US")
    expect(hints.dateFormat).toBe("DMY-slash")
  })

  it("UNIT-PARSE-015 — MY-slash detected from 03/2026", () => {
    const text = "03/2026,250.00,12840.55"
    const hints = detectFormat(text, "en-US")
    expect(hints.dateFormat).toBe("MY-slash")
  })
})

// ---------------------------------------------------------------------------
// detectMapping
// ---------------------------------------------------------------------------

describe("detectMapping", () => {
  it("UNIT-PARSE-020 — German headers auto-map correctly", () => {
    const res = detectMapping(
      ["Datum", "Eingezahlt", "Depotwert", "Notiz"],
      true,
      4
    )
    expect(res.mapping).toEqual({ date: 0, invested: 1, value: 2, note: 3 })
    expect(res.structuralErrors).toEqual([])
  })

  it("UNIT-PARSE-021 — English headers auto-map correctly", () => {
    const res = detectMapping(["Date", "Invested", "Value", "Note"], true, 4)
    expect(res.mapping).toEqual({ date: 0, invested: 1, value: 2, note: 3 })
    expect(res.structuralErrors).toEqual([])
  })

  it("UNIT-PARSE-022 — non-standard order (date anywhere) is respected via synonyms", () => {
    const res = detectMapping(
      ["Notiz", "Depotwert", "Datum", "Eingezahlt"],
      true,
      4
    )
    expect(res.mapping).toEqual({ date: 2, invested: 3, value: 1, note: 0 })
    expect(res.structuralErrors).toEqual([])
  })

  it("UNIT-PARSE-023 — missing header row falls back to positional", () => {
    const res = detectMapping([], false, 4)
    expect(res.mapping).toEqual({ date: 0, invested: 1, value: 2, note: 3 })
    expect(res.structuralErrors).toEqual([])
  })

  it("UNIT-PARSE-024 — 3-column data has note: null", () => {
    const res = detectMapping([], false, 3)
    expect(res.mapping).toEqual({ date: 0, invested: 1, value: 2, note: null })
  })

  it("UNIT-PARSE-025 — header with only date + value leaves invested/note absent", () => {
    const res = detectMapping(["Date", "Value"], true, 2)
    expect(res.mapping).toEqual({
      date: 0,
      invested: null,
      value: 1,
      note: null,
    })
    expect(res.structuralErrors).toEqual([])
  })

  it("UNIT-PARSE-026 — an unrecognized header column is a structural error naming it", () => {
    const res = detectMapping(["Date", "Foobar", "Value"], true, 3)
    expect(res.structuralErrors).toHaveLength(1)
    expect(res.structuralErrors[0].column).toBe(1)
    expect(res.structuralErrors[0].header).toBe("Foobar")
    expect(res.structuralErrors[0].text).toContain("Unrecognized")
  })

  it("UNIT-PARSE-027 — a header with no date column is a structural error", () => {
    const res = detectMapping(["Invested", "Value"], true, 2)
    expect(res.structuralErrors).toHaveLength(1)
    expect(res.structuralErrors[0].column).toBe(null)
    expect(res.structuralErrors[0].text).toContain("No date column")
  })
})

// ---------------------------------------------------------------------------
// parseEntries — status rules
// ---------------------------------------------------------------------------

describe("parseEntries — row status rules", () => {
  it("UNIT-PARSE-100 — happy-path new row → status 'new', action 'apply'", () => {
    const text = "01.03.2026\t250,00\t12.840,55\t"
    const rows = parseEntries(text, hintsDE, FULL_MAPPING, ctx())
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("new")
    expect(rows[0].action).toBe("apply")
    expect(rows[0].parsed).toEqual({
      year: 2026,
      month: 3,
      day: 1,
      invested: 250,
      value: 12840.55,
      note: "",
    })
  })

  it("UNIT-PARSE-101 — error/date: unparseable date blocks the row", () => {
    const text = "0X.03.2026\t250,00\t12.840,55\t"
    const rows = parseEntries(text, hintsDE, FULL_MAPPING, ctx())
    expect(rows[0].status).toBe("error")
    expect(rows[0].action).toBe("skip")
    expect(rows[0].parsed).toBe(null)
    expect(rows[0].messages.some((m) => m.field === "date")).toBe(true)
    expect(rows[0].messages[0].text).toContain("DD.MM.YYYY")
  })

  it("UNIT-PARSE-102 — error/number: unparseable invested blocks the row", () => {
    const text = "01.03.2026\t1.2A,56\t12.840,55\t"
    const rows = parseEntries(text, hintsDE, FULL_MAPPING, ctx())
    expect(rows[0].status).toBe("error")
    expect(rows[0].messages.some((m) => m.field === "invested")).toBe(true)
  })

  it("UNIT-PARSE-103 — error/range: year before 1970 → error", () => {
    const text = "01.03.1899\t250,00\t12.840,55\t"
    const rows = parseEntries(text, hintsDE, FULL_MAPPING, ctx())
    expect(rows[0].status).toBe("error")
    expect(rows[0].messages.some((m) => m.text.includes("1899"))).toBe(true)
  })

  it("UNIT-PARSE-104 — error/duplicate: two rows with same (year, month)", () => {
    const text = "01.03.2026\t250,00\t12.840,55\n02.03.2026\t260,00\t12.900,00"
    const rows = parseEntries(text, hintsDE, NO_NOTE_MAPPING, ctx())
    expect(rows[0].status).toBe("new")
    expect(rows[1].status).toBe("error")
    expect(rows[1].messages.some((m) => m.text.includes("duplicate"))).toBe(
      true
    )
  })

  it("UNIT-PARSE-105 — existing month → status 'update', action 'apply', existingEntryId set", () => {
    const existing = [makeEntry(2024, 4, 10000)]
    const text = "01.04.2024\t250,00\t12.840,55"
    const rows = parseEntries(text, hintsDE, NO_NOTE_MAPPING, ctx(existing))
    expect(rows[0].status).toBe("update")
    expect(rows[0].action).toBe("apply")
    expect(rows[0].existingEntryId).toBe(existing[0].id)
    expect(rows[0].parsed?.invested).toBe(250)
    expect(rows[0].parsed?.value).toBe(12840.55)
  })

  it("UNIT-PARSE-106 — warning/value-below-invested surfaces but stays 'new'", () => {
    const text = "01.03.2026\t2000,00\t500,00"
    const rows = parseEntries(text, hintsDE, NO_NOTE_MAPPING, ctx())
    expect(rows[0].status).toBe("new")
    expect(rows[0].action).toBe("apply")
    expect(
      rows[0].messages.some((m) => m.text.toLowerCase().includes("below"))
    ).toBe(true)
  })

  it("UNIT-PARSE-107 — warning/future: a future month is warned but stays 'new'", () => {
    const text = "01.09.2027\t250,00\t13000,00"
    const rows = parseEntries(text, hintsDE, NO_NOTE_MAPPING, ctx())
    expect(rows[0].status).toBe("new")
    expect(rows[0].messages.some((m) => m.text.includes("future"))).toBe(true)
  })

  it("UNIT-PARSE-108 — warning/jump: 7× value change vs previous row", () => {
    const text = "01.01.2024\t250,00\t10000,00\n01.02.2024\t250,00\t80000,00"
    const rows = parseEntries(text, hintsDE, NO_NOTE_MAPPING, ctx())
    expect(rows[0].status).toBe("new")
    expect(rows[1].status).toBe("new")
    expect(rows[1].messages.some((m) => m.text.includes("jumped"))).toBe(true)
  })

  it("UNIT-PARSE-109 — warning/clamped: 31.02 → uses 28.02 in 2025", () => {
    const text = "31.02.2025\t250,00\t13000,00"
    const rows = parseEntries(text, hintsDE, NO_NOTE_MAPPING, ctx())
    expect(rows[0].parsed?.day).toBe(28)
    expect(rows[0].messages.some((m) => m.text.includes("doesn't exist"))).toBe(
      true
    )
  })

  it("UNIT-PARSE-110 — warning/empty: row of all-whitespace cells is skipped", () => {
    const text = "\t\t\t"
    const rows = parseEntries(text, hintsDE, NO_NOTE_MAPPING, ctx())
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("warning")
    expect(rows[0].action).toBe("skip")
    expect(rows[0].parsed).toBe(null)
  })

  it("UNIT-PARSE-111 — error and valid rows coexist in one paste", () => {
    const text = "01.03.2026\t250,00\t12000,00\n0X.04.2026\t250,00\t12100,00"
    const rows = parseEntries(text, hintsDE, NO_NOTE_MAPPING, ctx())
    expect(rows[0].status).toBe("new")
    expect(rows[1].status).toBe("error")
  })
})

// ---------------------------------------------------------------------------
// parseEntries — missing-value rules
// ---------------------------------------------------------------------------

describe("parseEntries — missing-value rules", () => {
  it("UNIT-PARSE-120 — invested declared + blank + NEW → portfolio default", () => {
    const text = "01.03.2026\t\t12.000,00\t"
    const rows = parseEntries(
      text,
      hintsDE,
      FULL_MAPPING,
      ctx([], { defaultInvested: 250 })
    )
    expect(rows[0].parsed?.invested).toBe(250)
  })

  it("UNIT-PARSE-121 — invested declared + blank + EXISTING → stored invested", () => {
    const existing = [makeEntry(2024, 4, 5000, { invested: 999 })]
    const text = "01.04.2024\t\t6000,00\t"
    const rows = parseEntries(
      text,
      hintsDE,
      FULL_MAPPING,
      ctx(existing, { defaultInvested: 250 })
    )
    expect(rows[0].parsed?.invested).toBe(999)
  })

  it("UNIT-PARSE-122 — invested column absent + NEW → 0", () => {
    const text = "01.03.2026\t12.000,00"
    const rows = parseEntries(
      text,
      hintsDE,
      DATE_VALUE_MAPPING,
      ctx([], { defaultInvested: 250 })
    )
    expect(rows[0].parsed?.invested).toBe(0)
  })

  it("UNIT-PARSE-123 — value declared + blank + NEW → null", () => {
    const text = "01.03.2026\t250,00\t\t"
    const rows = parseEntries(text, hintsDE, FULL_MAPPING, ctx())
    expect(rows[0].parsed?.value).toBe(null)
  })

  it("UNIT-PARSE-124 — value declared + blank + EXISTING → stored value", () => {
    const existing = [makeEntry(2024, 4, 5000)]
    const text = "01.04.2024\t300,00\t\t"
    const rows = parseEntries(text, hintsDE, FULL_MAPPING, ctx(existing))
    expect(rows[0].parsed?.value).toBe(5000)
  })

  it("UNIT-PARSE-125 — value column absent + NEW → null", () => {
    const text = "01.03.2026\t250,00"
    const rows = parseEntries(text, hintsDE, NO_NOTE_MAPPING, ctx())
    expect(rows[0].parsed?.value).toBe(null)
  })

  it("UNIT-PARSE-126 — note declared + blank + NEW → ''", () => {
    const text = "01.03.2026\t250,00\t12.000,00\t"
    const rows = parseEntries(text, hintsDE, FULL_MAPPING, ctx())
    expect(rows[0].parsed?.note).toBe("")
  })

  it("UNIT-PARSE-127 — note declared + blank + EXISTING → stored note", () => {
    const existing = [makeEntry(2024, 4, 5000, { note: "keepme" })]
    const text = "01.04.2024\t300,00\t6000,00\t"
    const rows = parseEntries(text, hintsDE, FULL_MAPPING, ctx(existing))
    expect(rows[0].parsed?.note).toBe("keepme")
  })
})

// ---------------------------------------------------------------------------
// parseEntries — merge semantics + day handling
// ---------------------------------------------------------------------------

describe("parseEntries — merge semantics and day handling", () => {
  it("UNIT-PARSE-140 — existing month: only declared, non-blank columns overwrite", () => {
    const existing = [
      makeEntry(2024, 4, 5000, { invested: 222, note: "orig", day: 9 }),
    ]
    const text = "04.2024\t9999,00"
    const rows = parseEntries(text, hintsDE, DATE_VALUE_MAPPING, ctx(existing))
    expect(rows[0].status).toBe("update")
    expect(rows[0].parsed).toEqual({
      year: 2024,
      month: 4,
      day: 9, // month-only date keeps the stored day
      invested: 222, // invested column absent → stored value
      value: 9999, // declared, non-blank → overwritten
      note: "orig", // note column absent → stored value
    })
  })

  it("UNIT-PARSE-141 — month-only date on a NEW month uses defaultDay", () => {
    const rows = parseEntries(
      "03.2026\t250,00\t12000,00",
      hintsDE,
      NO_NOTE_MAPPING,
      ctx([], { defaultDay: () => 15 })
    )
    expect(rows[0].parsed).toMatchObject({ year: 2026, month: 3, day: 15 })
  })

  it("UNIT-PARSE-142 — explicit day overwrites an existing entry's stored day", () => {
    const existing = [makeEntry(2024, 4, 5000, { day: 9 })]
    const text = "15.04.2024\t300,00\t6000,00"
    const rows = parseEntries(text, hintsDE, NO_NOTE_MAPPING, ctx(existing))
    expect(rows[0].parsed?.day).toBe(15)
  })
})

// ---------------------------------------------------------------------------
// parseMoney reuse (locale mismatch surfaces as error/number)
// ---------------------------------------------------------------------------

describe("parseEntries — locale interaction", () => {
  it("UNIT-PARSE-200 — '1.234,56' under de-DE parses to 1234.56", () => {
    const text = "01.03.2026\t250,00\t1.234,56"
    const rows = parseEntries(
      text,
      { numberLocale: "de-DE", dateFormat: "DMY-dot", hasHeader: false },
      NO_NOTE_MAPPING,
      ctx()
    )
    expect(rows[0].parsed?.value).toBe(1234.56)
  })

  it("UNIT-PARSE-201 — '1,234.56' under en-US parses to 1234.56 (mirror of the de-DE case)", () => {
    const text = "01.03.2026\t250.00\t1,234.56"
    const rows = parseEntries(
      text,
      { numberLocale: "en-US", dateFormat: "DMY-dot", hasHeader: false },
      NO_NOTE_MAPPING,
      ctx()
    )
    expect(rows[0].parsed?.value).toBe(1234.56)
  })
})

// ---------------------------------------------------------------------------
// parseEntries — additive expressions in numeric cells (multiple deposits in
// one month, e.g. "125+75+225+75+300"). Mirrors the inline-grid MoneyInput,
// which already accepts these.
// ---------------------------------------------------------------------------

describe("parseEntries — additive expressions", () => {
  it("UNIT-PARSE-210 — sums an invested expression (the user's scalable.CSV row)", () => {
    const text = "28.02.2021\t125+75+225+75+300\t1022,84"
    const rows = parseEntries(text, hintsDE, NO_NOTE_MAPPING, ctx())
    expect(rows[0].status).toBe("new")
    expect(rows[0].parsed?.invested).toBe(800)
    expect(rows[0].parsed?.value).toBeCloseTo(1022.84, 5)
  })

  it("UNIT-PARSE-211 — sums an expression with de-DE decimals in a term", () => {
    const text = "30.04.2021\t500+500+10000,50\t13986,90"
    const rows = parseEntries(text, hintsDE, NO_NOTE_MAPPING, ctx())
    expect(rows[0].parsed?.invested).toBeCloseTo(11000.5, 5)
  })

  it("UNIT-PARSE-212 — expression also works in the value column", () => {
    const text = "31.05.2026\t1100+1000\t100000+46247,51"
    const rows = parseEntries(text, hintsDE, NO_NOTE_MAPPING, ctx())
    expect(rows[0].parsed?.invested).toBe(2100)
    expect(rows[0].parsed?.value).toBeCloseTo(146247.51, 5)
  })

  it("UNIT-PARSE-213 — a still-invalid invested cell remains an error", () => {
    const text = "01.03.2026\t1.2A,56\t12.840,55"
    const rows = parseEntries(text, hintsDE, NO_NOTE_MAPPING, ctx())
    expect(rows[0].status).toBe("error")
    expect(rows[0].messages.some((m) => m.field === "invested")).toBe(true)
  })

  it("UNIT-PARSE-214 — en-US expression sums with '.' decimals", () => {
    const text = "01.03.2026,500+500.50,13986.90"
    const rows = parseEntries(
      text,
      { numberLocale: "en-US", dateFormat: "DMY-dot", hasHeader: false },
      NO_NOTE_MAPPING,
      ctx()
    )
    expect(rows[0].parsed?.invested).toBeCloseTo(1000.5, 5)
  })
})

// ---------------------------------------------------------------------------
// Date format flexibility — month-year + full date both accepted per hint
// ---------------------------------------------------------------------------

describe("parseEntries — flexible date formats per hint", () => {
  it("UNIT-PARSE-300 — DMY-dot hint accepts 03.2026 with defaultDay", () => {
    const rows = parseEntries(
      "03.2026\t250,00\t12000,00",
      { numberLocale: "de-DE", dateFormat: "DMY-dot", hasHeader: false },
      NO_NOTE_MAPPING,
      ctx([], { defaultDay: () => 15 })
    )
    expect(rows[0].parsed).toMatchObject({ year: 2026, month: 3, day: 15 })
  })

  it("UNIT-PARSE-301 — ISO-ym hint accepts 2024-03-15 with explicit day", () => {
    const rows = parseEntries(
      "2024-03-15,250.00,12000.00",
      { numberLocale: "en-US", dateFormat: "ISO-ym", hasHeader: false },
      NO_NOTE_MAPPING,
      ctx()
    )
    expect(rows[0].parsed).toMatchObject({ year: 2024, month: 3, day: 15 })
  })

  it("UNIT-PARSE-302 — ISO-ym hint accepts 2024-03 with defaultDay", () => {
    const rows = parseEntries(
      "2024-03,250.00,12000.00",
      { numberLocale: "en-US", dateFormat: "ISO-ym", hasHeader: false },
      NO_NOTE_MAPPING,
      ctx([], { defaultDay: () => 20 })
    )
    expect(rows[0].parsed).toMatchObject({ year: 2024, month: 3, day: 20 })
  })
})
