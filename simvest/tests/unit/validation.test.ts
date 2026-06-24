import { describe, it, expect } from "vitest"
import {
  applyGoalCrossFieldRules,
  validateGoalCreate,
  validateGoalPatch,
} from "@/lib/validation/goal"
import {
  validateHoldingCreate,
  validateHoldingPatch,
} from "@/lib/validation/holding"
import {
  validatePortfolioCreate,
  validatePortfolioPatch,
} from "@/lib/validation/portfolio"
import {
  validateIncomeEventCreate,
  validateIncomeEventPatch,
} from "@/lib/validation/income-event"
import {
  validateEntryUpsert,
  validateEntryPatch,
  validateEntryDay,
} from "@/lib/validation/entry"
import { validateSettingsPatch } from "@/lib/validation/settings"

describe("validateGoalCreate", () => {
  it("UNIT-VAL-GOAL-001 — accepts a fully-specified portfolio_value goal", () => {
    const v = validateGoalCreate({
      name: "Goal A",
      kind: "portfolio_value",
      scope: "combined",
      target: 500000,
      targetYear: 2040,
    })
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.data.color).toBe("#1E40AF")
    expect(v.data.portfolioId).toBe(null)
    expect(v.data.swr).toBe(null)
    expect(v.data.yieldAssumed).toBe(null)
  })

  it("UNIT-VAL-GOAL-002 — rejects unknown kind", () => {
    const v = validateGoalCreate({
      name: "x",
      kind: "frobnicate",
      scope: "combined",
      target: 10,
      targetYear: 2030,
    })
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.error).toBe("invalid kind")
  })

  it("UNIT-VAL-GOAL-003 — portfolio scope requires portfolioId", () => {
    const v = validateGoalCreate({
      name: "x",
      kind: "portfolio_value",
      scope: "portfolio",
      target: 10,
      targetYear: 2030,
    })
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.error).toMatch(/portfolioId/)
  })

  it("UNIT-VAL-GOAL-004 — rejects target ≤ 0", () => {
    const v = validateGoalCreate({
      name: "x",
      kind: "portfolio_value",
      scope: "combined",
      target: 0,
      targetYear: 2030,
    })
    expect(v.ok).toBe(false)
  })

  it("UNIT-VAL-GOAL-005 — keeps swr only for annual_income goals", () => {
    const v = validateGoalCreate({
      name: "x",
      kind: "portfolio_value",
      scope: "combined",
      target: 10,
      targetYear: 2030,
      swr: 4,
    })
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.data.swr).toBe(null) // stripped — not annual_income
  })

  it("UNIT-VAL-GOAL-006 — keeps yieldAssumed only for dividend_* goals", () => {
    const v = validateGoalCreate({
      name: "x",
      kind: "dividend_annual",
      scope: "combined",
      target: 10,
      targetYear: 2030,
      yieldAssumed: 3.5,
    })
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.data.yieldAssumed).toBe(3.5)
  })

  it("UNIT-VAL-GOAL-007 — rejects swr out of range", () => {
    const v = validateGoalCreate({
      name: "x",
      kind: "annual_income",
      scope: "combined",
      target: 10,
      targetYear: 2030,
      swr: 99,
    })
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.error).toMatch(/swr/)
  })
})

describe("validateGoalPatch", () => {
  it("UNIT-VAL-GOAL-PATCH-001 — empty object → empty patch (route handles 'no changes')", () => {
    const v = validateGoalPatch({})
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(Object.keys(v.data)).toHaveLength(0)
  })

  it("UNIT-VAL-GOAL-PATCH-002 — non-object body rejected", () => {
    const v = validateGoalPatch(null)
    expect(v.ok).toBe(false)
  })

  it("UNIT-VAL-GOAL-PATCH-003 — only sets fields present in body", () => {
    const v = validateGoalPatch({ name: "renamed" })
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.data).toEqual({ name: "renamed" })
  })
})

describe("applyGoalCrossFieldRules", () => {
  const annualIncomeExisting = {
    kind: "annual_income" as const,
    scope: "combined" as const,
    portfolioId: null,
  }
  const portfolioValueExisting = {
    kind: "portfolio_value" as const,
    scope: "combined" as const,
    portfolioId: null,
  }
  const portfolioScopeExisting = {
    kind: "annual_income" as const,
    scope: "portfolio" as const,
    portfolioId: 7,
  }

  it("UNIT-VAL-GOAL-CROSS-001 — scope=combined blanks portfolioId", () => {
    const v = applyGoalCrossFieldRules(
      { scope: "combined" },
      portfolioScopeExisting
    )
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.data.portfolioId).toBe(null)
  })

  it("UNIT-VAL-GOAL-CROSS-002 — scope=portfolio without portfolioId in patch or existing → 400", () => {
    const v = applyGoalCrossFieldRules(
      { scope: "portfolio" },
      {
        kind: "annual_income",
        scope: "combined",
        portfolioId: null,
      }
    )
    expect(v.ok).toBe(false)
  })

  it("UNIT-VAL-GOAL-CROSS-003 — scope=portfolio with existing.portfolioId is allowed", () => {
    const v = applyGoalCrossFieldRules(
      { scope: "portfolio" },
      portfolioScopeExisting
    )
    expect(v.ok).toBe(true)
  })

  it("UNIT-VAL-GOAL-CROSS-004 — kind change to portfolio_value blanks swr", () => {
    const v = applyGoalCrossFieldRules(
      { kind: "portfolio_value" },
      annualIncomeExisting
    )
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.data.swr).toBe(null)
  })

  it("UNIT-VAL-GOAL-CROSS-005 — kind change to dividend_annual blanks swr", () => {
    const v = applyGoalCrossFieldRules(
      { kind: "dividend_annual" },
      annualIncomeExisting
    )
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.data.swr).toBe(null)
  })

  it("UNIT-VAL-GOAL-CROSS-006 — kind change away from dividend_ blanks yieldAssumed", () => {
    const v = applyGoalCrossFieldRules(
      { kind: "annual_income" },
      { kind: "dividend_annual", scope: "combined", portfolioId: null }
    )
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.data.yieldAssumed).toBe(null)
  })

  it("UNIT-VAL-GOAL-CROSS-007 — swr on existing non-annual_income (no kind change) → 400 instead of silent null", () => {
    const v = applyGoalCrossFieldRules({ swr: 4.5 }, portfolioValueExisting)
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.error).toMatch(/swr only applies/)
  })

  it("UNIT-VAL-GOAL-CROSS-008 — yieldAssumed on annual_income (no kind change) → 400 instead of silent null", () => {
    const v = applyGoalCrossFieldRules(
      { yieldAssumed: 3.0 },
      annualIncomeExisting
    )
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.error).toMatch(/yieldAssumed only applies/)
  })

  it("UNIT-VAL-GOAL-CROSS-009 — explicit swr=null on portfolio_value is fine", () => {
    const v = applyGoalCrossFieldRules({ swr: null }, portfolioValueExisting)
    expect(v.ok).toBe(true)
  })

  it("UNIT-VAL-GOAL-CROSS-010 — empty patch passes through unchanged", () => {
    const v = applyGoalCrossFieldRules({}, annualIncomeExisting)
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.data).toEqual({})
  })
})

describe("validateHoldingCreate", () => {
  it("UNIT-VAL-HOLDING-001 — normalises ISIN to uppercase + validates format", () => {
    const v = validateHoldingCreate({
      portfolioId: 1,
      name: "Apple",
      type: "stock",
      isin: "us0378331005",
    })
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.data.isin).toBe("US0378331005")
  })

  it("UNIT-VAL-HOLDING-002 — rejects malformed ISIN", () => {
    const v = validateHoldingCreate({
      portfolioId: 1,
      name: "X",
      type: "stock",
      isin: "not-an-isin",
    })
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.error).toMatch(/isin/)
  })

  it("UNIT-VAL-HOLDING-003 — defaults type to etf when omitted", () => {
    const v = validateHoldingCreate({ portfolioId: 1, name: "X" })
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.data.type).toBe("etf")
  })

  it("UNIT-VAL-HOLDING-004 — rejects unknown type", () => {
    const v = validateHoldingCreate({
      portfolioId: 1,
      name: "X",
      type: "cryptozoology",
    })
    expect(v.ok).toBe(false)
  })
})

describe("validateHoldingPatch", () => {
  it("UNIT-VAL-HOLDING-PATCH-001 — empty body → 'no changes' error", () => {
    const v = validateHoldingPatch({})
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.error).toBe("no changes")
  })

  it("UNIT-VAL-HOLDING-PATCH-002 — null isin clears the field", () => {
    const v = validateHoldingPatch({ isin: null })
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.data.isin).toBe(null)
  })

  it("UNIT-VAL-HOLDING-PATCH-003 — empty-string isin clears the field", () => {
    const v = validateHoldingPatch({ isin: "" })
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.data.isin).toBe(null)
  })
})

describe("validatePortfolioCreate", () => {
  it("UNIT-VAL-PF-001 — coerces non-negative numbers; clamps to 0 when missing", () => {
    const v = validatePortfolioCreate({ name: "P" })
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.data.targetMonthlyContribution).toBe(0)
    expect(v.data.startingValue).toBe(0)
    expect(v.data.startingDate).toBe(null)
  })

  it("UNIT-VAL-PF-002 — accepts startingDate in YYYY-MM only", () => {
    const ok = validatePortfolioCreate({ name: "P", startingDate: "2024-01" })
    expect(ok.ok).toBe(true)
    const bad = validatePortfolioCreate({
      name: "P",
      startingDate: "2024-01-15",
    })
    expect(bad.ok).toBe(false)
  })
})

describe("validatePortfolioPatch", () => {
  it("UNIT-VAL-PF-PATCH-001 — rejects negative targetMonthlyContribution", () => {
    const v = validatePortfolioPatch({ targetMonthlyContribution: -5 })
    expect(v.ok).toBe(false)
  })

  it("UNIT-VAL-PF-PATCH-002 — Infinity (JSON-serialised as null) rejected", () => {
    // Simulate what reaches the route after JSON.stringify({x: Infinity})
    const v = validatePortfolioPatch({ targetMonthlyContribution: null })
    expect(v.ok).toBe(false)
  })

  it("UNIT-VAL-PF-PATCH-003 — startingDate empty string → null", () => {
    const v = validatePortfolioPatch({ startingDate: "" })
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.data.startingDate).toBe(null)
  })
})

describe("validateIncomeEventCreate", () => {
  it("UNIT-VAL-INC-001 — dividend kind requires holdingId", () => {
    const v = validateIncomeEventCreate({
      kind: "dividend",
      paidDate: "2024-01-15",
      amount: 10,
    })
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.error).toMatch(/holdingId/)
  })

  it("UNIT-VAL-INC-002 — interest kind forbids holdingId", () => {
    const v = validateIncomeEventCreate({
      kind: "interest",
      portfolioId: 1,
      holdingId: 5,
      paidDate: "2024-01-15",
      amount: 10,
    })
    expect(v.ok).toBe(false)
  })

  it("UNIT-VAL-INC-003 — interest requires portfolioId", () => {
    const v = validateIncomeEventCreate({
      kind: "interest",
      paidDate: "2024-01-15",
      amount: 10,
    })
    expect(v.ok).toBe(false)
  })

  it("UNIT-VAL-INC-004 — tax must be 0 or negative", () => {
    const v = validateIncomeEventCreate({
      kind: "dividend",
      holdingId: 1,
      paidDate: "2024-01-15",
      amount: 10,
      tax: 5,
    })
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.error).toMatch(/tax/)
  })

  it("UNIT-VAL-INC-005 — paidDate must be ISO YYYY-MM-DD", () => {
    const v = validateIncomeEventCreate({
      kind: "dividend",
      holdingId: 1,
      paidDate: "15/01/2024",
      amount: 10,
    })
    expect(v.ok).toBe(false)
  })

  it("UNIT-VAL-INC-006 — happy path dividend", () => {
    const v = validateIncomeEventCreate({
      kind: "dividend",
      holdingId: 5,
      paidDate: "2024-01-15",
      amount: 10,
      tax: -1.5,
    })
    expect(v.ok).toBe(true)
    if (!v.ok || v.data.kind !== "dividend") return
    expect(v.data.holdingId).toBe(5)
    expect(v.data.tax).toBe(-1.5)
  })
})

describe("validateIncomeEventPatch", () => {
  it("UNIT-VAL-INC-PATCH-001 — empty body → 'no changes'", () => {
    const v = validateIncomeEventPatch({})
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.error).toBe("no changes")
  })

  it("UNIT-VAL-INC-PATCH-002 — null holdingId allowed (switching to interest)", () => {
    const v = validateIncomeEventPatch({ holdingId: null })
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.data.holdingId).toBe(null)
  })
})

describe("validateEntryUpsert", () => {
  it("UNIT-VAL-ENTRY-001 — clamps month into 1..12", () => {
    const v = validateEntryUpsert({
      year: 2024,
      month: 13,
      day: 1,
    })
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.data.month).toBe(12)
  })

  it("UNIT-VAL-ENTRY-002 — rejects day past month length", () => {
    const v = validateEntryUpsert({
      year: 2023,
      month: 2,
      day: 30,
    })
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.error).toMatch(/day/)
  })

  it("UNIT-VAL-ENTRY-003 — leap-year Feb 29 accepted", () => {
    const v = validateEntryUpsert({
      year: 2024,
      month: 2,
      day: 29,
    })
    expect(v.ok).toBe(true)
  })

  it("UNIT-VAL-ENTRY-004 — value omitted defaults to null (not 0)", () => {
    const v = validateEntryUpsert({ year: 2024, month: 1, day: 15 })
    expect(v.ok).toBe(true)
    if (!v.ok) return
    expect(v.data.value).toBe(null)
  })
})

describe("validateEntryPatch + validateEntryDay", () => {
  it("UNIT-VAL-ENTRY-PATCH-001 — empty body → 'no changes'", () => {
    const v = validateEntryPatch({})
    expect(v.ok).toBe(false)
  })

  it("UNIT-VAL-ENTRY-DAY-001 — flags day out of range against effective month length", () => {
    expect(validateEntryDay(2023, 2, 30)).toMatch(/day/)
    expect(validateEntryDay(2024, 2, 29)).toBe(null)
  })
})

describe("validateSettingsPatch", () => {
  it("UNIT-VAL-SET-001 — empty body → 'no changes'", () => {
    const v = validateSettingsPatch({})
    expect(v.ok).toBe(false)
  })

  it("UNIT-VAL-SET-002 — null in a numeric field rejected", () => {
    const v = validateSettingsPatch({ inflation: null })
    expect(v.ok).toBe(false)
    if (v.ok) return
    expect(v.error).toMatch(/inflation/)
  })

  it("UNIT-VAL-SET-003 — defaultEntryDay accepts 'first'/'last'/'1'..'31'", () => {
    expect(validateSettingsPatch({ defaultEntryDay: "first" }).ok).toBe(true)
    expect(validateSettingsPatch({ defaultEntryDay: "last" }).ok).toBe(true)
    expect(validateSettingsPatch({ defaultEntryDay: "15" }).ok).toBe(true)
    expect(validateSettingsPatch({ defaultEntryDay: "0" }).ok).toBe(false)
    expect(validateSettingsPatch({ defaultEntryDay: "32" }).ok).toBe(false)
  })

  it("UNIT-VAL-SET-004 — locale accepts en-US / de-DE; rejects unsupported tags", () => {
    expect(validateSettingsPatch({ locale: "en-US" }).ok).toBe(true)
    expect(validateSettingsPatch({ locale: "de-DE" }).ok).toBe(true)
    expect(validateSettingsPatch({ locale: null }).ok).toBe(true)
    expect(validateSettingsPatch({ locale: "completely-invalid" }).ok).toBe(
      false
    )
  })

  it("UNIT-VAL-SET-005 — dividendBasis must be 'net' or 'gross'", () => {
    expect(validateSettingsPatch({ dividendBasis: "net" }).ok).toBe(true)
    expect(validateSettingsPatch({ dividendBasis: "gross" }).ok).toBe(true)
    expect(validateSettingsPatch({ dividendBasis: "blue" }).ok).toBe(false)
  })
})
