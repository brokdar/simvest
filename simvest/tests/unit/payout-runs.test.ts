import { describe, it, expect } from "vitest"
import { groupInterestRuns } from "@/lib/payout-runs"
import type { IncomeEventDTO } from "@/lib/types"

function ev(
  id: number,
  paidDate: string,
  kind: "dividend" | "interest",
  portfolioId = 1
): IncomeEventDTO {
  return {
    id,
    portfolioId,
    holdingId: kind === "dividend" ? 1 : null,
    holdingName: kind === "dividend" ? "ACME" : null,
    holdingType: null,
    holdingIsin: null,
    kind,
    paidDate,
    amount: 2.51,
    tax: 0,
    note: "",
    sourceBroker: null,
    sourceTransactionId: null,
  }
}

describe("groupInterestRuns (T3)", () => {
  it("UNIT-RUNS-001 — a month of daily interest from one account is one item", () => {
    const daily = Array.from({ length: 31 }, (_, i) =>
      ev(i + 1, `2026-05-${String(31 - i).padStart(2, "0")}`, "interest", 5)
    )
    const items = groupInterestRuns(daily)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      type: "run",
      key: "5-2026-05",
      month: "2026-05",
    })
    if (items[0].type === "run") expect(items[0].events).toHaveLength(31)
  })

  it("UNIT-RUNS-002 — dividends between interest days don't split the month (unique keys)", () => {
    const list = [
      ev(1, "2026-05-30", "interest"),
      ev(2, "2026-05-29", "interest"),
      ev(3, "2026-05-22", "dividend"),
      ev(4, "2026-05-21", "interest"),
      ev(5, "2026-05-20", "interest"),
    ]
    const items = groupInterestRuns(list)
    expect(items.map((i) => i.type)).toEqual(["run", "event"])
    const keys = items.filter((i) => i.type === "run").map((i) => i.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("UNIT-RUNS-003 — short runs, other accounts and dividends pass through", () => {
    const list = [
      ev(1, "2026-05-30", "interest", 1),
      ev(2, "2026-05-29", "interest", 2),
      ev(3, "2026-05-28", "dividend", 1),
    ]
    expect(groupInterestRuns(list).every((i) => i.type === "event")).toBe(true)
  })
})
