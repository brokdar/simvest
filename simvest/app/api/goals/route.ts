import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { goals } from "@/lib/db/schema"
import { getGoals } from "@/lib/db/queries"
import { ensureSeeded } from "@/lib/db/seed"
import { validateGoalCreate } from "@/lib/validation/goal"

export async function GET() {
  return NextResponse.json(await getGoals())
}

export async function POST(req: Request) {
  await ensureSeeded()
  const body = await req.json().catch(() => null)
  const v = validateGoalCreate(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const created = db.insert(goals).values(v.data).returning().get()
  return NextResponse.json(created, { status: 201 })
}
