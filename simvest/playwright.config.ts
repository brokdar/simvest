import { defineConfig, devices } from "@playwright/test"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isCI = !!process.env.CI

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // Each worker spawns its own next.js server (~250 MB) + its own SQLite
  // file via `tests/e2e/fixtures.ts`. Cap workers so total memory stays
  // sane; CI can override to 1 for determinism.
  workers: isCI ? 1 : 4,
  reporter: [["html", { open: isCI ? "never" : "on-failure" }], ["list"]],
  // Builds the standalone next.js server ONCE. The per-worker fixture in
  // `tests/e2e/fixtures.ts` then spawns one instance of it per worker with
  // a unique PORT + DATABASE_URL. There is no `webServer` block — each
  // worker is responsible for its own server lifecycle.
  globalSetup: path.resolve(__dirname, "tests/e2e/global-setup.ts"),
  // Tightened from 15s — with no cross-worker DB contention, the most
  // expensive assertion (first-paint visibility) consistently lands well
  // under 5s. Leaving headroom at 10s for cold-server requests.
  expect: { timeout: 10_000 },
  timeout: 60_000,
  use: {
    // baseURL is provided per-worker by the `workerServer` fixture.
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    // Pin locale so locale-sensitive formatting (MoneyInput, MonthYearPicker)
    // renders deterministically across machines.
    locale: "en-US",
  },
  projects: [
    {
      name: "chromium-desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile-safari",
      use: { ...devices["iPhone 15 Pro"] },
    },
  ],
})
