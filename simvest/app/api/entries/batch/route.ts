import { NextResponse } from "next/server"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "@/lib/db"
import { entries, portfolios } from "@/lib/db/schema"
import { labelFor } from "@/lib/db/queries"
import { ensureSeeded } from "@/lib/db/seed"
import { validateEntryBatch } from "@/lib/validation/entry"
import type { EntryDTO } from "@/lib/types"

/**
 * Cross-portfolio upsert for the catch-up screen (W2): one value per account,
 * saved as one action. Each row is keyed on (portfolioId, year, month) like
 * the single-entry route. Validation is all-or-nothing — a bad row or an
 * unknown portfolio rejects the batch with a 400 naming the row, and nothing
 * is written. A DB error mid-write rolls the whole batch back.
 */
export async function POST(req: Request) {
  await ensureSeeded()
  const body = await req.json().catch(() => null)
  const v = validateEntryBatch(body)
  if (!v.ok) {
    const index = "index" in v ? v.index : undefined
    return NextResponse.json(
      {
        error: index === undefined ? v.error : `Row ${index + 1}: ${v.error}`,
        index,
      },
      { status: 400 }
    )
  }
  const rows = v.data

  const ids = [...new Set(rows.map((r) => r.portfolioId))]
  const known = new Set(
    db
      .select({ id: portfolios.id })
      .from(portfolios)
      .where(inArray(portfolios.id, ids))
      .all()
      .map((p) => p.id)
  )
  const missing = rows.findIndex((r) => !known.has(r.portfolioId))
  if (missing >= 0) {
    return NextResponse.json(
      {
        error: `Row ${missing + 1}: that account no longer exists`,
        index: missing,
      },
      { status: 400 }
    )
  }

  try {
    const out = db.transaction((tx) => {
      const saved: (EntryDTO & { label: string })[] = []
      let added = 0
      let updated = 0
      for (const row of rows) {
        const { portfolioId, year, month } = row
        const existing = tx
          .select({ id: entries.id })
          .from(entries)
          .where(
            and(
              eq(entries.portfolioId, portfolioId),
              eq(entries.year, year),
              eq(entries.month, month)
            )
          )
          .get()
        const written = existing
          ? tx
              .update(entries)
              .set(row)
              .where(eq(entries.id, existing.id))
              .returning()
              .get()
          : tx.insert(entries).values(row).returning().get()
        if (existing) updated++
        else added++
        saved.push({ ...written, label: labelFor(year, month) })
      }
      return { saved, added, updated }
    })
    return NextResponse.json({
      entries: out.saved,
      counts: { added: out.added, updated: out.updated },
    })
  } catch {
    return NextResponse.json({ error: "batch write failed" }, { status: 503 })
  }
}
