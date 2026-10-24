import { NextResponse } from "next/server"
import { dismissMilestones, getDismissedMilestones } from "@/lib/db/queries"
import { readJsonBody } from "@/lib/api/json"
import { validateMilestoneDismiss } from "@/lib/validation/milestones"

export async function GET() {
  return NextResponse.json(await getDismissedMilestones())
}

export async function POST(req: Request) {
  const body = await readJsonBody(req)
  const v = validateMilestoneDismiss(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  await dismissMilestones(v.data)
  return NextResponse.json(await getDismissedMilestones())
}
