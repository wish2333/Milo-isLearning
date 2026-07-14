import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E configuration
 *
 * Two projects:
 *   - chromium (default, @3000): runs against showcase dev server by default.
 *     Most tests (smoke/library/topic/api-data) are designed for showcase mode
 *     (api-data asserts fail-closed 404 on /api/data/*).
 *   - chromium-showcase (@3001): runs against a second showcase dev server.
 *     Showcase-only tests live in e2e/showcase/ and are matched by testMatch.
 *
 * Production storage-layer tests (e2e/storage-layer.spec.ts) self-skip unless
 * E2E_PRODUCTION_MODE=true. To run them:
 *   1. Start a production server manually in a separate terminal:
 *      $env:NEXT_PUBLIC_APP_MODE='production'; $env:ALC_STORAGE_BACKEND='sqlite'; bun run dev
 *      (or: NEXT_PUBLIC_APP_MODE=production ALC_STORAGE_BACKEND=sqlite bun run dev)
 *   2. In another terminal, target ONLY storage-layer:
 *      $env:E2E_PRODUCTION_MODE='true'; bunx playwright test e2e/storage-layer.spec.ts --project=chromium
 *   Note: when @3000 is in production mode, api-data tests (which assert 404)
 *   will fail — that's expected; run them in the default showcase pass instead.
 *
 * Tests live in the e2e/ directory.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: 'list',
  timeout: 60000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-showcase',
      use: { ...devices['Desktop Chrome'], baseURL: 'http://localhost:3001' },
      testMatch: /showcase/,
    },
  ],
  webServer: [
    {
      // @3000 — defaults to showcase mode so api-data/library/topic tests
      // (which assert showcase fail-closed behaviour) pass.
      // .env.local may set NEXT_PUBLIC_APP_MODE=production for dev work;
      // process.env explicitly set here OVERRIDES .env.local per Next.js rules.
      // When E2E_PRODUCTION_MODE=true, leave env undefined so .env.local's
      // production config takes effect (user runs only storage-layer then).
      command: 'bun run dev',
      env:
        process.env.E2E_PRODUCTION_MODE === 'true'
          ? undefined
          : { NEXT_PUBLIC_APP_MODE: 'showcase', ALC_STORAGE_BACKEND: '' },
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
    {
      // @3001 — always showcase mode (second Next.js instance).
      // Next.js dev obeys the PORT env, so this overrides the default 3000.
      command: 'bun run dev',
      env: { NEXT_PUBLIC_APP_MODE: 'showcase', ALC_STORAGE_BACKEND: '', PORT: '3001' },
      url: 'http://localhost:3001',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
})
