import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { settings } from "@/lib/db/schema"
import { getSettings } from "@/lib/db/queries"
import { ensureSeeded } from "@/lib/db/seed"
import { readJsonBody } from "@/lib/api/json"
import { validateSettingsPatch } from "@/lib/validation/settings"

export async function GET() {
  await ensureSeeded()
  return NextResponse.json(await getSettings())
}

export async function PATCH(req: Request) {
  await ensureSeeded()
  const body = await readJsonBody(req)
  const v = validateSettingsPatch(body)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  await getSettings() // ensure row 1 exists
  const updated = db
    .update(settings)
    .set(v.data)
    .where(eq(settings.id, 1))
    .returning()
    .get()
  return NextResponse.json(updated)
}
