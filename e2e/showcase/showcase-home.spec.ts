import { test, expect } from '@playwright/test'

// This test file requires NEXT_PUBLIC_APP_MODE=showcase
// The playwright.config.ts configures the showcase project to run these tests

test.describe('Showcase Home', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to showcase home
    await page.goto('/')
  })

  test('renders showcase home with module and topic cards', async ({ page }) => {
    // Wait for manifest to load
    await expect(page.locator('text=加载中...')).toBeHidden({ timeout: 10000 })

    // Verify showcase home renders
    await expect(page.locator('text=AI Learning Compiler')).toBeVisible()
    await expect(page.locator('text=模拟编译')).toBeVisible()

    // Verify module cards render
    await expect(page.locator('text=毛泽东工作方法')).toBeVisible()
    await expect(page.locator('text=开始学习')).toBeVisible()

    // Verify topic cards render
    await expect(page.locator('text=资本论导读')).toBeVisible()
    await expect(page.locator('text=体验主题学习')).toBeVisible()

    // Verify Studio link
    await expect(page.locator('text=访问完整版')).toBeVisible()
  })

  test('clicking module card loads module into localStorage and navigates to learn page', async ({
    page,
  }) => {
    // Wait for manifest to load
    await expect(page.locator('text=加载中...')).toBeHidden({ timeout: 10000 })

    // Click module card
    await page.locator('text=开始学习').click()

    // Should navigate to learn page
    await expect(page).toHaveURL(/\/learn\/module\//, { timeout: 10000 })

    // Module should be loaded into localStorage
    const moduleData = await page.evaluate(() => {
      const stored = localStorage.getItem('alc:current-module')
      return stored ? JSON.parse(stored) : null
    })
    expect(moduleData).toBeTruthy()
    expect(moduleData.id).toBe('mao-work-methods')
  })

  test('clicking topic card loads topic into localStorage and starts topic session', async ({
    page,
  }) => {
    // Wait for manifest to load
    await expect(page.locator('text=加载中...')).toBeHidden({ timeout: 10000 })

    // Click topic card
    await page.locator('text=体验主题学习').click()

    // Should navigate to learn page for first module in topic
    await expect(page).toHaveURL(/\/learn\/module\//, { timeout: 10000 })

    // Topic session should be started
    const topicSession = await page.evaluate(() => {
      const stored = localStorage.getItem('alc:topic-session')
      return stored ? JSON.parse(stored) : null
    })
    expect(topicSession).toBeTruthy()
    expect(topicSession.topicId).toBe('das-kapital-intro')
  })

  test('clicking "访问完整版" navigates to /studio', async ({ page }) => {
    // Wait for manifest to load
    await expect(page.locator('text=加载中...')).toBeHidden({ timeout: 10000 })

    // Click Studio link
    await page.locator('text=访问完整版').click()

    // Should navigate to /studio
    await expect(page).toHaveURL(/\/studio/, { timeout: 10000 })
  })

  test('dedup: clicking same module card twice does not duplicate in localStorage', async ({
    page,
  }) => {
    // Wait for manifest to load
    await expect(page.locator('text=加载中...')).toBeHidden({ timeout: 10000 })

    // Click module card first time
    await page.locator('text=开始学习').click()
    await expect(page).toHaveURL(/\/learn\/module\//, { timeout: 10000 })

    // Go back to showcase home
    await page.goto('/')
    await expect(page.locator('text=加载中...')).toBeHidden({ timeout: 10000 })

    // Click same module card again
    await page.locator('text=开始学习').click()
    await expect(page).toHaveURL(/\/learn\/module\//, { timeout: 10000 })

    // Module should still be in localStorage (not duplicated)
    const moduleData = await page.evaluate(() => {
      const stored = localStorage.getItem('alc:current-module')
      return stored ? JSON.parse(stored) : null
    })
    expect(moduleData).toBeTruthy()
    expect(moduleData.id).toBe('mao-work-methods')
  })

  test('dedup: clicking same topic card twice does not duplicate in localStorage', async ({
    page,
  }) => {
    // Wait for manifest to load
    await expect(page.locator('text=加载中...')).toBeHidden({ timeout: 10000 })

    // Click topic card first time
    await page.locator('text=体验主题学习').click()
    await expect(page).toHaveURL(/\/learn\/module\//, { timeout: 10000 })

    // Go back to showcase home
    await page.goto('/')
    await expect(page.locator('text=加载中...')).toBeHidden({ timeout: 10000 })

    // Click same topic card again
    await page.locator('text=体验主题学习').click()
    await expect(page).toHaveURL(/\/learn\/module\//, { timeout: 10000 })

    // Topic session should still be in localStorage (not duplicated)
    const topicSession = await page.evaluate(() => {
      const stored = localStorage.getItem('alc:topic-session')
      return stored ? JSON.parse(stored) : null
    })
    expect(topicSession).toBeTruthy()
    expect(topicSession.topicId).toBe('das-kapital-intro')
  })
})
