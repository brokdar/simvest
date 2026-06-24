import "server-only"
import Database from "better-sqlite3"
import { drizzle } from "drizzle-orm/better-sqlite3"
import path from "node:path"
import fs from "node:fs"
import * as schema from "./schema"

declare global {
  var __simvestDb: ReturnType<typeof createClient> | undefined
}

function resolveDbPath() {
  const raw = process.env.DATABASE_URL ?? "./data/simvest.db"
  const stripped = raw.startsWith("file:") ? raw.slice(5) : raw
  if (stripped === ":memory:") return stripped
  return path.isAbsolute(stripped)
    ? stripped
    : path.resolve(process.cwd(), stripped)
}

function createClient() {
  const dbPath = resolveDbPath()
  if (dbPath !== ":memory:")
    fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  const sqlite = new Database(dbPath)
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  sqlite.pragma("wal_autocheckpoint = 100") // checkpoint every ~400 KB instead of 4 MB
  sqlite.pragma("cache_size = -1000") // 1 MB page cache (default is 2 MB)
  // next build spawns many workers that each open this DB; without a busy
  // timeout the first one to migrate holds the write lock and the rest fail
  // with SQLITE_BUSY. 10 s is enough to outlast any normal startup contention.
  sqlite.pragma("busy_timeout = 10000")
  return drizzle(sqlite, { schema })
}

// `next build` spawns ~27 workers in parallel during "Collecting page data";
// each one imports the route handler module, which would otherwise transitively
// open the same SQLite file. With WAL on and 27 simultaneous writers competing
// to set `journal_mode = WAL`, the loser workers crash with SQLITE_BUSY.
//
// Skip the actual open during the build phase — route handlers only touch the
// DB at request time, never at module load, so a stub instance is safe.
// `vi.spyOn(db, "select")` from integration tests also relies on `db` being a
// real Drizzle client (not a Proxy), so build-phase detection is the only
// hook that works for both contexts.
type Client = ReturnType<typeof createClient>
const isBuildPhase = process.env.NEXT_PHASE === "phase-production-build"

function buildPhaseStub(): Client {
  // Returns an opaque object — every property access throws if someone tries
  // to actually use the DB at module-load time (which they shouldn't).
  const handler: ProxyHandler<object> = {
    get() {
      throw new Error(
        "DB accessed during `next build`; route handlers must defer DB work to request time"
      )
    },
  }
  return new Proxy({}, handler) as Client
}

export const db: Client = isBuildPhase
  ? buildPhaseStub()
  : (globalThis.__simvestDb ?? createClient())
if (!isBuildPhase && process.env.NODE_ENV !== "production")
  globalThis.__simvestDb = db

export { schema }
