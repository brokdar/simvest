import { spawnSync } from "node:child_process"
import path from "node:path"
import fs from "node:fs"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, "..", "..")

/**
 * Playwright global setup.
 *
 * Builds the next.js standalone output once per session. The per-worker
 * fixture in `tests/e2e/fixtures.ts` then spawns one server instance per
 * worker, each with its own SQLite DB. This replaces the old `webServer`
 * config, which started a single shared server + DB and was the source of
 * every parallel-mode race we've ever seen.
 *
 * Per-worker DBs (`data/.e2e/worker-N.db`) are created and torn down by the
 * fixture itself; this setup does not touch them.
 */
export default async function globalSetup() {
  const dotNext = path.resolve(PROJECT_ROOT, ".next")
  const standalone = path.resolve(dotNext, "standalone", "server.js")
  const e2eDir = path.resolve(PROJECT_ROOT, "data", ".e2e")

  // Wipe per-worker DBs from previous sessions so spawn() doesn't see
  // stale files. The fixture also does this defensively but doing it here
  // means a Ctrl-C in the middle of a run leaves no orphan state.
  if (fs.existsSync(e2eDir)) fs.rmSync(e2eDir, { recursive: true, force: true })
  fs.mkdirSync(e2eDir, { recursive: true })

  // Skip the build if a fresh standalone already exists (set
  // E2E_SKIP_BUILD=1 for warm dev iteration; CI / first runs build clean).
  if (process.env.E2E_SKIP_BUILD === "1" && fs.existsSync(standalone)) return

  // Otherwise wipe + build.
  if (fs.existsSync(dotNext))
    fs.rmSync(dotNext, { recursive: true, force: true })

  runOrThrow("npx", ["next", "build"])

  // The standalone output doesn't include static assets or public/ — copy
  // them in so the spawned server can serve them.
  const staticSrc = path.resolve(dotNext, "static")
  const staticDst = path.resolve(dotNext, "standalone", ".next", "static")
  if (fs.existsSync(staticSrc))
    fs.cpSync(staticSrc, staticDst, { recursive: true })

  const publicSrc = path.resolve(PROJECT_ROOT, "public")
  const publicDst = path.resolve(dotNext, "standalone", "public")
  if (fs.existsSync(publicSrc))
    fs.cpSync(publicSrc, publicDst, { recursive: true })

  if (!fs.existsSync(standalone)) {
    throw new Error(
      `Expected ${standalone} after next build, but it does not exist`
    )
  }
}

function runOrThrow(cmd: string, args: string[]) {
  // Redirect both stdout and stderr to OUR stderr — the JSON reporter writes
  // to stdout, so any build output landing there corrupts the report file.
  const result = spawnSync(cmd, args, {
    cwd: PROJECT_ROOT,
    stdio: ["ignore", process.stderr, process.stderr],
    env: process.env,
  })
  if (result.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} exited with code ${result.status}`
    )
  }
}
