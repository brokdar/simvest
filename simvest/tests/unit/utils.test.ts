import { describe, it, expect } from "vitest"
import { cn } from "@/lib/utils"

describe("cn", () => {
  it("UNIT-UTILS-001 — single static class string", () => {
    expect(cn("px-4")).toBe("px-4")
  })

  it("UNIT-UTILS-002 — multiple static classes joined", () => {
    expect(cn("px-4", "py-2", "font-bold")).toBe("px-4 py-2 font-bold")
  })

  it("UNIT-UTILS-003 — conditional class (truthy)", () => {
    expect(cn("base", { active: true })).toBe("base active")
  })

  it("UNIT-UTILS-004 — conditional class (falsy)", () => {
    expect(cn("base", { active: false })).toBe("base")
  })

  it("UNIT-UTILS-005 — Tailwind conflict resolution (later class wins)", () => {
    expect(cn("px-4", "px-8")).toBe("px-8")
  })

  it("UNIT-UTILS-006 — undefined and null inputs are ignored", () => {
    expect(cn("base", undefined, null, "extra")).toBe("base extra")
  })

  it("UNIT-UTILS-007 — empty call returns empty string", () => {
    expect(cn()).toBe("")
  })
})
