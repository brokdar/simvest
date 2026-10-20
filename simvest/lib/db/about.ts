import "server-only"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { count } from "drizzle-orm"
import Database from "better-sqlite3"
import { db, rawSqlite, resolveDbPath } from "./index"
import { dividendEvents, entries, goals, holdings, portfolios } from "./schema"
import { ensureSeeded } from "./seed"
import pkg from "@/package.json"
import type { AboutInfo } from "@/lib/types"

export type { AboutInfo }

export async function getAboutInfo(): Promise<AboutInfo> {
  await ensureSeeded()
  const dbPath = resolveDbPath()
  const size = (p: string) => {
    try {
      return fs.statSync(p).size
    } catch {
      return 0
    }
  }
  const tally = (
    table:
      | typeof portfolios
      | typeof entries
      | typeof holdings
      | typeof dividendEvents
      | typeof goals
  ) => db.select({ c: count() }).from(table).get()?.c ?? 0
  return {
    version: pkg.version,
    dbPath,
    dbBytes:
      dbPath === ":memory:" ? null : size(dbPath) + size(`${dbPath}-wal`),
    counts: {
      portfolios: tally(portfolios),
      entries: tally(entries),
      holdings: tally(holdings),
      incomeEvents: tally(dividendEvents),
      goals: tally(goals),
    },
  }
}

/**
 * A consistent snapshot of the live database as one self-contained SQLite
 * file. The DB runs in WAL mode, so copying `simvest.db` byte-for-byte can
 * miss recent writes still in `-wal` (or catch a half-written page);
 * better-sqlite3's online `.backup()` copies through SQLite itself and
 * produces a file with everything in it. Written to a temp file, which the
 * caller streams and then removes via `cleanup`.
 */
export async function snapshotDatabase(): Promise<{
  file: string
  bytes: number
  cleanup: () => void
}> {
  await ensureSeeded()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "simvest-backup-"))
  const file = path.join(dir, "simvest.db")
  const cleanup = () => fs.rmSync(dir, { recursive: true, force: true })
  try {
    await withSourceConnection((src) => src.backup(file))
    return { file, bytes: fs.statSync(file).size, cleanup }
  } catch (err) {
    cleanup()
    throw err
  }
}

/**
 * The connection to back up from: the app's own when this module instance
 * opened it, else a short-lived read-only one on the same file (a dev-server
 * reload can leave `db` memoized from an older module). A WAL reader sees
 * every committed write, so either gives the same snapshot.
 */
async function withSourceConnection<T>(
  fn: (src: Database.Database) => Promise<T>
): Promise<T> {
  let own: Database.Database | null = null
  try {
    own = rawSqlite()
  } catch {
    own = null
  }
  if (own) return fn(own)
  const dbPath = resolveDbPath()
  if (dbPath === ":memory:") throw new Error("SQLite is not open")
  const src = new Database(dbPath, { readonly: true, fileMustExist: true })
  try {
    return await fn(src)
  } finally {
    src.close()
  }
}
