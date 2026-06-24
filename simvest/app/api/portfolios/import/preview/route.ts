import { NextResponse } from "next/server"
import { ensureSeeded } from "@/lib/db/seed"
import { readJsonBody } from "@/lib/api/json"
import { validateTransferFile } from "@/lib/validation/transfer-portfolio"
import { previewResolvedName } from "@/lib/transfer/restore-portfolio"
import type { TransferPreview } from "@/lib/transfer/types"

/**
 * Dry-run validation + name-collision resolution. The dialog calls this
 * before the user confirms so we can show counts, the resolved name, and
 * any warnings. The commit endpoint re-validates because the wire format
 * must not be trusted client-side.
 *
 * Expected body shape: `{ payload: unknown }` — the raw JSON the user
 * uploaded, untouched. We don't accept the bundle at the top level because
 * a future "merge into existing" mode would carry additional options
 * alongside `payload`, and starting with a wrapper keeps the seam compatible.
 */
export async function POST(req: Request) {
  await ensureSeeded()
  const body = (await readJsonBody(req)) as { payload?: unknown }
  if (body === null || typeof body !== "object" || !("payload" in body)) {
    return NextResponse.json({ error: "Missing payload." }, { status: 400 })
  }

  const v = validateTransferFile(body.payload)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  const file = v.data
  const { resolvedName, collidedWithExistingName } = previewResolvedName(
    file.portfolio.name
  )

  const dividends = file.incomeEvents.filter(
    (e) => e.kind === "dividend"
  ).length
  const interest = file.incomeEvents.length - dividends

  const warnings: string[] = []
  // Combined goals are excluded by the exporter — the source instance
  // counts them and ships the count in `meta.combinedGoalsExcluded` so we
  // can surface a precise warning here. Falls back silently when the field
  // is absent (older v1 exports written before the field landed).
  const excluded = file.meta?.combinedGoalsExcluded
  if (excluded && excluded > 0) {
    warnings.push(
      excluded === 1
        ? "1 combined goal was excluded by the source instance."
        : `${excluded} combined goals were excluded by the source instance.`
    )
  }

  const preview: TransferPreview = {
    resolvedName,
    collidedWithExistingName,
    counts: {
      entries: file.entries.length,
      holdings: file.holdings.length,
      dividends,
      interest,
      goals: file.goals.length,
    },
    warnings,
  }

  return NextResponse.json({ preview })
}
