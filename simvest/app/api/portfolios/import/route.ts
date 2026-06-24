import { NextResponse } from "next/server"
import { ensureSeeded } from "@/lib/db/seed"
import { readJsonBody } from "@/lib/api/json"
import { validateTransferFile } from "@/lib/validation/transfer-portfolio"
import { restorePortfolio } from "@/lib/transfer/restore-portfolio"

/**
 * Commit a transfer bundle as a new portfolio. Server-side re-validation
 * is required — the preview route is advisory only, and a client can post
 * a different payload here than it previewed.
 *
 * Response shape mirrors `addPortfolio`: the full `PortfolioDTO` (returned
 * directly from `restorePortfolio` via the shared `portfolioRowToDTO`
 * mapper, so the wire shape can't drift from `/api/portfolios`). The
 * `summary` field powers the dialog's final step.
 */
export async function POST(req: Request) {
  await ensureSeeded()
  const body = (await readJsonBody(req)) as {
    payload?: unknown
    overrideName?: unknown
  }
  if (body === null || typeof body !== "object" || !("payload" in body)) {
    return NextResponse.json({ error: "Missing payload." }, { status: 400 })
  }

  // Reject empty / blank `overrideName` here so the user gets a 400 ("fix
  // your input") instead of letting the sync error in `restorePortfolio`
  // surface as 500 ("server is broken"). `undefined`/`null` falls through
  // to the file's own `portfolio.name`.
  let overrideName: string | undefined
  if (body.overrideName !== undefined && body.overrideName !== null) {
    if (typeof body.overrideName !== "string") {
      return NextResponse.json(
        { error: "overrideName must be a string." },
        { status: 400 }
      )
    }
    const trimmed = body.overrideName.trim()
    if (trimmed.length === 0) {
      return NextResponse.json(
        { error: "Portfolio name cannot be empty." },
        { status: 400 }
      )
    }
    overrideName = trimmed
  }

  const v = validateTransferFile(body.payload)
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 })

  try {
    const { portfolio, summary } = restorePortfolio(v.data, { overrideName })
    return NextResponse.json({ portfolio, summary }, { status: 201 })
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed."
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
