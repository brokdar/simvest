import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { entries } from "@/lib/db/schema"
import { labelFor } from "@/lib/db/queries"
import { ensureSeeded } from "@/lib/db/seed"
import { validateEntryDay, validateEntryPatch } from "@/lib/validation/entry"

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: Request, { params }: Ctx) {
  await ensureSeeded()
  const { id: idStr } = await params
  const id = Number(idStr)
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const v = validateEntryPatch(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const existing = db.select().from(entries).where(eq(entries.id, id)).get()
  if (!existing)
    return NextResponse.json({ error: "not found" }, { status: 404 })

  const mergedYear = v.data.year ?? existing.year
  const mergedMonth = v.data.month ?? existing.month
  const mergedDay = v.data.day ?? existing.day
  const dayErr = validateEntryDay(mergedYear, mergedMonth, mergedDay)
  if (dayErr) return NextResponse.json({ error: dayErr }, { status: 400 })

  const updated = db
    .update(entries)
    .set(v.data)
    .where(eq(entries.id, id))
    .returning()
    .get()
  if (!updated)
    return NextResponse.json({ error: "not found" }, { status: 404 })
  return NextResponse.json({
    ...updated,
    label: labelFor(updated.year, updated.month),
  })
}

export async function DELETE(_: Request, { params }: Ctx) {
  await ensureSeeded()
  const { id: idStr } = await params
  const id = Number(idStr)
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 })
  }
  db.delete(entries).where(eq(entries.id, id)).run()
  return NextResponse.json({ ok: true })
}
