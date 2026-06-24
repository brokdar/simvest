import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { db } from "@/lib/db"
import { entries } from "@/lib/db/schema"
import { labelFor } from "@/lib/db/queries"
import { ensureSeeded } from "@/lib/db/seed"
import { validateEntryUpsert } from "@/lib/validation/entry"
import type { EntryDTO } from "@/lib/types"

type Ctx = { params: Promise<{ id: string }> }

/**
 * Bulk upsert for the paste importer. Accepts an array of fully-resolved rows
 * and writes them in a single transaction, keyed on (portfolioId, year, month)
 * exactly like the single-entry route. The client pre-filters skipped/error
 * rows, so the body is exactly what should be written. A row that fails
 * validation is counted in `skipped` (defense in depth) rather than failing the
 * whole batch; an actual DB error rolls everything back.
 */
export async function POST(req: Request, { params }: Ctx) {
  await ensureSeeded()
  const { id: idStr } = await params
  const portfolioId = Number(idStr)
  if (!Number.isFinite(portfolioId)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 })
  }

  const body = await req.json().catch(() => null)
  const input = (body as { entries?: unknown } | null)?.entries
  if (!Array.isArray(input) || input.length === 0) {
    return NextResponse.json({ error: "no entries" }, { status: 400 })
  }

  try {
    const out = db.transaction((tx) => {
      const saved: (EntryDTO & { label: string })[] = []
      let added = 0
      let updated = 0
      let skipped = 0

      for (const raw of input) {
        const v = validateEntryUpsert(raw)
        if (!v.ok) {
          skipped++
          continue
        }
        const { year, month, day, invested, value, note } = v.data
        const existing = tx
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

        const row = { portfolioId, year, month, day, invested, value, note }

        if (existing) {
          const u = tx
            .update(entries)
            .set(row)
            .where(eq(entries.id, existing.id))
            .returning()
            .get()
          updated++
          saved.push({ ...u, label: labelFor(year, month) })
        } else {
          const c = tx.insert(entries).values(row).returning().get()
          added++
          saved.push({ ...c, label: labelFor(year, month) })
        }
      }

      return { saved, added, updated, skipped }
    })

    return NextResponse.json({
      entries: out.saved,
      counts: { added: out.added, updated: out.updated, skipped: out.skipped },
    })
  } catch {
    return NextResponse.json({ error: "bulk write failed" }, { status: 503 })
  }
}
