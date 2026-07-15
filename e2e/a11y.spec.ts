import AxeBuilder from '@axe-core/playwright'
import { test, expect } from '@playwright/test'

test.describe('a11y', () => {
  test('home page has no critical violations', async ({ page }) => {
    await page.goto('/')
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.filter((v) => v.impact === 'critical')).toHaveLength(0)
  })

  test('library page has no critical violations', async ({ page }) => {
    await page.goto('/learn/library')
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.filter((v) => v.impact === 'critical')).toHaveLength(0)
  })

  test('settings page has no critical violations', async ({ page }) => {
    await page.goto('/settings')
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.filter((v) => v.impact === 'critical')).toHaveLength(0)
  })
})
