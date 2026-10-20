// e2e builds into its own Next.js distDir so a test run never wipes the
// `.next` a running `npm run dev` is serving from. next.config.mjs reads
// NEXT_DIST_DIR; global-setup.ts builds with it and fixtures.ts spawns from it.
export const E2E_DIST_DIR = ".next-e2e"
