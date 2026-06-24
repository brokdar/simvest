import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { holdings, portfolios } from "@/lib/db/schema"
import { getAllHoldings } from "@/lib/db/queries"
import { ensureSeeded } from "@/lib/db/seed"
import type { HoldingType } from "@/lib/types"
import { validateHoldingCreate } from "@/lib/validation/holding"

export async function GET() {
  return NextResponse.json(await getAllHoldings())
}

export async function POST(req: Request) {
  await ensureSeeded()
  const body = await req.json().catch(() => null)
  const v = validateHoldingCreate(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const portfolio = db
    .select()
    .from(portfolios)
    .where(eq(portfolios.id, v.data.portfolioId))
    .get()
  if (!portfolio) {
    return NextResponse.json({ error: "portfolio not found" }, { status: 404 })
  }

  if (v.data.isin) {
    const duplicate = db
      .select()
      .from(holdings)
      .where(
        and(
          eq(holdings.portfolioId, v.data.portfolioId),
          eq(holdings.isin, v.data.isin)
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

  const created = db.insert(holdings).values(v.data).returning().get()
  return NextResponse.json(
    {
      id: created.id,
      portfolioId: created.portfolioId,
      name: created.name,
      type: created.type as HoldingType,
      isin: created.isin,
    },
    { status: 201 }
  )
}
