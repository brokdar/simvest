import { NextResponse } from "next/server"
import { ensureSeeded } from "@/lib/db/seed"
import { importEngine } from "@/lib/import/engine"

export async function POST(req: Request) {
  await ensureSeeded()

  let body: {
    broker?: unknown
    portfolioId?: unknown
    csv?: unknown
    decisions?: unknown
  }
  try {
    body = (await req.json()) as typeof body
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 })
  }

  const result = importEngine.applyImport({
    broker: body.broker,
    portfolioId: body.portfolioId,
    csv: body.csv,
    decisions: body.decisions,
  })
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json({ applied: result.applied }, { status: 201 })
}
