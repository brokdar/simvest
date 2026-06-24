import { NextResponse } from "next/server"
import { ensureSeeded } from "@/lib/db/seed"
import { exportPortfolio } from "@/lib/transfer/export-portfolio"

// `Cache-Control: no-store` on the response (see headers below) prevents
// browser and CDN caching of user data. Route handlers that await dynamic
// params are non-static by default in Next.js 16, so no `export const
// dynamic` is needed — and adding it would violate the project's
// "health route is the only force-dynamic exception" rule.

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  await ensureSeeded()
  const { id: idStr } = await params
  const id = Number(idStr)
  if (!Number.isFinite(id)) {
    return NextResponse.json({ error: "invalid id" }, { status: 400 })
  }

  const result = await exportPortfolio(id)
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }

  const body = JSON.stringify(result.file, null, 2)
  const safeName =
    result.file.portfolio.name
      .replace(/[^a-z0-9\-_]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "portfolio"
  const date = new Date().toISOString().slice(0, 10)
  const filename = `simvest-portfolio-${safeName}-${date}.json`

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
