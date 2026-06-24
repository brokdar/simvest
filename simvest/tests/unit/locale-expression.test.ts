import { describe, it, expect } from "vitest"
import { parseMoneyExpression } from "@/lib/locale"

describe("parseMoneyExpression — de-DE", () => {
  const locale = "de-DE"

  it("UNIT-LOCEXPR-001 — single number behaves like parseMoney", () => {
    const r = parseMoneyExpression("421,32", locale)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBeCloseTo(421.32, 5)
  })

  it("UNIT-LOCEXPR-002 — sums two terms with de-DE decimals", () => {
    const r = parseMoneyExpression("200 + 421,32", locale)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBeCloseTo(621.32, 5)
  })

  it("UNIT-LOCEXPR-003 — sums three terms including the user's example", () => {
    const r = parseMoneyExpression("200 + 300 + 421,32", locale)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBeCloseTo(921.32, 5)
  })

  it("UNIT-LOCEXPR-004 — supports subtraction", () => {
    const r = parseMoneyExpression("500 - 200", locale)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBeCloseTo(300, 5)
  })

  it("UNIT-LOCEXPR-005 — mixed plus and minus", () => {
    const r = parseMoneyExpression("1.000,50 + 500 - 250,25", locale)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBeCloseTo(1250.25, 5)
  })

  it("UNIT-LOCEXPR-006 — handles thousands grouping in operands", () => {
    const r = parseMoneyExpression("1.200 + 800", locale)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBeCloseTo(2000, 5)
  })

  it("UNIT-LOCEXPR-007 — leading minus is a unary sign", () => {
    const r = parseMoneyExpression("-50 + 100", locale)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBeCloseTo(50, 5)
  })

  it("UNIT-LOCEXPR-008 — trailing operator yields a parse error", () => {
    const r = parseMoneyExpression("100 +", locale)
    expect(r.ok).toBe(false)
  })

  it("UNIT-LOCEXPR-009 — non-numeric token yields a parse error", () => {
    const r = parseMoneyExpression("100 + abc", locale)
    expect(r.ok).toBe(false)
  })

  it("UNIT-LOCEXPR-010 — empty string with allowEmpty returns 0", () => {
    const r = parseMoneyExpression("", locale, { allowEmpty: true })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBe(0)
  })

  it("UNIT-LOCEXPR-011 — empty string with allowEmpty=false errors", () => {
    const r = parseMoneyExpression("", locale, { allowEmpty: false })
    expect(r.ok).toBe(false)
  })

  it("UNIT-LOCEXPR-012 — currency glyph stripped before parsing", () => {
    const r = parseMoneyExpression("€200 + €300", locale)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBeCloseTo(500, 5)
  })

  it("UNIT-LOCEXPR-013 — min boundary applies to the resulting sum", () => {
    const r = parseMoneyExpression("100 - 200", locale, { min: 0 })
    expect(r.ok).toBe(false)
  })
})

describe("parseMoneyExpression — en-US", () => {
  const locale = "en-US"

  it("UNIT-LOCEXPR-020 — en-US decimal separator works", () => {
    const r = parseMoneyExpression("200 + 421.32", locale)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBeCloseTo(621.32, 5)
  })

  it("UNIT-LOCEXPR-021 — en-US thousands grouping with comma", () => {
    const r = parseMoneyExpression("1,200 + 800", locale)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toBeCloseTo(2000, 5)
  })
})
