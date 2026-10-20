import { describe, it, expect } from "vitest"
import { estimateLabelWidth, nonCollidingTicks } from "@/lib/charts/ticks"

const at = (index: number, x: number, width = 40) => ({ index, x, width })

describe("nonCollidingTicks", () => {
  it("UNIT-XTICK-001 — keeps every label when they all fit", () => {
    const got = nonCollidingTicks([at(0, 20), at(1, 80), at(2, 140)])
    expect([...got]).toEqual([0, 1, 2])
  })

  it("UNIT-XTICK-002 — the last label wins over a stride label it would hit", () => {
    // "Aug ’26" at 250 and the always-drawn "Oct ’26" at 270 collided (M4).
    const got = nonCollidingTicks([
      at(0, 20),
      at(6, 130),
      at(12, 250),
      at(14, 270),
    ])
    expect([...got].sort((a, b) => a - b)).toEqual([0, 6, 14])
  })

  it("UNIT-XTICK-003 — bunched labels are thinned left to right", () => {
    const got = nonCollidingTicks([at(0, 20), at(1, 45), at(2, 70), at(3, 140)])
    expect([...got].sort((a, b) => a - b)).toEqual([0, 2, 3])
  })

  it("UNIT-XTICK-004 — no kept pair overlaps, for any spacing", () => {
    for (let step = 5; step < 60; step += 3) {
      const cands = Array.from({ length: 30 }, (_, i) => at(i, i * step, 44))
      const kept = cands.filter((c) => nonCollidingTicks(cands).has(c.index))
      for (let i = 1; i < kept.length; i++) {
        expect(kept[i].x - kept[i - 1].x).toBeGreaterThanOrEqual(44 + 6)
      }
      expect(kept[kept.length - 1].index).toBe(29)
    }
  })

  it("UNIT-XTICK-005 — empty input yields nothing", () => {
    expect(nonCollidingTicks([]).size).toBe(0)
  })

  it("UNIT-XTICK-006 — label width scales with length and font size", () => {
    expect(estimateLabelWidth("Sep ’25", 11)).toBeGreaterThan(40)
    expect(estimateLabelWidth("Sep ’25", 10)).toBeLessThan(
      estimateLabelWidth("Sep ’25", 11)
    )
  })
})
