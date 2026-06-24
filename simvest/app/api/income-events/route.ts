import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { dividendEvents, holdings } from "@/lib/db/schema"
import { getAllIncomeEvents } from "@/lib/db/queries"
import { ensureSeeded } from "@/lib/db/seed"
import type { HoldingType, IncomeKind } from "@/lib/types"
import { validateIncomeEventCreate } from "@/lib/validation/income-event"

export async function GET() {
  return NextResponse.json(await getAllIncomeEvents())
}

export async function POST(req: Request) {
  await ensureSeeded()
  const body = await req.json().catch(() => null)
  const v = validateIncomeEventCreate(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  let portfolioId: number
  let holdingId: number | null = null

  if (v.data.kind === "dividend") {
    const holding = db
      .select()
      .from(holdings)
      .where(eq(holdings.id, v.data.holdingId))
      .get()
    if (!holding) {
      return NextResponse.json({ error: "holding not found" }, { status: 404 })
    }
    holdingId = v.data.holdingId
    portfolioId = holding.portfolioId
  } else {
    portfolioId = v.data.portfolioId
  }

  const created = db
    .insert(dividendEvents)
    .values({
      holdingId,
      portfolioId,
      paidDate: v.data.paidDate,
      amount: v.data.amount,
      kind: v.data.kind,
      tax: v.data.tax,
      note: v.data.note,
    })
    .returning()
    .get()

  const holding = created.holdingId
    ? db.select().from(holdings).where(eq(holdings.id, created.holdingId)).get()
    : null

  return NextResponse.json(
    {
      id: created.id,
      portfolioId: created.portfolioId,
      holdingId: created.holdingId,
      holdingName: holding?.name ?? null,
      holdingType: holding ? (holding.type as HoldingType) : null,
      holdingIsin: holding?.isin ?? null,
      paidDate: created.paidDate,
      kind: created.kind as IncomeKind,
      amount: Math.round(created.amount * 100) / 100,
      tax: Math.round(created.tax * 100) / 100,
      sourceBroker: created.sourceBroker,
      sourceTransactionId: created.sourceTransactionId,
      note: created.note,
    },
    { status: 201 }
  )
}
