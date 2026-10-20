import { describe, it, expect, beforeAll } from "vitest"
import { GET } from "@/app/api/backup/route"
import { ensureSeeded } from "@/lib/db/seed"
import { getAboutInfo } from "@/lib/db/about"
import Database from "better-sqlite3"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

beforeAll(async () => {
  await ensureSeeded()
})

describe("GET /api/backup (C12)", () => {
  it("INT-BACKUP-001 — downloads a complete, valid SQLite snapshot", async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/vnd.sqlite3")
    expect(res.headers.get("content-disposition")).toMatch(
      /attachment; filename="simvest-backup-\d{4}-\d{2}-\d{2}\.db"/
    )
    const buf = Buffer.from(await res.arrayBuffer())
    expect(buf.subarray(0, 15).toString()).toBe("SQLite format 3")
    expect(Number(res.headers.get("content-length"))).toBe(buf.length)

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "int-backup-"))
    const file = path.join(dir, "b.db")
    fs.writeFileSync(file, buf)
    const copy = new Database(file, { readonly: true })
    try {
      expect(copy.pragma("integrity_check", { simple: true })).toBe("ok")
      const tables = copy
        .prepare("select name from sqlite_master where type='table'")
        .all()
        .map((r) => (r as { name: string }).name)
      for (const t of [
        "portfolios",
        "entries",
        "holdings",
        "dividend_events",
        "goals",
        "settings",
      ])
        expect(tables).toContain(t)
    } finally {
      copy.close()
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })

  it("INT-BACKUP-002 — About info reports version, path and counts", async () => {
    const about = await getAboutInfo()
    expect(about.version).toMatch(/^\d+\.\d+\.\d+/)
    expect(about.dbPath).toBe(":memory:")
    expect(about.dbBytes).toBeNull()
    expect(Object.keys(about.counts).sort()).toEqual([
      "entries",
      "goals",
      "holdings",
      "incomeEvents",
      "portfolios",
    ])
  })
})
