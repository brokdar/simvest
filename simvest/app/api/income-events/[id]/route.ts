import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { dividendEvents, holdings } from "@/lib/db/schema"
import { ensureSeeded } from "@/lib/db/seed"
import type { HoldingType, IncomeKind } from "@/lib/types"
import { validateIncomeEventPatch } from "@/lib/validation/income-event"

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Ctx) {
  await ensureSeeded()
  const { id: idStr } = await params
  const id = Number(idStr)
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 })
  }
  const existing = db
    .select()
    .from(dividendEvents)
    .where(eq(dividendEvents.id, id))
    .get()
  if (!existing)
    return NextResponse.json({ error: "not found" }, { status: 404 })

  const body = await req.json().catch(() => null)
  const v = validateIncomeEventPatch(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const patch: Partial<typeof dividendEvents.$inferInsert> = { ...v.data }

  // Cross-field rules need `existing` to resolve effective kind.
  const targetKind = (patch.kind ?? existing.kind) as IncomeKind

  if (patch.holdingId !== undefined) {
    if (targetKind === "interest" && patch.holdingId != null) {
      return NextResponse.json(
        { error: "interest events must not have a holdingId" },
        { status: 400 }
      )
    }
    if (patch.holdingId != null) {
      const holding = db
        .select()
        .from(holdings)
        .where(eq(holdings.id, patch.holdingId))
        .get()
      if (!holding) {
        return NextResponse.json(
          { error: "holding not found" },
          { status: 404 }
        )
      }
      patch.portfolioId = holding.portfolioId
    }
  } else if (patch.kind === "interest" && existing.holdingId != null) {
    patch.holdingId = null
  } else if (patch.kind === "dividend" && existing.holdingId == null) {
    return NextResponse.json(
      { error: "dividend events require a holdingId" },
      { status: 400 }
    )
  }

  const updated = db
    .update(dividendEvents)
    .set(patch)
    .where(eq(dividendEvents.id, id))
    .returning()
    .get()
  const holding = updated.holdingId
    ? db.select().from(holdings).where(eq(holdings.id, updated.holdingId)).get()
    : null
  return NextResponse.json({
    id: updated.id,
    portfolioId: updated.portfolioId,
    holdingId: updated.holdingId,
    holdingName: holding?.name ?? null,
    holdingType: holding ? (holding.type as HoldingType) : null,
    holdingIsin: holding?.isin ?? null,
    paidDate: updated.paidDate,
    kind: updated.kind as IncomeKind,
    amount: Math.round(updated.amount * 100) / 100,
    tax: Math.round(updated.tax * 100) / 100,
    sourceBroker: updated.sourceBroker,
    sourceTransactionId: updated.sourceTransactionId,
    note: updated.note,
  })
}

export async function DELETE(_: Request, { params }: Ctx) {
  await ensureSeeded()
  const { id: idStr } = await params
  const id = Number(idStr)
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 })
  }
  db.delete(dividendEvents).where(eq(dividendEvents.id, id)).run()
  return NextResponse.json({ ok: true })
}
