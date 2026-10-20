import fs from "node:fs"
import { Readable } from "node:stream"
import { snapshotDatabase } from "@/lib/db/about"
import { todayISO } from "@/lib/dates"

export const dynamic = "force-dynamic"

/**
 * GET /api/backup — the whole database as a download (C12). Streams a
 * consistent `.backup()` snapshot, never the raw WAL-mode file; restore by
 * stopping the app and putting the file back at DATABASE_URL.
 */
export async function GET() {
  try {
    const snap = await snapshotDatabase()
    const stream = fs.createReadStream(snap.file)
    stream.on("close", snap.cleanup)
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        "Content-Type": "application/vnd.sqlite3",
        "Content-Length": String(snap.bytes),
        "Content-Disposition": `attachment; filename="simvest-backup-${todayISO()}.db"`,
        "Cache-Control": "no-store",
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "backup failed"
    return Response.json({ error: message }, { status: 500 })
  }
}
