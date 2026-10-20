import { describe, it, expect } from "vitest"
import {
  classifyMonth,
  defaultMonthAction,
  summarizeMonthStatuses,
} from "@/lib/import/month-status"

const base = {
  exists: true,
  currentInvested: 100,
  currentValue: 15728.37,
  incomingInvested: 100,
  incomingValue: 15740.93,
}

describe("classifyMonth (D3)", () => {
  it("UNIT-IMPSTAT-001 — the real case (15.728,37 stored, 15.740,93 incoming) is a correction", () => {
    expect(classifyMonth(base)).toBe("correction")
  })
  it("UNIT-IMPSTAT-002 — identical value and invested → unchanged", () => {
    expect(classifyMonth({ ...base, incomingValue: 15728.37 })).toBe(
      "unchanged"
    )
  })
  it("UNIT-IMPSTAT-003 — sub-cent float noise is not a correction", () => {
    expect(classifyMonth({ ...base, incomingValue: 15728.370000001 })).toBe(
      "unchanged"
    )
  })
  it("UNIT-IMPSTAT-004 — invested differs → correction", () => {
    expect(
      classifyMonth({ ...base, incomingValue: 15728.37, incomingInvested: 150 })
    ).toBe("correction")
  })
  it("UNIT-IMPSTAT-005 — broker without a balance (null) never differs on value", () => {
    expect(classifyMonth({ ...base, incomingValue: null })).toBe("unchanged")
  })
  it("UNIT-IMPSTAT-006 — stored value empty, statement has one → correction", () => {
    expect(classifyMonth({ ...base, currentValue: null })).toBe("correction")
  })
  it("UNIT-IMPSTAT-007 — no stored entry → new", () => {
    expect(classifyMonth({ ...base, exists: false })).toBe("new")
  })
})

describe("defaultMonthAction (D3)", () => {
  it("UNIT-IMPSTAT-010 — new and correction default to replace; unchanged skips", () => {
    expect(defaultMonthAction("new")).toBe("replace")
    expect(defaultMonthAction("correction")).toBe("replace")
    expect(defaultMonthAction("unchanged")).toBe("skip")
  })
})

describe("summarizeMonthStatuses (D3)", () => {
  it("UNIT-IMPSTAT-020 — '4 new · 1 correction · 1 unchanged'", () => {
    expect(
      summarizeMonthStatuses([
        "new",
        "new",
        "new",
        "new",
        "correction",
        "unchanged",
      ])
    ).toBe("4 new · 1 correction · 1 unchanged")
  })
  it("UNIT-IMPSTAT-021 — pluralises corrections and drops zero parts", () => {
    expect(summarizeMonthStatuses(["correction", "correction"])).toBe(
      "2 corrections"
    )
  })
  it("UNIT-IMPSTAT-022 — empty list", () => {
    expect(summarizeMonthStatuses([])).toBe("no months")
  })
})
