import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import path from "node:path"
import fs from "node:fs"
import { fileURLToPath } from "node:url"
import { E2E_DIST_DIR } from "./dist-dir"

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
  const dotNext = path.resolve(PROJECT_ROOT, E2E_DIST_DIR)
  const standalone = path.resolve(dotNext, "standalone", "server.js")
  const e2eDir = path.resolve(PROJECT_ROOT, "data", ".e2e")

  // Wipe per-worker DBs from previous sessions so spawn() doesn't see
  // stale files. The fixture also does this defensively but doing it here
  // means a Ctrl-C in the middle of a run leaves no orphan state.
  if (fs.existsSync(e2eDir)) fs.rmSync(e2eDir, { recursive: true, force: true })
  fs.mkdirSync(e2eDir, { recursive: true })

  // E2E_SKIP_BUILD=1 reuses whatever standalone exists, unconditionally.
  if (process.env.E2E_SKIP_BUILD === "1" && fs.existsSync(standalone)) return

  // Otherwise skip only if the build inputs are unchanged since the last
  // build — editing specs alone never rebuilds. E2E_FORCE_BUILD=1 rebuilds.
  const stampFile = path.resolve(dotNext, "build-inputs.sha256")
  const inputsHash = hashBuildInputs()
  if (
    process.env.E2E_FORCE_BUILD !== "1" &&
    fs.existsSync(standalone) &&
    fs.existsSync(stampFile) &&
    fs.readFileSync(stampFile, "utf8") === inputsHash
  ) {
    console.error("[e2e] build inputs unchanged — reusing " + E2E_DIST_DIR)
    return
  }

  // Otherwise wipe + build.
  if (fs.existsSync(dotNext))
    fs.rmSync(dotNext, { recursive: true, force: true })

  runOrThrow("bun", ["run", "next", "build"], {
    NEXT_DIST_DIR: E2E_DIST_DIR,
    NEXT_TSCONFIG_PATH: "tsconfig.e2e.json",
    NEXT_SKIP_TYPECHECK: "1",
  })

  // The standalone output doesn't include static assets or public/ — copy
  // them in so the spawned server can serve them.
  const staticSrc = path.resolve(dotNext, "static")
  const staticDst = path.resolve(dotNext, "standalone", E2E_DIST_DIR, "static")
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

  // Written last, so a failed or interrupted build never looks reusable.
  fs.writeFileSync(stampFile, inputsHash)
}

// Everything `next build` reads. Tests are deliberately not inputs.
const BUILD_INPUT_DIRS = [
  "app",
  "components",
  "hooks",
  "lib",
  "public",
  "drizzle",
]
const BUILD_INPUT_FILES = [
  "package.json",
  "bun.lock",
  "next.config.mjs",
  "tsconfig.json",
  "postcss.config.mjs",
  "components.json",
]

function hashBuildInputs(): string {
  const files = [...BUILD_INPUT_FILES]
  for (const name of fs.readdirSync(PROJECT_ROOT)) {
    if (name.startsWith(".env")) files.push(name)
  }
  for (const dir of BUILD_INPUT_DIRS) {
    const abs = path.resolve(PROJECT_ROOT, dir)
    if (!fs.existsSync(abs)) continue
    for (const entry of fs.readdirSync(abs, {
      recursive: true,
      withFileTypes: true,
    })) {
      if (entry.isFile())
        files.push(
          path.relative(PROJECT_ROOT, path.join(entry.parentPath, entry.name))
        )
    }
  }
  const hash = createHash("sha256")
  for (const rel of files.sort()) {
    const abs = path.resolve(PROJECT_ROOT, rel)
    if (!fs.existsSync(abs)) continue
    hash.update(rel + "\0")
    hash.update(fs.readFileSync(abs))
    hash.update("\0")
  }
  return hash.digest("hex")
}

function runOrThrow(
  cmd: string,
  args: string[],
  extraEnv: Record<string, string> = {}
) {
  // Redirect both stdout and stderr to OUR stderr — the JSON reporter writes
  // to stdout, so any build output landing there corrupts the report file.
  const result = spawnSync(cmd, args, {
    cwd: PROJECT_ROOT,
    stdio: ["ignore", process.stderr, process.stderr],
    env: { ...process.env, ...extraEnv },
  })
  if (result.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} exited with code ${result.status}`
    )
  }
}
