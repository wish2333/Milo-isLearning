/**
 * E2E Smoke Test - Full learning flow happy path
 *
 * Strategy: Pre-load Module data in localStorage, skip SSE compile.
 * Focus on UI interaction chain: overview -> concept -> feynman -> done.
 */

import { test, expect, type Page, type Route } from '@playwright/test'

import {
  mockModule,
  mockFeedbackPass,
  mockFeedbackFail,
  mockFeedbackPassAfterRetry,
  mockReplacementQuiz,
  mockFeynmanEval,
} from './fixtures/mock-module'

async function mockFeedbackAPI(page: Page) {
  let callCount = 0
  await page.route('**/api/feedback', async (route: Route) => {
    callCount++
    const response =
      callCount === 2
        ? mockFeedbackFail
        : callCount === 3
          ? mockFeedbackPassAfterRetry
          : mockFeedbackPass
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(response),
    })
  })
}

async function mockRegenerateAPI(page: Page) {
  await page.route('**/api/regenerate', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ quiz: mockReplacementQuiz }),
    })
  })
}

async function mockFeynmanEvalAPI(page: Page) {
  await page.route('**/api/feynman-eval', async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockFeynmanEval),
    })
  })
}

test.describe('Learning flow smoke test', () => {
  test.beforeEach(async ({ page }) => {
    // Inject ALL localStorage data via addInitScript (runs before any page JS)
    // so Zustand persist hydrates synchronously during store creation
    await page.addInitScript((moduleData) => {
      localStorage.setItem(
        'alc:settings',
        JSON.stringify({
          state: { config: { provider: 'deepseek', apiKey: 'test-key', model: 'test-model' } },
          version: 0,
        }),
      )
      localStorage.setItem(
        'alc:state:module',
        JSON.stringify({
          state: { currentModule: moduleData, currentQuiz: null },
          version: 0,
        }),
      )
      localStorage.setItem(
        'alc:state:progress',
        JSON.stringify({
          state: {
            moduleId: moduleData.id,
            stage: { kind: 'module_intro' },
            updatedAt: Date.now(),
            feynmanAttempt: null,
          },
          version: 0,
        }),
      )
      localStorage.setItem(
        'alc:state:attempts',
        JSON.stringify({
          state: { attemptsBySlot: {} },
          version: 0,
        }),
      )
      localStorage.setItem(`alc:module:${moduleData.id}`, JSON.stringify(moduleData))
    }, mockModule)

    await mockFeedbackAPI(page)
    await mockRegenerateAPI(page)
    await mockFeynmanEvalAPI(page)
  })

  test('overview -> concept (pass + retry) -> feynman 6 steps -> done', async ({ page }) => {
    // Navigate directly to overview — localStorage already has module data
    await page.goto('/learn/overview')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('h1')).toContainText('测试模块', { timeout: 10000 })

    // Use locator that resolves fresh after hydration
    await page.locator('button:has-text("开始学习")').first().click()
    await page.waitForURL('**/learn/module/**', { timeout: 5000 })

    await expect(page.locator('text=导言')).toBeVisible({ timeout: 5000 })
    await page.waitForTimeout(500)
    await page.locator('button:has-text("开始学习")').first().click()

    await expect(page.locator('text=下面哪一项是核心概念的定义？')).toBeVisible({ timeout: 5000 })
    await page.locator('button:has-text("正确答案")').click()
    await page.locator('button:has-text("确认选择")').click()
    await expect(page.locator('text=答对！继续保持这个节奏。')).toBeVisible({ timeout: 5000 })
    await page.locator('button:has-text("继续")').click()

    await expect(page.locator('text=核心概念的关键要点')).toBeVisible({ timeout: 5000 })
    await page.locator('button:has-text("要点三")').click()
    await page.locator('button:has-text("确认选择")').click()
    await expect(page.locator('text=再试一题，重点看解析里的关键关系。')).toBeVisible({
      timeout: 5000,
    })
    await expect(page.getByText('解析', { exact: true })).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=下一步安排')).toBeVisible({ timeout: 5000 })
    await page.locator('button:has-text("继续下一步")').click()

    await expect(page.locator('text=费曼任务')).toBeVisible({ timeout: 5000 })
    await page.locator('button:has-text("开始费曼练习")').click()

    const stepAnswers = ['正确领域', '主要用途', '关键特征', '准确描述']
    for (let step = 1; step <= 4; step++) {
      await expect(page.locator(`text=费曼步骤${step}`)).toBeVisible({ timeout: 5000 })
      await page.locator(`button:has-text("${stepAnswers[step - 1]}")`).click()
      await page.locator('button:has-text("确认选择")').click()
      await page.locator('button:has-text("下一步")').click()
    }

    await expect(page.locator('text=费曼步骤5')).toBeVisible({ timeout: 5000 })
    await page.locator('input[type="text"]').fill('关键术语')
    await page.locator('button:has-text("确认答案")').click()
    await page.locator('button:has-text("进入最终任务")').click()

    await expect(page.locator('text=费曼最终任务')).toBeVisible({ timeout: 5000 })
    const output = '核心概念是将离散信息映射到连续空间的方法。'.repeat(6)
    await page.locator('textarea').fill(output)
    await page.locator('button:has-text("提交评估")').click()

    await expect(page.locator('text=费曼得分')).toBeVisible({ timeout: 10000 })
    await page.locator('button:has-text("完成学习")').click()

    await page.waitForURL('**/learn/done', { timeout: 5000 })
    await expect(page.locator('text=学习完成')).toBeVisible()
    await expect(page.locator('h1')).toContainText('测试模块')
    await expect(page.locator('text=模块完成度')).toBeVisible()
  })
})

test.describe('ChoiceQuiz three-state visual feedback (V2.1.2)', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((moduleData) => {
      localStorage.setItem(
        'alc:settings',
        JSON.stringify({
          state: { config: { provider: 'deepseek', apiKey: 'test-key', model: 'test-model' } },
          version: 0,
        }),
      )
      localStorage.setItem(
        'alc:state:module',
        JSON.stringify({
          state: { currentModule: moduleData, currentQuiz: null },
          version: 0,
        }),
      )
      localStorage.setItem(
        'alc:state:progress',
        JSON.stringify({
          state: {
            moduleId: moduleData.id,
            stage: { kind: 'concept', conceptIndex: 0, quizIndex: 0 },
            updatedAt: Date.now(),
            feynmanAttempt: null,
          },
          version: 0,
        }),
      )
      localStorage.setItem(
        'alc:state:attempts',
        JSON.stringify({ state: { attemptsBySlot: {} }, version: 0 }),
      )
      localStorage.setItem(`alc:module:${moduleData.id}`, JSON.stringify(moduleData))
    }, mockModule)

    await mockFeedbackAPI(page)
    await mockRegenerateAPI(page)
    await mockFeynmanEvalAPI(page)
  })

  test('wrong answer shows correct-option ✓ and wrong-option ✗ markers', async ({ page }) => {
    // Navigate directly to the quiz (stage is concept(0,0))
    await page.goto(`/learn/module/${mockModule.id}`)
    await expect(page.locator('text=下面哪一项是核心概念的定义？')).toBeVisible({ timeout: 5000 })

    // Pick wrong answer
    await page.locator('button:has-text("干扰项C")').click()
    await page.locator('button:has-text("确认选择")').click()

    // Feedback panel should appear with retry text
    await expect(page.locator('text=再试一题')).toBeVisible({ timeout: 5000 })

    // Correct answer button should have ✓ marker (aria-label)
    const correctBtn = page.locator('button:has-text("正确答案")')
    await expect(correctBtn.locator('[aria-label="正确答案"]')).toBeVisible()

    // Wrongly selected button should have ✗ marker (aria-label)
    const wrongBtn = page.locator('button:has-text("干扰项C")')
    await expect(wrongBtn.locator('[aria-label="你的选择"]')).toBeVisible()

    // Correct answer button should have success border class
    await expect(correctBtn).toHaveClass(/border-success/)
    // Wrongly selected button should have warning border class
    await expect(wrongBtn).toHaveClass(/border-warning/)
  })

  test('correct answer shows ✓ marker on selected option', async ({ page }) => {
    await page.goto(`/learn/module/${mockModule.id}`)
    await expect(page.locator('text=下面哪一项是核心概念的定义？')).toBeVisible({ timeout: 5000 })

    // Pick correct answer
    await page.locator('button:has-text("正确答案")').click()
    await page.locator('button:has-text("确认选择")').click()

    // Feedback panel should show pass text
    await expect(page.locator('text=答对！')).toBeVisible({ timeout: 5000 })

    // Correct answer button should have ✓ marker
    const correctBtn = page.locator('button:has-text("正确答案")')
    await expect(correctBtn.locator('[aria-label="正确答案"]')).toBeVisible()
    await expect(correctBtn).toHaveClass(/border-success/)
  })
})
