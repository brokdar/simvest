import { describe, it, expect } from "vitest"
import {
  addDraft,
  discardAll,
  initialState,
  removeDraft,
  setError,
  toggleDelete,
  updateCell,
} from "@/components/entries-grid/reducer"
import type { EntryDTO } from "@/lib/types"
import { labelFor } from "@/lib/types"
import { isDirty } from "@/components/entries-grid/draft-row"

function makeEntry(
  year: number,
  month: number,
  overrides: Partial<EntryDTO> = {}
): EntryDTO {
  return {
    id: year * 100 + month,
    year,
    month,
    day: 15,
    label: labelFor(year, month),
    invested: 500,
    value: 1000,
    note: "",
    ...overrides,
  }
}

describe("addDraft", () => {
  it("UNIT-HOOK-001 — first draft gets key draft-1 and increments counter", () => {
    const { state, key } = addDraft(initialState, {
      year: 2026,
      month: 5,
      day: 31,
    })
    expect(key).toBe("draft-1")
    expect(state.draftCounter).toBe(1)
    expect(state.drafts.size).toBe(1)
    expect(state.drafts.get("draft-1")?.year).toBe(2026)
  })

  it("UNIT-HOOK-002 — successive drafts get unique incrementing keys", () => {
    let s = initialState
    const r1 = addDraft(s, { year: 2026, month: 5, day: 31 })
    s = r1.state
    const r2 = addDraft(s, { year: 2026, month: 6, day: 30 })
    expect(r1.key).toBe("draft-1")
    expect(r2.key).toBe("draft-2")
    expect(r2.state.drafts.size).toBe(2)
  })

  it("UNIT-HOOK-003 — does not mutate previous state reference", () => {
    const prevDrafts = initialState.drafts
    const { state } = addDraft(initialState, { year: 2026, month: 5, day: 31 })
    expect(state.drafts).not.toBe(prevDrafts)
  })

  it("UNIT-HOOK-004 — applies defaults.invested to the new draft", () => {
    const { state, key } = addDraft(
      initialState,
      { year: 2026, month: 5, day: 31 },
      { invested: 250 }
    )
    expect(state.drafts.get(key)?.invested).toBe(250)
  })

  it("UNIT-HOOK-005 — omitted defaults fall back to neutral (invested=0)", () => {
    const { state, key } = addDraft(initialState, {
      year: 2026,
      month: 5,
      day: 31,
    })
    expect(state.drafts.get(key)?.invested).toBe(0)
  })
})

describe("updateCell", () => {
  it("UNIT-HOOK-010 — creates a draft when none exists for the entry", () => {
    const e = makeEntry(2024, 1)
    const s = updateCell(initialState, e, "value", 9999)
    expect(s.drafts.has("entry-202401")).toBe(true)
    expect(s.drafts.get("entry-202401")?.value).toBe(9999)
  })

  it("UNIT-HOOK-011 — updates an existing draft", () => {
    const e = makeEntry(2024, 1)
    const s1 = updateCell(initialState, e, "value", 1100)
    const s2 = updateCell(s1, e, "value", 1200)
    expect(s2.drafts.get("entry-202401")?.value).toBe(1200)
    expect(s2.drafts.get("entry-202401")?.touched.has("value")).toBe(true)
  })

  it("UNIT-HOOK-012 — setting back to original removes the touched mark", () => {
    const e = makeEntry(2024, 1, { value: 1000 })
    const s1 = updateCell(initialState, e, "value", 1100)
    expect(s1.drafts.get("entry-202401")?.touched.has("value")).toBe(true)
    const s2 = updateCell(s1, e, "value", 1000)
    expect(s2.drafts.get("entry-202401")?.touched.has("value")).toBe(false)
  })

  it("UNIT-HOOK-013 — works on a draft (no original) by key", () => {
    const r = addDraft(initialState, { year: 2026, month: 5, day: 31 })
    const s = updateCell(r.state, r.key, "invested", 250)
    expect(s.drafts.get("draft-1")?.invested).toBe(250)
    expect(isDirty(s.drafts.get("draft-1")!)).toBe(true)
  })

  it("UNIT-HOOK-014 — value can be null", () => {
    const e = makeEntry(2024, 1, { value: 1000 })
    const s = updateCell(initialState, e, "value", null)
    expect(s.drafts.get("entry-202401")?.value).toBeNull()
  })
})

describe("toggleDelete", () => {
  it("UNIT-HOOK-020 — first toggle marks for delete", () => {
    const e = makeEntry(2024, 1)
    const s = toggleDelete(initialState, e)
    expect(s.drafts.get("entry-202401")?.toDelete).toBe(true)
  })

  it("UNIT-HOOK-021 — toggle twice clears delete flag", () => {
    const e = makeEntry(2024, 1)
    const s = toggleDelete(toggleDelete(initialState, e), e)
    expect(s.drafts.get("entry-202401")?.toDelete).toBe(false)
  })

  it("UNIT-HOOK-022 — preserves field edits when toggling delete", () => {
    const e = makeEntry(2024, 1)
    const s1 = updateCell(initialState, e, "value", 9999)
    const s2 = toggleDelete(s1, e)
    expect(s2.drafts.get("entry-202401")?.toDelete).toBe(true)
    expect(s2.drafts.get("entry-202401")?.value).toBe(9999)
  })
})

describe("removeDraft / discardAll / setError", () => {
  it("UNIT-HOOK-030 — removeDraft drops the entry by key", () => {
    const e = makeEntry(2024, 1)
    const s1 = updateCell(initialState, e, "value", 9999)
    const s2 = removeDraft(s1, "entry-202401")
    expect(s2.drafts.has("entry-202401")).toBe(false)
  })

  it("UNIT-HOOK-031 — removeDraft on missing key returns same state", () => {
    const s = removeDraft(initialState, "nothing-here")
    expect(s).toBe(initialState)
  })

  it("UNIT-HOOK-032 — discardAll clears drafts but preserves the counter", () => {
    const r1 = addDraft(initialState, { year: 2026, month: 5, day: 31 })
    const r2 = addDraft(r1.state, { year: 2026, month: 6, day: 30 })
    const s = discardAll(r2.state)
    expect(s.drafts.size).toBe(0)
    expect(s.draftCounter).toBe(2)
  })

  it("UNIT-HOOK-033 — discardAll on empty is a no-op", () => {
    const s = discardAll(initialState)
    expect(s).toBe(initialState)
  })

  it("UNIT-HOOK-034 — setError attaches a message to an existing draft", () => {
    const e = makeEntry(2024, 1)
    const s1 = updateCell(initialState, e, "value", 9999)
    const s2 = setError(s1, "entry-202401", "Save failed")
    expect(s2.drafts.get("entry-202401")?.error).toBe("Save failed")
  })

  it("UNIT-HOOK-035 — setError on missing key is a no-op", () => {
    const s = setError(initialState, "missing", "boom")
    expect(s).toBe(initialState)
  })
})
