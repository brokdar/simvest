/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
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
    // /goals and /simulation were merged into /planning; /dividends was
    // renamed to /income. These redirects exist for stale bookmarks only.
    return [
      { source: "/goals", destination: "/planning", permanent: true },
      { source: "/simulation", destination: "/planning", permanent: true },
      { source: "/dividends", destination: "/income", permanent: true },
    ]
  },
}

export default nextConfig
