import { NextResponse } from "next/server"
import { and, eq, ne } from "drizzle-orm"
import { db } from "@/lib/db"
import { holdings } from "@/lib/db/schema"
import { ensureSeeded } from "@/lib/db/seed"
import type { HoldingType } from "@/lib/types"
import { validateHoldingPatch } from "@/lib/validation/holding"

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Ctx) {
  await ensureSeeded()
  const { id: idStr } = await params
  const id = Number(idStr)
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 })
  }
  const existing = db.select().from(holdings).where(eq(holdings.id, id)).get()
  if (!existing)
    return NextResponse.json({ error: "not found" }, { status: 404 })

  const body = await req.json().catch(() => null)
  const v = validateHoldingPatch(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  if (v.data.isin) {
    const duplicate = db
      .select()
      .from(holdings)
      .where(
        and(
          eq(holdings.portfolioId, existing.portfolioId),
          eq(holdings.isin, v.data.isin),
          ne(holdings.id, id)
        )
      )
      .get()
    if (duplicate) {
      return NextResponse.json(
        { error: "another holding in this portfolio already uses that ISIN" },
        { status: 409 }
      )
    }
  }

  const updated = db
    .update(holdings)
    .set(v.data)
    .where(eq(holdings.id, id))
    .returning()
    .get()
  return NextResponse.json({
    id: updated.id,
    portfolioId: updated.portfolioId,
    name: updated.name,
    type: updated.type as HoldingType,
    isin: updated.isin,
  })
}

export async function DELETE(_: Request, { params }: Ctx) {
  await ensureSeeded()
  const { id: idStr } = await params
  const id = Number(idStr)
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 })
  }
  db.delete(holdings).where(eq(holdings.id, id)).run()
  return NextResponse.json({ ok: true })
}
