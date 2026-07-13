import { test, expect } from '@playwright/test'

/**
 * /api/data/* and /api/migrate/* showcase fail-closed
 *
 * Default dev server (port 3000) has no NEXT_PUBLIC_APP_MODE set,
 * so isShowcaseMode=true and isStorageEnabled=false.
 * All /api/data/* and /api/migrate/* routes must return 404.
 *
 * Runs on chromium project (port 3000, default).
 */

test.describe('/api/data/* showcase fail-closed', () => {
  test('GET /api/data/status returns 404', async ({ request }) => {
    const res = await request.get('/api/data/status')
    expect(res.status()).toBe(404)
  })

  test('GET /api/data/bulk returns 404', async ({ request }) => {
    const res = await request.get('/api/data/bulk')
    expect(res.status()).toBe(404)
  })

  test('GET /api/data/alc:test returns 404', async ({ request }) => {
    const res = await request.get('/api/data/alc:test')
    expect(res.status()).toBe(404)
  })

  test('PUT /api/data/alc:test returns 404', async ({ request }) => {
    const res = await request.put('/api/data/alc:test', {
      data: '"test-value"',
      headers: { 'Content-Type': 'text/plain' },
    })
    expect(res.status()).toBe(404)
  })

  test('DELETE /api/data/alc:test returns 404', async ({ request }) => {
    const res = await request.delete('/api/data/alc:test')
    expect(res.status()).toBe(404)
  })

  test('POST /api/data/flush returns 404', async ({ request }) => {
    const res = await request.post('/api/data/flush')
    expect(res.status()).toBe(404)
  })

  test('POST /api/data/clear returns 404', async ({ request }) => {
    const res = await request.post('/api/data/clear')
    expect(res.status()).toBe(404)
  })

  test('GET /api/data/export returns 404', async ({ request }) => {
    const res = await request.get('/api/data/export')
    expect(res.status()).toBe(404)
  })

  test('POST /api/data/import returns 404', async ({ request }) => {
    const res = await request.post('/api/data/import', {
      data: '{}',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status()).toBe(404)
  })

  test('POST /api/data/restore returns 404', async ({ request }) => {
    const res = await request.post('/api/data/restore?confirm=true', {
      data: '{}',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status()).toBe(404)
  })
})

test.describe('/api/migrate/* showcase fail-closed', () => {
  test('POST /api/migrate/session returns 404', async ({ request }) => {
    const res = await request.post('/api/migrate/session', {
      data: { sourceFingerprint: 'test', totalEntries: 0 },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status()).toBe(404)
  })

  test('POST /api/migrate/staging returns 404', async ({ request }) => {
    const res = await request.post('/api/migrate/staging', {
      data: { sessionId: 'test', entries: [] },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status()).toBe(404)
  })

  test('POST /api/migrate/commit returns 404', async ({ request }) => {
    const res = await request.post('/api/migrate/commit', {
      data: { sessionId: 'test' },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status()).toBe(404)
  })

  test('POST /api/migrate/cancel returns 404', async ({ request }) => {
    const res = await request.post('/api/migrate/cancel', {
      data: { sessionId: 'test' },
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status()).toBe(404)
  })

  test('POST /api/migrate/source-snapshot returns 404', async ({ request }) => {
    const res = await request.post('/api/migrate/source-snapshot', {
      data: '{}',
      headers: { 'Content-Type': 'application/json' },
    })
    expect(res.status()).toBe(404)
  })
})
