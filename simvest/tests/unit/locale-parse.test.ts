import { describe, it, expect } from "vitest"
import { parseMoney, parseMoneyExpression } from "@/lib/locale"

// D1 — the money parser must never silently pick a reading. Correct input for
// the active locale parses; input written the *other* way (dot vs comma) is
// rejected with a message that names the likely meaning, and carries that
// meaning as a `suggestion` the UI can offer as a one-tap fix. Nothing in
// here may return `ok: true` with a value the user didn't write.

type Ok = { raw: string; value: number }
type Rejected = { raw: string; suggestion: number | null; mentions: string }

function expectOk(locale: string, { raw, value }: Ok) {
  const r = parseMoney(raw, locale)
  expect(r, `${locale} "${raw}"`).toMatchObject({ ok: true })
  if (r.ok) expect(r.value).toBeCloseTo(value, 6)
}

function expectRejected(
  locale: string,
  { raw, suggestion, mentions }: Rejected
) {
  const r = parseMoney(raw, locale)
  expect(r.ok, `${locale} "${raw}" must be rejected`).toBe(false)
  if (r.ok) return
  expect(r.error).toContain(mentions)
  if (suggestion === null) expect(r.suggestion).toBeUndefined()
  else expect(r.suggestion).toBeCloseTo(suggestion, 6)
}

describe("parseMoney — de-DE (comma decimals, dot thousands)", () => {
  const L = "de-DE"

  // Regression rows: correct German input must keep working exactly as before.
  const accepted: Ok[] = [
    { raw: "1234,56", value: 1234.56 },
    { raw: "1.234,56", value: 1234.56 },
    { raw: "€ 1.234,56", value: 1234.56 },
    { raw: "€1.234,56", value: 1234.56 },
    { raw: "1.234,56 €", value: 1234.56 },
    { raw: "1234", value: 1234 },
    { raw: "1.234", value: 1234 }, // unambiguous here: a dot groups thousands
    { raw: "1.234.567,89", value: 1234567.89 },
    { raw: "12.345.678", value: 12345678 },
    { raw: "0,5", value: 0.5 },
    { raw: "0,125", value: 0.125 }, // a leading 0 can't be a thousands group
    { raw: "12,5", value: 12.5 },
    { raw: "  1234,56  ", value: 1234.56 },
    { raw: "1 234,56", value: 1234.56 }, // spaces are ignored
    { raw: "-1.234,56", value: -1234.56 },
    { raw: "-50", value: -50 },
    { raw: "0", value: 0 },
  ]
  it.each(accepted)("UNIT-LOCPARSE-DE-OK — $raw → $value", (row) =>
    expectOk(L, row)
  )

  // The blocker rows from FIX-PLAN D1, plus their relatives.
  const rejected: Rejected[] = [
    // was €123.456,00 (100×)
    { raw: "1234.56", suggestion: 1234.56, mentions: "1.234,56" },
    // was €1,23 (÷1000)
    { raw: "1,234.56", suggestion: 1234.56, mentions: "1.234,56" },
    { raw: "€ 1,234.56", suggestion: 1234.56, mentions: "1.234,56" },
    { raw: "-1234.56", suggestion: -1234.56, mentions: "-1.234,56" },
    { raw: "12.5", suggestion: 12.5, mentions: "12,5" },
    { raw: "4.9", suggestion: 4.9, mentions: "4,9" },
    { raw: "1,234,567", suggestion: 1234567, mentions: "1.234.567" },
    { raw: "1,234,567.89", suggestion: 1234567.89, mentions: "1.234.567,89" },
    // 3 digits after a lone comma: thousands (English) or decimals (German)?
    { raw: "1,234", suggestion: 1234, mentions: "1.234" },
    { raw: "15,000", suggestion: 15000, mentions: "15.000" },
    { raw: "-1,234", suggestion: -1234, mentions: "-1.234" },
  ]
  it.each(rejected)(
    "UNIT-LOCPARSE-DE-REJECT — $raw is rejected, suggests $suggestion",
    (row) => expectRejected(L, row)
  )

  it("UNIT-LOCPARSE-DE-010 — the rejection message says which separator does what", () => {
    const r = parseMoney("1234.56", L)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toMatch(/Did you mean 1\.234,56\?/)
      expect(r.error).toMatch(/comma/)
    }
  })

  it("UNIT-LOCPARSE-DE-011 — ambiguous three-digit decimals explain both readings", () => {
    const r = parseMoney("1,234", L)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/thousands/)
  })

  const unreadable = ["abc", "12abc", "1.23.4", "1,2,3", "12..5", "--", "€"]
  it.each(unreadable)(
    "UNIT-LOCPARSE-DE-BAD — %s keeps the clean 'Couldn't read' error",
    (raw) => {
      const r = parseMoney(raw, L, { allowEmpty: false })
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.suggestion).toBeUndefined()
        if (raw !== "€")
          expect(r.error).toBe(
            `Couldn't read "${raw}" as a number. Try 36.855,97.`
          )
        else expect(r.error).toBe("Enter a value.")
      }
    }
  )

  it("UNIT-LOCPARSE-DE-020 — empty and whitespace with allowEmpty → 0", () => {
    for (const raw of ["", "   ", "\t"]) {
      const r = parseMoney(raw, L)
      expect(r).toEqual({ ok: true, value: 0 })
    }
  })

  it("UNIT-LOCPARSE-DE-021 — empty with allowEmpty=false → 'Enter a value.'", () => {
    expect(parseMoney("  ", L, { allowEmpty: false })).toMatchObject({
      ok: false,
      error: "Enter a value.",
    })
  })

  it("UNIT-LOCPARSE-DE-022 — min applies to accepted values", () => {
    expect(parseMoney("-1,50", L, { min: 0 })).toMatchObject({ ok: false })
    expect(parseMoney("1,50", L, { min: 0 })).toEqual({ ok: true, value: 1.5 })
  })
})

describe("parseMoney — en-US (dot decimals, comma thousands)", () => {
  const L = "en-US"

  const accepted: Ok[] = [
    { raw: "1234.56", value: 1234.56 },
    { raw: "1,234.56", value: 1234.56 },
    { raw: "€ 1,234.56", value: 1234.56 },
    { raw: "$1,234.56", value: 1234.56 },
    { raw: "1234", value: 1234 },
    { raw: "1,234", value: 1234 }, // unambiguous here: a comma groups thousands
    { raw: "1,234,567.89", value: 1234567.89 },
    { raw: "0.5", value: 0.5 },
    { raw: "0.125", value: 0.125 },
    { raw: "12.5", value: 12.5 },
    { raw: "-1,234.56", value: -1234.56 },
  ]
  it.each(accepted)("UNIT-LOCPARSE-EN-OK — $raw → $value", (row) =>
    expectOk(L, row)
  )

  const rejected: Rejected[] = [
    { raw: "1234,56", suggestion: 1234.56, mentions: "1,234.56" },
    { raw: "1.234,56", suggestion: 1234.56, mentions: "1,234.56" },
    { raw: "€ 1.234,56", suggestion: 1234.56, mentions: "1,234.56" },
    { raw: "12,5", suggestion: 12.5, mentions: "12.5" },
    { raw: "1.234.567", suggestion: 1234567, mentions: "1,234,567" },
    // 3 digits after a lone dot: decimals (English) or thousands (German)?
    { raw: "1.234", suggestion: 1234, mentions: "1,234" },
    { raw: "15.000", suggestion: 15000, mentions: "15,000" },
  ]
  it.each(rejected)(
    "UNIT-LOCPARSE-EN-REJECT — $raw is rejected, suggests $suggestion",
    (row) => expectRejected(L, row)
  )

  it("UNIT-LOCPARSE-EN-010 — unreadable input uses the en-US example", () => {
    expect(parseMoney("abc", L)).toMatchObject({
      ok: false,
      error: `Couldn't read "abc" as a number. Try 36,855.97.`,
    })
  })
})

describe("parseMoneyExpression — D1 rules apply per term", () => {
  it("UNIT-LOCPARSE-EXPR-001 — de-DE sums of correct terms still work", () => {
    expect(parseMoneyExpression("1.200,50 + 300", "de-DE")).toEqual({
      ok: true,
      value: 1500.5,
    })
  })

  it("UNIT-LOCPARSE-EXPR-002 — a wrong-convention term rejects the whole expression and names the term", () => {
    const r = parseMoneyExpression("200 + 1234.56", "de-DE")
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toContain("1234.56")
      expect(r.error).toContain("1.234,56")
      // A suggestion for one term is not a value for the whole field.
      expect(r.suggestion).toBeUndefined()
    }
  })

  it("UNIT-LOCPARSE-EXPR-003 — single-term expression keeps the suggestion", () => {
    const r = parseMoneyExpression("1234.56", "de-DE")
    expect(r).toMatchObject({ ok: false, suggestion: 1234.56 })
  })

  it("UNIT-LOCPARSE-EXPR-004 — en-US expression with grouped terms", () => {
    expect(parseMoneyExpression("1,000.50 - 0.50", "en-US")).toEqual({
      ok: true,
      value: 1000,
    })
  })
})

describe("parseMoney — maxFractionDigits (cents)", () => {
  it("UNIT-LOCPARSE-CENTS-001 — more decimals than cents are rejected with the rounded reading", () => {
    const r = parseMoney("1.000,005", "de-DE", { maxFractionDigits: 2 })
    expect(r).toMatchObject({ ok: false, suggestion: 1000.01 })
    if (!r.ok) expect(r.error).toContain("Did you mean 1.000,01?")
  })
  it("UNIT-LOCPARSE-CENTS-002 — two decimals are fine", () => {
    expect(parseMoney("1.000,05", "de-DE", { maxFractionDigits: 2 })).toEqual({
      ok: true,
      value: 1000.05,
    })
  })
  it("UNIT-LOCPARSE-CENTS-003 — without the option, extra decimals still parse (paste path)", () => {
    expect(parseMoney("0,125", "de-DE")).toEqual({ ok: true, value: 0.125 })
  })
  it("UNIT-LOCPARSE-CENTS-004 — the option applies per expression term", () => {
    const r = parseMoneyExpression("100 + 0.125", "en-US", {
      maxFractionDigits: 2,
    })
    expect(r.ok).toBe(false)
  })
})
