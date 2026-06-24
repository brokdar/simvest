/* eslint-disable react-hooks/rules-of-hooks -- Playwright fixtures' `use` callback name collides with React's `use` hook in lint heuristics; this file is not React. */
import { test as base, expect } from "@playwright/test"
import Database from "better-sqlite3"
import { migrate } from "drizzle-orm/better-sqlite3/migrator"
import { drizzle } from "drizzle-orm/better-sqlite3"
import { spawn, type ChildProcess } from "node:child_process"
import path from "node:path"
import fs from "node:fs"
import net from "node:net"
import { fileURLToPath } from "node:url"
import { seedFixture } from "./seed-fixture"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const PROJECT_ROOT = path.resolve(__dirname, "..", "..")
const STANDALONE_SERVER = path.resolve(
  PROJECT_ROOT,
  ".next",
  "standalone",
  "server.js"
)
const BASE_PORT = 3100

/**
 * Per-worker e2e infrastructure.
 *
 * Why this exists: the e2e suite used to share ONE Next.js server and ONE
 * SQLite database across all Playwright workers. That single shared DB is
 * the source of every "flaky" parallel failure we've ever seen — worker A's
 * `afterEach` reset wipes the DB while worker B's `page.reload()` is reading
 * it; worker C's slider PATCH overlaps worker D's; and so on. Per-test
 * mitigations (route interception, retry polling, etc.) only paper over the
 * underlying contention.
 *
 * Architecture (one set per Playwright worker, parallelIndex 0..N):
 *
 *   worker 0 ── http://localhost:3100 ── data/.e2e/worker-0.db
 *   worker 1 ── http://localhost:3101 ── data/.e2e/worker-1.db
 *   worker 2 ── http://localhost:3102 ── data/.e2e/worker-2.db
 *   …
 *
 * Each worker:
 *   - Picks an isolated port + DB file from its `parallelIndex`.
 *   - Wipes its DB file, runs migrations, seeds the fixture.
 *   - Spawns its own `node .next/standalone/server.js` with `PORT` and
 *     `DATABASE_URL` env vars pointing at its own DB.
 *   - Polls the port until the server responds to /api/health.
 *   - Exposes the `baseURL` override + a `resetDb()` callback to tests.
 *   - SIGTERMs the server on worker teardown.
 *
 * The `next build` step still runs once in globalSetup — the standalone
 * output is the same for every worker; only the `DATABASE_URL` env var
 * differs at runtime.
 *
 * This pattern is what Playwright's docs call "worker-scoped fixtures"
 * (https://playwright.dev/docs/test-fixtures#worker-scoped-fixtures) and is
 * the canonical answer to "my e2e tests share global state with the server."
 */
type WorkerServer = {
  port: number
  baseURL: string
  dbPath: string
  resetDb: () => void
}

export const test = base.extend<
  { resetDb: () => void },
  { workerServer: WorkerServer }
>({
  workerServer: [
    async ({}, use, workerInfo) => {
      const index = workerInfo.parallelIndex
      const port = BASE_PORT + index
      const dbDir = path.resolve(PROJECT_ROOT, "data", ".e2e")
      const dbPath = path.resolve(dbDir, `worker-${index}.db`)

      fs.mkdirSync(dbDir, { recursive: true })

      // Wipe any leftover DB + WAL files from a previous run.
      for (const suffix of ["", "-wal", "-shm"]) {
        const f = dbPath + suffix
        if (fs.existsSync(f)) fs.unlinkSync(f)
      }

      // Migrate + seed using a separate connection (closed before the server
      // starts so the WAL is fully flushed and the server's connection sees a
      // clean state on first open).
      seedNewDb(dbPath)

      // Spawn the per-worker server. `detached: false` so SIGTERM from this
      // process kills it; `stdio: "ignore"` so the server's stdout doesn't
      // interleave with Playwright's reporter output.
      const child = spawn("node", [STANDALONE_SERVER], {
        env: {
          ...process.env,
          PORT: String(port),
          HOSTNAME: "127.0.0.1",
          NODE_ENV: "production",
          DATABASE_URL: dbPath,
        },
        stdio: "ignore",
        cwd: path.dirname(STANDALONE_SERVER),
      })

      // Wait for the server to respond. Timeout is generous because cold
      // boot of next-server can take a couple of seconds.
      await waitForPort(port, 30_000)

      const server: WorkerServer = {
        port,
        baseURL: `http://localhost:${port}`,
        dbPath,
        resetDb: () => resetWorkerDb(dbPath),
      }

      await use(server)

      // Teardown: SIGTERM then SIGKILL after a grace period.
      await stopChild(child)

      // Remove the DB files so the next run starts from a guaranteed empty
      // directory (matches the old `webServer.command` rm-and-recreate flow).
      for (const suffix of ["", "-wal", "-shm"]) {
        const f = dbPath + suffix
        if (fs.existsSync(f)) {
          try {
            fs.unlinkSync(f)
          } catch {
            /* best-effort cleanup */
          }
        }
      }
    },
    { scope: "worker", auto: true },
  ],

  baseURL: async ({ workerServer }, use) => {
    await use(workerServer.baseURL)
  },

  resetDb: async ({ workerServer }, use) => {
    await use(workerServer.resetDb)
  },
})

export { expect }

/**
 * Open a fresh SQLite connection, run migrations, write the seed fixture,
 * and close. Used at worker startup before the server's connection opens
 * for the first time.
 */
function seedNewDb(dbPath: string) {
  const sqlite = new Database(dbPath)
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  const db = drizzle(sqlite)
  const migrationsFolder = path.resolve(PROJECT_ROOT, "drizzle")
  migrate(db, { migrationsFolder })
  seedFixture(sqlite)
  sqlite.close()
}

/**
 * Reset the worker's own DB to the seed fixture. Called from `afterEach` in
 * any spec that mutates state. Because each worker owns its own DB file,
 * this is uncontended — no other worker can see or be affected by it.
 */
function resetWorkerDb(dbPath: string) {
  const sqlite = new Database(dbPath)
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")
  sqlite.pragma("busy_timeout = 10000")
  try {
    seedFixture(sqlite)
  } finally {
    sqlite.close()
  }
}

/**
 * Poll a TCP port until it accepts connections.
 */
async function waitForPort(port: number, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await isPortOpen(port)) {
      // The TCP listener may be ready before Next.js has finished mounting
      // its route table; double-check with a probe request.
      try {
        const res = await fetch(`http://127.0.0.1:${port}/api/health`)
        if (res.ok) return
      } catch {
        /* not ready yet */
      }
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(
    `Worker server on port ${port} did not respond within ${timeoutMs}ms`
  )
}

function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ port, host: "127.0.0.1" })
    socket.once("connect", () => {
      socket.end()
      resolve(true)
    })
    socket.once("error", () => resolve(false))
    socket.setTimeout(500, () => {
      socket.destroy()
      resolve(false)
    })
  })
}

function stopChild(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null) {
      resolve()
      return
    }
    const force = setTimeout(() => {
      try {
        child.kill("SIGKILL")
      } catch {
        /* already gone */
      }
      resolve()
    }, 5000)
    child.once("exit", () => {
      clearTimeout(force)
      resolve()
    })
    try {
      child.kill("SIGTERM")
    } catch {
      clearTimeout(force)
      resolve()
    }
  })
}
