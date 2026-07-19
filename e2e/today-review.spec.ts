import { expect, test } from '@playwright/test'

import { mockModule } from './fixtures/mock-module'

test.describe('Today review', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((moduleData) => {
      const now = Date.now()
      localStorage.setItem(
        `alc:module:${moduleData.id}`,
        JSON.stringify({ ...moduleData, origin: 'showcase' }),
      )
      localStorage.setItem(
        'alc:settings',
        JSON.stringify({
          state: {
            config: null,
            availableKeys: null,
            confirmReviewEnabled: true,
            fsrs: { enabled: true, requestRetention: 0.9, maximumInterval: 365 },
          },
          version: 0,
        }),
      )
      localStorage.setItem(
        `alc:schedule:${moduleData.concepts[0].quizSeries.quizzes[0].id}`,
        JSON.stringify({
          slotId: moduleData.concepts[0].quizSeries.quizzes[0].id,
          moduleId: moduleData.id,
          conceptId: moduleData.concepts[0].id,
          stability: 1,
          difficulty: 5,
          elapsed_days: 0,
          scheduled_days: 0,
          reps: 1,
          lapses: 0,
          state: 'review',
          due: new Date(now - 1000).toISOString(),
          last_review: new Date(now - 60_000).toISOString(),
          schemaVersion: 1,
          contentRevision: 'e2e',
          configRevision: 'e2e',
          lastAppliedAttemptId: 'e2e',
        }),
      )
    }, mockModule)
  })

  test('shows due queue and persists entry into today review', async ({ page }) => {
    await page.goto('/learn/today')
    await expect(page.getByRole('heading', { name: '今日复习' })).toBeVisible()
    await expect(page.getByText('今日到期')).toBeVisible()
    await expect(page.getByRole('button', { name: /开始今日复习/ })).toBeVisible()

    await page.getByRole('button', { name: /开始今日复习/ }).click()
    await page.waitForURL('**/learn/today/review')
    await expect(page.getByText('1 / 1')).toBeVisible()
    await expect(page.getByText('核心概念的定义')).toBeVisible()
  })
})
