import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { portfolios } from "@/lib/db/schema"
import { getPortfolios } from "@/lib/db/queries"
import { ensureSeeded } from "@/lib/db/seed"
import { validatePortfolioCreate } from "@/lib/validation/portfolio"

export async function GET() {
  return NextResponse.json(await getPortfolios())
}

export async function POST(req: Request) {
  await ensureSeeded()
  const body = await req.json().catch(() => null)
  const v = validatePortfolioCreate(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const created = db.insert(portfolios).values(v.data).returning().get()
  return NextResponse.json({ ...created, entries: [] }, { status: 201 })
}
