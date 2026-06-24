import "server-only"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import path from "node:path"
import { db } from "./index"
import { settings } from "./schema"

// Memoize as a Promise so concurrent callers (e.g. parallel prerender workers)
// all await a single migration run instead of racing on the SQLite write lock.
let initPromise: Promise<void> | null = null

export async function ensureSeeded() {
  if (!initPromise) initPromise = runInit()
  return initPromise
}

async function runInit() {
  const migrationsFolder = path.resolve(process.cwd(), "drizzle")
  migrate(db, { migrationsFolder })

  const s = db.select().from(settings).limit(1).all()
  if (s.length === 0) db.insert(settings).values({ id: 1 }).run()
}
