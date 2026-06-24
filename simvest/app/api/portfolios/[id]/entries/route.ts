import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { entries } from "@/lib/db/schema"
import { labelFor } from "@/lib/db/queries"
import { ensureSeeded } from "@/lib/db/seed"
import { validateEntryUpsert } from "@/lib/validation/entry"

type Ctx = { params: Promise<{ id: string }> }

export async function POST(req: Request, { params }: Ctx) {
  await ensureSeeded()
  const { id: idStr } = await params
  const portfolioId = Number(idStr)
  if (!Number.isFinite(portfolioId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const v = validateEntryUpsert(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const { year, month, day, invested, value, note } = v.data
  const existing = db
    .select()
    .from(entries)
    .where(
      and(
        eq(entries.portfolioId, portfolioId),
        eq(entries.year, year),
        eq(entries.month, month)
      )
    )
    .get()

  const row = {
    portfolioId,
    year,
    month,
    day,
    invested,
    value,
    note,
  }

  if (existing) {
    const updated = db
      .update(entries)
      .set(row)
      .where(eq(entries.id, existing.id))
      .returning()
      .get()
    return NextResponse.json({ ...updated, label: labelFor(year, month) })
  }
  const created = db.insert(entries).values(row).returning().get()
  return NextResponse.json(
    { ...created, label: labelFor(year, month) },
    { status: 201 }
  )
}
