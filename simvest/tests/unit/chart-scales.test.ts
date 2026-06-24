import { describe, it, expect } from "vitest"
import { axisLayout, niceMax, niceTicks } from "@/lib/charts/scales"

describe("niceTicks", () => {
  it("UNIT-TICKS-001 — range=0 returns single tick at 0", () => {
    expect(niceTicks(0, 0)).toEqual({ ticks: [0], min: 0, max: 0 })
  })

  it("UNIT-TICKS-002 — range=0 non-zero value returns single tick", () => {
    expect(niceTicks(1000, 1000)).toEqual({
      ticks: [1000],
      min: 1000,
      max: 1000,
    })
  })

  it("UNIT-TICKS-003 — 0 to 10 000 produces 6 ticks in 2000-steps", () => {
    expect(niceTicks(0, 10000, 5)).toEqual({
      ticks: [0, 2000, 4000, 6000, 8000, 10000],
      min: 0,
      max: 10000,
    })
  })

  it("UNIT-TICKS-004 — 0 to 100 produces 6 ticks in 20-steps", () => {
    expect(niceTicks(0, 100, 5)).toEqual({
      ticks: [0, 20, 40, 60, 80, 100],
      min: 0,
      max: 100,
    })
  })

  it("UNIT-TICKS-005 — non-zero-aligned min extends to nice lower bound", () => {
    expect(niceTicks(1234, 5678, 5)).toEqual({
      ticks: [1000, 2000, 3000, 4000, 5000, 6000],
      min: 1000,
      max: 6000,
    })
  })

  it("UNIT-TICKS-006 — negative min (withdrawal scenario) — symmetric-ish ticks", () => {
    expect(niceTicks(-500, 500, 5)).toEqual({
      ticks: [-600, -400, -200, 0, 200, 400, 600],
      min: -600,
      max: 600,
    })
  })

  it("UNIT-TICKS-007 — negative invested min with positive max", () => {
    expect(niceTicks(-200, 800, 5)).toEqual({
      ticks: [-200, 0, 200, 400, 600, 800],
      min: -200,
      max: 800,
    })
  })

  it("UNIT-TICKS-008 — very small range (0 to 1) uses fractional steps", () => {
    const result = niceTicks(0, 1, 5)
    expect(result.ticks.length).toBeGreaterThanOrEqual(5)
    expect(result.ticks[0]).toBe(0)
    expect(result.ticks[result.ticks.length - 1]).toBe(1)
    // step should be 0.2: rawStep=0.2, mag=0.1, norm=2 → pick 2*0.1=0.2
    const step = result.ticks[1] - result.ticks[0]
    expect(step).toBeCloseTo(0.2, 5)
  })

  it("UNIT-TICKS-009 — range just over boundary (0 to 50 001) expands niceMax", () => {
    const result = niceTicks(0, 50001, 5)
    expect(result.max).toBe(60000)
    expect(result.ticks[result.ticks.length - 1]).toBe(60000)
  })

  it("UNIT-TICKS-010 — exact round upper bound is not expanded", () => {
    const result = niceTicks(0, 50000, 5)
    expect(result.max).toBe(50000)
    expect(result.ticks[result.ticks.length - 1]).toBe(50000)
  })

  it("UNIT-TICKS-011 — tick values are all multiples of the step (no floating rounding debris)", () => {
    const result = niceTicks(0, 700, 5)
    expect(result.ticks).toEqual([0, 100, 200, 300, 400, 500, 600, 700])
    for (const tick of result.ticks) {
      expect(tick % 100).toBe(0)
    }
  })

  it("UNIT-TICKS-012 — min returned is niceMin, max returned is niceMax", () => {
    const result = niceTicks(1234, 5678, 5)
    expect(result.min).toBe(1000)
    expect(result.max).toBe(6000)
  })

  it("UNIT-TICKS-013 — default count is 5", () => {
    expect(niceTicks(0, 10000)).toEqual({
      ticks: [0, 2000, 4000, 6000, 8000, 10000],
      min: 0,
      max: 10000,
    })
  })

  it("UNIT-TICKS-014 — step selection: norm 1.5≤norm<3 picks 2*mag", () => {
    // min=0, max=9, count=5: rawStep=1.8, mag=1, norm=1.8 → 1.5 ≤ 1.8 < 3 → step=2
    const result = niceTicks(0, 9, 5)
    expect(result).toEqual({ ticks: [0, 2, 4, 6, 8, 10], min: 0, max: 10 })
  })

  it("UNIT-TICKS-015 — step selection: norm>=3 and <7 picks 5*mag", () => {
    // min=0, max=15, count=5: rawStep=3, mag=1, norm=3 → 3 ≤ 3 < 7 → step=5
    const result = niceTicks(0, 15, 5)
    expect(result).toEqual({ ticks: [0, 5, 10, 15], min: 0, max: 15 })
  })

  it("UNIT-TICKS-016 — tick count grows when nice range exceeds raw range", () => {
    // min=0, max=50001, count=5: expands to 0..60000 in 10000-steps → 7 ticks
    const result = niceTicks(0, 50001, 5)
    expect(result.ticks.length).toBe(7)
  })
})

describe("niceMax", () => {
  it("UNIT-NICEMAX-001 — rounds up to the next power-of-10 magnitude", () => {
    expect(niceMax(23)).toBe(30)
    expect(niceMax(230)).toBe(300)
    expect(niceMax(2300)).toBe(3000)
  })

  it("UNIT-NICEMAX-002 — already-on-step values stay put", () => {
    expect(niceMax(100)).toBe(100)
    expect(niceMax(50)).toBe(50)
  })

  it("UNIT-NICEMAX-003 — sub-1 values round up within their magnitude", () => {
    expect(niceMax(0.23)).toBeCloseTo(0.3, 10)
  })

  it("UNIT-NICEMAX-004 — zero and negative inputs return 0", () => {
    expect(niceMax(0)).toBe(0)
    expect(niceMax(-5)).toBe(0)
  })
})

describe("axisLayout", () => {
  it("UNIT-AXIS-001 — produces count+1 ticks spaced linearly between min and max", () => {
    const ticks = axisLayout({ min: 0, max: 100, count: 5, range: [10, 110] })
    expect(ticks).toHaveLength(6)
    expect(ticks[0].value).toBe(0)
    expect(ticks[5].value).toBe(100)
    expect(ticks[0].screen).toBe(10)
    expect(ticks[5].screen).toBe(110)
  })

  it("UNIT-AXIS-002 — screen positions interpolate linearly", () => {
    const ticks = axisLayout({ min: 0, max: 100, count: 4, range: [0, 200] })
    expect(ticks[2].screen).toBe(100)
    expect(ticks[2].value).toBe(50)
  })

  it("UNIT-AXIS-003 — supports inverted screen range (y-axis grows downward)", () => {
    // SVG Y grows downward, so screen[start..end] = [bottom..top] is normal.
    const ticks = axisLayout({ min: 0, max: 50, count: 5, range: [400, 0] })
    expect(ticks[0].screen).toBe(400) // value=0 at the bottom
    expect(ticks[5].screen).toBe(0) // value=50 at the top
  })

  it("UNIT-AXIS-004 — count=0 collapses to a single tick at min", () => {
    const ticks = axisLayout({ min: 10, max: 50, count: 0, range: [0, 100] })
    expect(ticks).toHaveLength(1)
    expect(ticks[0].value).toBe(10)
    expect(ticks[0].screen).toBe(0)
  })
})
