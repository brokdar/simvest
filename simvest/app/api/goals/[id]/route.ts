import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { goals } from "@/lib/db/schema"
import { ensureSeeded } from "@/lib/db/seed"
import type { GoalKind, GoalScope } from "@/lib/types"
import {
  applyGoalCrossFieldRules,
  validateGoalPatch,
} from "@/lib/validation/goal"

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Ctx) {
  await ensureSeeded()
  const { id: idStr } = await params
  const id = Number(idStr)
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 })
  }

  const existing = db.select().from(goals).where(eq(goals.id, id)).get()
  if (!existing) {
    return NextResponse.json({ error: "not found" }, { status: 404 })
  }

  const body = await req.json().catch(() => null)
  const v = validateGoalPatch(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const cross = applyGoalCrossFieldRules(v.data, {
    kind: existing.kind as GoalKind,
    scope: existing.scope as GoalScope,
    portfolioId: existing.portfolioId,
  })
  if (!cross.ok)
    return NextResponse.json({ error: cross.error }, { status: 400 })

  if (Object.keys(cross.data).length === 0) {
    return NextResponse.json({ error: "no changes" }, { status: 400 })
  }

  const updated = db
    .update(goals)
    .set(cross.data)
    .where(eq(goals.id, id))
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
  db.delete(goals).where(eq(goals.id, id)).run()
  return NextResponse.json({ ok: true })
}
