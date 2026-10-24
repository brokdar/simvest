import { describe, it, expect, beforeAll, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { GET, POST } from "@/app/api/milestones/route"
import { db } from "@/lib/db"
import { milestoneDismissals } from "@/lib/db/schema"
import { ensureSeeded } from "@/lib/db/seed"
import { getInitialData } from "@/lib/db/queries"

function post(body: unknown): NextRequest {
  return new NextRequest("http://localhost/api/milestones", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

beforeAll(async () => {
  await ensureSeeded()
})

beforeEach(() => {
  db.delete(milestoneDismissals).run()
})

describe("/api/milestones", () => {
  it("INT-LO-MILESTONES-001 — GET is empty on a fresh DB", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([])
  })

  it("INT-LO-MILESTONES-002 — POST dismisses one id and GET lists it", async () => {
    const res = await POST(post({ id: "value-100000" }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(["value-100000"])
    expect(await (await GET()).json()).toEqual(["value-100000"])
  })

  it("INT-LO-MILESTONES-003 — POST accepts a batch and is idempotent", async () => {
    await POST(post({ ids: ["a", "b"] }))
    const res = await POST(post({ ids: ["b", "c", "c"] }))
    const body = (await res.json()) as string[]
    expect(body.sort()).toEqual(["a", "b", "c"])
  })

  it("INT-LO-MILESTONES-004 — POST rejects a missing or non-string id", async () => {
    expect((await POST(post({}))).status).toBe(400)
    expect((await POST(post({ id: 5 }))).status).toBe(400)
    expect((await POST(post({ ids: [] }))).status).toBe(400)
  })

  it("INT-LO-MILESTONES-005 — dismissals are part of the initial data", async () => {
    await POST(post({ id: "income-total-500" }))
    const data = await getInitialData()
    expect(data.dismissedMilestones).toEqual(["income-total-500"])
  })
})
