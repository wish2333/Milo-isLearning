import { expect, test } from '@playwright/test'

import { mockModule } from './fixtures/mock-module'

test.describe('SearchDialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((moduleData) => {
      sessionStorage.setItem(
        'alc:runtime-mode',
        JSON.stringify({ state: { studioMode: true }, version: 0 }),
      )
      localStorage.setItem(`alc:module:${moduleData.id}`, JSON.stringify(moduleData))
    }, mockModule)
  })

  test('opens from the global shortcut and searches stored module content', async ({ page }) => {
    await page.goto('/learn/library')
    await page.keyboard.press('Control+k')

    const dialog = page.getByRole('dialog', { name: '搜索题库' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('searchbox').fill('核心概念')
    await expect(dialog.getByRole('option').first()).toContainText('测试模块')
    await expect(dialog.getByRole('option').first()).toContainText('核心概念')
  })
})
