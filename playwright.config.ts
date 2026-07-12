import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E configuration
 *
 * Two projects:
 *   - chromium (default): runs against production mode dev server (port 3000)
 *   - chromium-showcase: runs against showcase mode dev server (port 3001)
 *
 * Tests live in the e2e/ directory.
 * Showcase tests are in e2e/showcase/ and tagged with test.describe.serial.
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
      command: 'bun run dev',
      url: 'http://localhost:3000',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
    },
  ],
})
