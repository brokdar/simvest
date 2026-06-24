import { defineConfig } from "vitest/config"
import nextEnv from "@next/env"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

nextEnv.loadEnvConfig(__dirname)

export default defineConfig({
  resolve: {
    tsconfigPaths: true,
    alias: {
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    exclude: ["**/node_modules/**", "**/.next/**", "tests/e2e/**"],
    environment: "node",
    globals: false,
    pool: "forks",
    setupFiles: ["tests/setup.ts"],
    clearMocks: true,
    restoreMocks: true,
    reporters: ["default"],
  },
})
