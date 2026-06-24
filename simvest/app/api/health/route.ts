import { NextResponse } from "next/server"
import { count } from "drizzle-orm"
import { db } from "@/lib/db"
import { portfolios, entries, goals, settings } from "@/lib/db/schema"
import { ensureSeeded } from "@/lib/db/seed"

const startedAt = Date.now()

// Avoid caching — orchestrators poll this for liveness.
export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await ensureSeeded()
    const counts = {
      portfolios: tableCount(portfolios),
      entries: tableCount(entries),
      goals: tableCount(goals),
      settings: tableCount(settings),
    }
    return NextResponse.json({
      status: "ok",
      database: "ok",
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      counts,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "unknown error"
    return NextResponse.json(
      { status: "error", database: "unreachable", error: message },
      { status: 503 }
    )
  }
}

function tableCount(
  table: typeof portfolios | typeof entries | typeof goals | typeof settings
) {
  return db.select({ c: count() }).from(table).get()?.c ?? 0
}
