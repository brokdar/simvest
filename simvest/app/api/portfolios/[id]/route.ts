import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { portfolios } from "@/lib/db/schema"
import { ensureSeeded } from "@/lib/db/seed"
import { readJsonBody } from "@/lib/api/json"
import { validatePortfolioPatch } from "@/lib/validation/portfolio"

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Ctx) {
  await ensureSeeded()
  const { id: idStr } = await params
  const id = Number(idStr)
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 })
  }
  const body = await readJsonBody(req)
  const v = validatePortfolioPatch(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const updated = db
    .update(portfolios)
    .set(v.data)
    .where(eq(portfolios.id, id))
    .returning()
    .get()
  if (!updated)
    return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json(updated)
}

export async function DELETE(_: Request, { params }: Ctx) {
  await ensureSeeded()
  const { id: idStr } = await params
  const id = Number(idStr)
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 })
  }
  db.delete(portfolios).where(eq(portfolios.id, id)).run()
  return NextResponse.json({ ok: true })
}
