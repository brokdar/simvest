import { describe, it, expect } from "vitest"
import * as XLSX from "xlsx"
import { bondoraParser, XLSX_MARKER } from "@/lib/import/bondora"

/** Build a Bondora-shaped CSV (semicolon-separated) from data lines. */
function csv(...lines: string[]) {
  return ["Date;Payment type;In;Out;Balance", ...lines].join("\n")
}

/** Build a marker-prefixed base64 `.xlsx` payload from raw sheet rows —
 *  mirrors what the upload UI sends for a Bondora Excel export. */
function xlsxPayload(rows: (string | number)[][]): string {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, "Data")
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer
  return XLSX_MARKER + buf.toString("base64")
}

/** A realistic export: account-holder/summary preamble, a section header,
 *  then the "Datum;Zahlungsart;Eingänge;Ausgänge;Guthaben" table. */
function bondoraXlsx(...dataRows: (string | number)[][]) {
  return xlsxPayload([
    ["Jürgen Altszeimer", "", "", "Zusammenfassung", ""],
    ["01.06.2026-06.07.2026", "", "", "Zu Beginn", 15740.93],
    ["", "", "", "Einzahlungen", 291.36],
    ["", "", "", "", ""],
    ["Alle Ziele", "", "", "", ""],
    ["Datum", "Zahlungsart", "Eingänge", "Ausgänge", "Guthaben"],
    ...dataRows,
  ])
}

describe("bondora parser", () => {
  it("UNIT-BONDORA-001 — aggregates deposits per month, month-end value, daily interest", () => {
    const r = bondoraParser.parse(
      csv(
        "1/1/2024;Go & Grow returns;1,00;;1001,00",
        "1/15/2024;SEPA payment;100,00;;1101,00",
        "1/31/2024;Go & Grow returns;1,00;;1102,00",
        "2/10/2024;SEPA payment;50,00;;1152,00",
        "2/29/2024;Go & Grow returns;2,00;;1154,00"
      )
    )
    expect(r.errors).toHaveLength(0)
    expect(r.monthsAggregated).toHaveLength(2)

    const jan = r.monthsAggregated.find((m) => m.month === 1)
    const feb = r.monthsAggregated.find((m) => m.month === 2)
    expect(jan).toMatchObject({ deposits: 100, value: 1102 })
    expect(feb).toMatchObject({ deposits: 50, value: 1154 })

    expect(r.income).toHaveLength(3)
    expect(r.income.every((e) => e.kind === "interest")).toBe(true)
    expect(r.income.every((e) => e.tax === 0)).toBe(true)
    expect(
      r.income.every((e) => e.isin === null && e.holdingName === null)
    ).toBe(true)
    expect(r.income.map((e) => e.sourceTransactionId)).toEqual([
      "bondora:ret:2024-01-01:1",
      "bondora:ret:2024-01-31:1",
      "bondora:ret:2024-02-29:1",
    ])
    expect(r.holdingsCandidates).toHaveLength(0)
  })

  it("UNIT-BONDORA-002 — month-end value uses the last row after a defensive date sort", () => {
    // Rows deliberately out of chronological order.
    const r = bondoraParser.parse(
      csv(
        "1/31/2024;Go & Grow returns;1,00;;1102,00",
        "1/1/2024;Go & Grow returns;1,00;;1001,00",
        "1/15/2024;SEPA payment;100,00;;1101,00"
      )
    )
    const jan = r.monthsAggregated.find((m) => m.month === 1)
    expect(jan?.value).toBe(1102)
    expect(jan?.deposits).toBe(100)
  })

  it("UNIT-BONDORA-003 — parses German thousands separator and decimal comma", () => {
    const r = bondoraParser.parse(
      csv("1/2/2024;SEPA payment;1.234,56;;11.434,28")
    )
    const jan = r.monthsAggregated.find((m) => m.month === 1)
    expect(jan?.deposits).toBeCloseTo(1234.56, 2)
    expect(jan?.value).toBeCloseTo(11434.28, 2)
  })

  it("UNIT-BONDORA-004 — a withdrawal (Out) nets the month's contribution down", () => {
    const r = bondoraParser.parse(
      csv(
        "3/1/2024;SEPA payment;100,00;;5100,00",
        "3/20/2024;SEPA payment;;50,00;5050,00"
      )
    )
    const mar = r.monthsAggregated.find((m) => m.month === 3)
    expect(mar?.deposits).toBe(50)
    expect(mar?.value).toBe(5050)
  })

  it("UNIT-BONDORA-005 — two returns on one date get distinct ids and a warning", () => {
    const r = bondoraParser.parse(
      csv(
        "2/2/2024;Go & Grow returns;1,00;;100,00",
        "2/2/2024;Go & Grow returns;0,61;;100,61"
      )
    )
    expect(r.income.map((e) => e.sourceTransactionId)).toEqual([
      "bondora:ret:2024-02-02:1",
      "bondora:ret:2024-02-02:2",
    ])
    expect(r.warnings.some((w) => w.includes("2024-02-02"))).toBe(true)
  })

  it("UNIT-BONDORA-006 — unknown payment type is still counted as a movement, with a warning", () => {
    const r = bondoraParser.parse(
      csv("4/1/2024;Secondary market;25,00;;5025,00")
    )
    const apr = r.monthsAggregated.find((m) => m.month === 4)
    expect(apr?.deposits).toBe(25)
    expect(
      r.warnings.some((w) => w.includes("Unrecognized payment type"))
    ).toBe(true)
  })

  it("UNIT-BONDORA-007 — opening balance above the first transaction emits a reminder", () => {
    const r = bondoraParser.parse(
      csv("1/1/2024;Go & Grow returns;1,00;;1001,00")
    )
    expect(r.warnings.some((w) => /opens at €1000\.00/.test(w))).toBe(true)
  })

  it("UNIT-BONDORA-008 — a comma-separated file is rejected (missing columns)", () => {
    const r = bondoraParser.parse(
      "Date,Payment type,In,Out,Balance\n1/1/2024,x,1,,2"
    )
    expect(r.errors.length).toBeGreaterThan(0)
    expect(r.monthsAggregated).toHaveLength(0)
    expect(r.income).toHaveLength(0)
  })

  it("UNIT-BONDORA-009 — an impossible date (month > 12) errors that row", () => {
    const r = bondoraParser.parse(
      csv("13/1/2024;Go & Grow returns;1,00;;100,00")
    )
    expect(r.errors.length).toBeGreaterThan(0)
    expect(r.income).toHaveLength(0)
  })

  it("UNIT-BONDORA-010 — empty CSV returns empty arrays, no errors", () => {
    const r = bondoraParser.parse("")
    expect(r.errors).toHaveLength(0)
    expect(r.monthsAggregated).toHaveLength(0)
    expect(r.income).toHaveLength(0)
  })

  it("UNIT-BONDORA-011 — a leading UTF-8 BOM does not break header detection", () => {
    const r = bondoraParser.parse(
      "﻿" + csv("1/1/2024;SEPA payment;100,00;;1100,00")
    )
    expect(r.errors).toHaveLength(0)
    expect(r.monthsAggregated[0]?.deposits).toBe(100)
  })

  describe(".xlsx export (German headers, DD.MM.YYYY dates, numeric cells)", () => {
    it("UNIT-BONDORA-012 — aggregates deposits/interest past the preamble rows", () => {
      const r = bondoraParser.parse(
        bondoraXlsx(
          ["01.06.2026", "Go & Grow Zinsen", 2.51, "", 15743.44],
          ["01.06.2026", "SEPA-Banküberweisung", 100, "", 15843.44],
          ["02.06.2026", "Go & Grow Zinsen", 2.53, "", 15845.97]
        )
      )
      expect(r.errors).toHaveLength(0)
      expect(r.monthsAggregated).toHaveLength(1)
      const june = r.monthsAggregated[0]
      expect(june).toMatchObject({ year: 2026, month: 6, deposits: 100 })
      expect(june.value).toBeCloseTo(15845.97, 2)

      expect(r.income).toHaveLength(2)
      expect(r.income.every((e) => e.kind === "interest" && e.tax === 0)).toBe(
        true
      )
      expect(r.income.map((e) => e.paidDate)).toEqual([
        "2026-06-01",
        "2026-06-02",
      ])
    })

    it("UNIT-BONDORA-013 — a withdrawal (Ausgänge) nets the month's contribution down", () => {
      const r = bondoraParser.parse(
        bondoraXlsx(
          ["01.06.2026", "SEPA-Banküberweisung", 100, "", 15840.93],
          ["10.06.2026", "SEPA-Banküberweisung", "", 40, 15800.93]
        )
      )
      const june = r.monthsAggregated.find((m) => m.month === 6)
      expect(june?.deposits).toBe(60)
      expect(june?.value).toBe(15800.93)
    })

    it("UNIT-BONDORA-014 — an unrecognized German payment type still counts as a movement, with a warning", () => {
      const r = bondoraParser.parse(
        bondoraXlsx(["01.06.2026", "Zweitmarkt", 25, "", 15765.93])
      )
      const june = r.monthsAggregated.find((m) => m.month === 6)
      expect(june?.deposits).toBe(25)
      expect(
        r.warnings.some((w) => w.includes("Unrecognized payment type"))
      ).toBe(true)
    })

    it("UNIT-BONDORA-015 — missing the transaction table (no Datum/Zahlungsart header row) errors", () => {
      const r = bondoraParser.parse(
        xlsxPayload([["not", "a", "bondora", "statement"]])
      )
      expect(r.errors.length).toBeGreaterThan(0)
      expect(r.monthsAggregated).toHaveLength(0)
    })

    it("UNIT-BONDORA-016 — an unreadable file (bad base64/not a real workbook) errors cleanly", () => {
      const r = bondoraParser.parse(XLSX_MARKER + "not-a-real-workbook")
      expect(r.errors.length).toBeGreaterThan(0)
      expect(r.monthsAggregated).toHaveLength(0)
      expect(r.income).toHaveLength(0)
    })

    it("UNIT-BONDORA-017 — opening balance above the first transaction emits the same reminder as the CSV path", () => {
      const r = bondoraParser.parse(
        bondoraXlsx(["01.06.2026", "Go & Grow Zinsen", 2.51, "", 15743.44])
      )
      expect(r.warnings.some((w) => /opens at €15740\.93/.test(w))).toBe(true)
    })
  })
})
