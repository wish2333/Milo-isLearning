import { test, expect } from '@playwright/test'

/**
 * Production storage layer infrastructure smoke
 *
 * Skipped by default. Enable with E2E_PRODUCTION_MODE=true.
 *
 * Prerequisites:
 *   1. Start production dev server:
 *      NEXT_PUBLIC_APP_MODE=production ALC_STORAGE_BACKEND=sqlite bun run dev
 *   2. Run:
 *      E2E_PRODUCTION_MODE=true bunx playwright test e2e/storage-layer.spec.ts --project=chromium
 */

const PRODUCTION_MODE = process.env.E2E_PRODUCTION_MODE === 'true'

test.describe('Production storage layer', () => {
  test.skip(!PRODUCTION_MODE, 'Requires E2E_PRODUCTION_MODE=true')

  test('GET /api/data/status returns enabled:true', async ({ request }) => {
    const res = await request.get('/api/data/status')
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(body.enabled).toBe(true)
    expect(body.schemaVersion).toBe(1)
    expect(body.stats).toBeDefined()
  })

  test('PUT + GET + DELETE /api/data/alc:e2e-test round-trip', async ({ request }) => {
    // PUT
    const putRes = await request.put('/api/data/alc:e2e-test', {
      data: '"e2e-test-value"',
      headers: { 'Content-Type': 'text/plain' },
    })
    expect(putRes.status()).toBe(204)

    // GET
    const getRes = await request.get('/api/data/alc:e2e-test')
    expect(getRes.status()).toBe(200)
    const body = await getRes.text()
    expect(body).toBe('"e2e-test-value"')

    // DELETE
    const delRes = await request.delete('/api/data/alc:e2e-test')
    expect(delRes.status()).toBe(204)

    // Second GET should 404
    const getRes2 = await request.get('/api/data/alc:e2e-test')
    expect(getRes2.status()).toBe(404)
  })

  test('GET /api/data/bulk returns entries array', async ({ request }) => {
    const res = await request.get('/api/data/bulk')
    expect(res.ok()).toBe(true)
    const body = await res.json()
    expect(Array.isArray(body.entries)).toBe(true)
    expect(typeof body.revision).toBe('number')
    expect(body.stats).toBeDefined()
  })

  test('PUT with non-alc: key returns 400', async ({ request }) => {
    const res = await request.put('/api/data/evil-key', {
      data: '"bad"',
      headers: { 'Content-Type': 'text/plain' },
    })
    expect(res.status()).toBe(400)
  })

  test('GET non-existent alc: key returns 404', async ({ request }) => {
    const res = await request.get('/api/data/alc:nonexistent-key-12345')
    expect(res.status()).toBe(404)
  })

  test('POST /api/data/restore without ?confirm=true returns 400', async ({ request }) => {
    const res = await request.post('/api/data/restore', {
      data: '{}',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status()).toBe(400)
  })

  test('GET /api/data/export returns valid BackupPackage', async ({ request }) => {
    const res = await request.get('/api/data/export')
    expect(res.ok()).toBe(true)
    const exported = await res.json()
    expect(exported.version).toBe(1)
    expect(exported.meta.checksum).toMatch(/^[a-f0-9]{64}$/)
    expect(Array.isArray(exported.entries)).toBe(true)
  })

  test('AppShell renders main app after loading in production mode', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('body')).not.toBeEmpty({ timeout: 15000 })
  })
})
