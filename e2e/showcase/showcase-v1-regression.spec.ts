import { test, expect } from '@playwright/test'

/**
 * v1.0.0 showcase zero-regression
 *
 * v1.0.0 introduced AppShell / StorageInitializer / MigrationOrchestrator
 * infrastructure. In showcase mode these must all be no-op so existing
 * behaviour is preserved.
 *
 * Runs on chromium-showcase project (port 3001) via testMatch: /showcase/.
 */

test.describe('v1.0.0 showcase zero-regression', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('text=加载中...')).toBeHidden({ timeout: 10000 })
  })

  test('AppShell does not render StorageLoading skeleton', async ({ page }) => {
    // showcase mode AppShell returns <>{children}</>, no loading state
    await expect(page.locator('text=正在加载本地学习数据')).toBeHidden()
    await expect(page.locator('[role="status"]')).toHaveCount(0)
  })

  test('AppShell does not render StorageError page', async ({ page }) => {
    await expect(page.locator('text=无法加载本地学习数据')).toBeHidden()
    await expect(page.locator('[role="alert"]')).toHaveCount(0)
  })

  test('StorageStatus overlay does not render in showcase mode', async ({ page }) => {
    // StorageStatus useEffect early-returns in showcase, no setInterval registered
    await expect(page.locator('text=正在保存')).toBeHidden()
    await expect(page.locator('text=保存失败')).toBeHidden()
    await expect(page.locator('text=未保存数据')).toBeHidden()
  })

  test('MigrationOrchestrator does not trigger migration prompt', async ({ page }) => {
    // Even if localStorage has old alc:* keys, showcase mode must not prompt
    await expect(page.locator('text=检测到旧版数据')).toBeHidden()
    await expect(page.locator('text=立即迁移')).toBeHidden()
  })

  test('Zustand stores still use localStorage in showcase mode', async ({ page }) => {
    // Write to localStorage, reload, verify data persists (LocalStorage path, not ClientFetch)
    await page.evaluate(() => {
      localStorage.setItem(
        'alc:settings',
        JSON.stringify({
          state: { config: { provider: 'test-provider', apiKey: 'k', model: 'm' } },
          version: 0,
        }),
      )
    })

    await page.reload()
    await expect(page.locator('text=加载中...')).toBeHidden({ timeout: 10000 })

    const settings = await page.evaluate(() => localStorage.getItem('alc:settings'))
    expect(settings).toBeTruthy()
    const parsed = JSON.parse(settings!) as { state: { config: { provider: string } } }
    expect(parsed.state.config.provider).toBe('test-provider')

    // cleanup
    await page.evaluate(() => localStorage.removeItem('alc:settings'))
  })

  test('showcase mode does not issue /api/data/* or /api/migrate/* requests', async ({ page }) => {
    const dataRequests: string[] = []
    page.on('request', (req) => {
      if (req.url().includes('/api/data/') || req.url().includes('/api/migrate/')) {
        dataRequests.push(req.url())
      }
    })

    await page.goto('/')
    await expect(page.locator('text=加载中...')).toBeHidden({ timeout: 10000 })
    await page.waitForTimeout(1000)

    expect(dataRequests).toEqual([])
  })
})
