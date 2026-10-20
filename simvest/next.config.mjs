/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // e2e builds into its own dir (see tests/e2e/global-setup.ts) so a test run
  // never clobbers the `.next` a running dev server is serving from.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // …and type-checks with a tsconfig that ignores the dev server's generated
  // `.next/dev/types`, which can be mid-rewrite while dev is running. e2e
  // sets NEXT_SKIP_TYPECHECK=1: `bun run typecheck` (verify, pre-commit)
  // already covers it, and skipping halves an e2e rebuild (9.2 → 5.0 s).
  typescript: {
    tsconfigPath: process.env.NEXT_TSCONFIG_PATH || "tsconfig.json",
    ignoreBuildErrors: process.env.NEXT_SKIP_TYPECHECK === "1",
  },
  // better-sqlite3 is a native module; do not let Webpack bundle it.
  serverExternalPackages: ["better-sqlite3"],
  // Ensure migration files reach the standalone bundle so migrate() can find them.
  outputFileTracingIncludes: {
    "/": ["./drizzle/**/*"],
  },
  experimental: {
    // Defer route module loading until first request — trades cold-start
    // latency for a smaller initial heap (important on low-RAM hardware).
    preloadEntriesOnStart: false,
  },
  async redirects() {
    // /simulation was merged into the goal planner, which now lives at
    // /goals (it was /planning); /chart was renamed to /projection and
    // /dividends to /income. These redirects exist for stale bookmarks only.
    return [
      { source: "/planning", destination: "/goals", permanent: true },
      { source: "/simulation", destination: "/goals", permanent: true },
      { source: "/chart", destination: "/projection", permanent: true },
      { source: "/dividends", destination: "/income", permanent: true },
    ]
  },
}

export default nextConfig
