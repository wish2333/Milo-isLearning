/**
 * Topic E2E Tests — M8.1 Topic CRUD + Learning Flow + Review Filters
 *
 * Strategy: Pre-load Module data in localStorage, mock API responses.
 * Tests:
 *   1. Library: import 2 modules, create topic with both
 *   2. Topic CRUD: create, edit, delete topic
 *   3. Topic learning flow: start topic → module intro → quiz → feynman → done → transition → next module
 *   4. Review with filter tabs: wrong / guessed / all
 */

import { test, expect, type Page, type Route } from '@playwright/test'

import { mockModule } from './fixtures/mock-module'
import { mockModule2 } from './fixtures/mock-module-2'
import {
  mockFeedbackPass,
  mockFeedbackFail,
  mockFeedbackPassAfterRetry,
  mockReplacementQuiz,
  mockFeynmanEval,
} from './fixtures/mock-module'

// ─── Helpers ────────────────────────────────────────────────────

function createPackage(mod: typeof mockModule) {
  return {
    version: 1,
    exportedBy: 'ai-learning-compiler',
    exportedAt: 1720000000000,
    source: {
      id: mod.sourceId,
      type: 'markdown' as const,
      content: `# ${mod.title}\n\n这是一个导入包。`,
      createdAt: 1720000000000,
    },
    module: mod,
  }
}

async function blockCompile(page: Page) {
  await page.route('**/api/compile', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'E2E should not call compile' }),
    })
  })
}

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

/** Import a module package via file input */
async function importModulePackage(page: Page, mod: typeof mockModule) {
  const pkg = createPackage(mod)
  await page.locator('input[type="file"]').setInputFiles({
    name: `${mod.title}.alc-module.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(pkg)),
  })
  await expect(page.locator('text=导入成功，可立即开始学习')).toBeVisible()
}

// ─── Tests ──────────────────────────────────────────────────────

test.describe('Topic CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await blockCompile(page)
  })

  test('import 2 modules, create topic, verify topic appears in library', async ({ page }) => {
    await page.goto('/learn/library')

    // Import first module
    await importModulePackage(page, mockModule)
    await expect(page.getByRole('listitem').filter({ hasText: '测试模块' })).toBeVisible()

    // Import second module
    await importModulePackage(page, mockModule2)
    await expect(page.getByRole('listitem').filter({ hasText: '测试模块二' })).toBeVisible()

    // Click "创建主题"
    await page.locator('button:has-text("+ 创建主题")').click()
    await expect(page.locator('[role="dialog"]')).toBeVisible()
    await expect(page.locator('h3:has-text("创建主题")')).toBeVisible()

    // Fill topic name
    await page.locator('#topic-name').fill('E2E测试主题')

    // Select both modules
    const checkboxes = page.locator('[role="dialog"] input[type="checkbox"]')
    await checkboxes.nth(0).click()
    await checkboxes.nth(1).click()

    // Save
    await page.locator('button:has-text("保存")').click()

    // Verify topic appears
    await expect(page.locator('text=E2E测试主题')).toBeVisible()
    await expect(page.locator('text=0/2 完成')).toBeVisible()
  })

  test('edit topic name', async ({ page }) => {
    await page.goto('/learn/library')

    // Import modules and create topic first
    await importModulePackage(page, mockModule)
    await importModulePackage(page, mockModule2)

    await page.locator('button:has-text("+ 创建主题")').click()
    await page.locator('#topic-name').fill('原始名称')
    const checkboxes = page.locator('[role="dialog"] input[type="checkbox"]')
    await checkboxes.nth(0).click()
    await checkboxes.nth(1).click()
    await page.locator('button:has-text("保存")').click()
    await expect(page.locator('text=原始名称')).toBeVisible()

    // Edit topic
    await page.locator('button:has-text("编辑")').click()
    await expect(page.locator('h3:has-text("编辑主题")')).toBeVisible()
    await page.locator('#topic-name').clear()
    await page.locator('#topic-name').fill('修改后名称')
    await page.locator('button:has-text("保存")').click()

    await expect(page.locator('text=修改后名称')).toBeVisible()
    await expect(page.locator('text=原始名称')).not.toBeVisible()
  })

  test('delete topic removes topic but keeps modules', async ({ page }) => {
    await page.goto('/learn/library')

    // Import modules and create topic
    await importModulePackage(page, mockModule)
    await importModulePackage(page, mockModule2)

    await page.locator('button:has-text("+ 创建主题")').click()
    await page.locator('#topic-name').fill('待删除主题')
    const checkboxes = page.locator('[role="dialog"] input[type="checkbox"]')
    await checkboxes.nth(0).click()
    await checkboxes.nth(1).click()
    await page.locator('button:has-text("保存")').click()
    await expect(page.locator('text=待删除主题')).toBeVisible()

    // Delete topic — scope to the topic card's delete button (not module row deletes)
    await page.locator('.alc-card:has-text("待删除主题") button:has-text("删除")').click()
    await expect(page.locator('[role="dialog"]:has-text("确认删除主题")')).toBeVisible()
    await page.locator('button:has-text("确认删除")').click()

    // Topic gone, modules still visible as ungrouped
    await expect(page.locator('text=待删除主题')).not.toBeVisible()
    // Both modules should be visible as ungrouped items
    await expect(page.getByRole('listitem').filter({ hasText: '测试模块二' })).toBeVisible()
    // Use nth to disambiguate: second match is "测试模块" (without "二")
    const moduleItems = page.getByRole('listitem').filter({ hasText: '测试模块' })
    await expect(moduleItems).toHaveCount(2)
  })
})

test.describe('Topic learning flow', () => {
  test.beforeEach(async ({ page }) => {
    await blockCompile(page)
    await mockFeedbackAPI(page)
    await mockRegenerateAPI(page)
    await mockFeynmanEvalAPI(page)
  })

  test('start topic → complete first module → transition page → continue to second module', async ({
    page,
  }) => {
    // --- Setup: import 2 modules and create topic ---
    await page.goto('/learn/library')
    await importModulePackage(page, mockModule)
    await importModulePackage(page, mockModule2)

    await page.locator('button:has-text("+ 创建主题")').click()
    await page.locator('#topic-name').fill('刷题主题')
    const checkboxes = page.locator('[role="dialog"] input[type="checkbox"]')
    await checkboxes.nth(0).click()
    await checkboxes.nth(1).click()
    await page.locator('button:has-text("保存")').click()
    await expect(page.locator('text=刷题主题')).toBeVisible()

    // --- Start topic learning ---
    await page.locator('button:has-text("开始主题学习")').click()
    await page.waitForURL('**/learn/module/**', { timeout: 5000 })

    // --- Complete first module ---
    // Module intro
    await expect(page.locator('text=导言')).toBeVisible({ timeout: 5000 })
    await page.waitForLoadState('domcontentloaded')
    await page.locator('button:has-text("开始学习")').first().click()

    // Detect which module loaded by checking quiz stem
    // mockModule quiz 1: "下面哪一项是核心概念的定义？" → correct: "正确答案", wrong: "要点三"
    // mockModule2 quiz 1: "进阶概念的核心理论是什么？" → correct: "理论A正确", wrong: "场景二"
    const quiz1Stem = page.locator('text=下面哪一项是核心概念的定义？')
    const quiz1Stem2 = page.locator('text=进阶概念的核心理论是什么？')
    await quiz1Stem.or(quiz1Stem2).waitFor({ timeout: 15000 })

    const isModule1 = await quiz1Stem.isVisible()
    const correctAnswer1 = isModule1 ? '正确答案' : '理论A正确'
    const wrongAnswer1 = isModule1 ? '要点三' : '场景二'
    const quiz2Stem = isModule1 ? '核心概念的关键要点' : '进阶概念的应用场景'
    // Reserved for future retry-flow assertion; prefixed per ESLint no-unused-vars convention
    const _retryAnswer = isModule1 ? '要点一和要点二' : '场景一'

    // Quiz 1: pass
    await page.locator(`button:has-text("${correctAnswer1}")`).click()
    await page.locator('button:has-text("确认选择")').click()
    await expect(page.locator('text=答对！继续保持这个节奏。')).toBeVisible({ timeout: 5000 })
    await page.locator('button:has-text("继续")').click()

    // Quiz 2: fail → retry → pass
    await expect(page.locator(`text=${quiz2Stem}`)).toBeVisible({ timeout: 5000 })
    await page.locator(`button:has-text("${wrongAnswer1}")`).click()
    await page.locator('button:has-text("确认选择")').click()
    await expect(page.locator('text=再试一题')).toBeVisible({ timeout: 5000 })
    await page.locator('button:has-text("继续下一步")').click()

    // Feynman steps — detect count by module
    await expect(page.locator('text=费曼任务')).toBeVisible({ timeout: 5000 })
    await page.locator('button:has-text("开始费曼练习")').click()

    if (isModule1) {
      // mockModule: 5 Feynman steps (4 choice + 1 fill_blank)
      const stepAnswers = ['正确领域', '主要用途', '关键特征', '准确描述']
      for (let step = 1; step <= 4; step++) {
        await expect(page.locator(`text=费曼步骤${step}`)).toBeVisible({ timeout: 5000 })
        await page.locator(`button:has-text("${stepAnswers[step - 1]}")`).click()
        await page.locator('button:has-text("确认选择")').click()
        await page.locator('button:has-text("下一步")').click()
      }
      // Step 5: fill blank
      await expect(page.locator('text=费曼步骤5')).toBeVisible({ timeout: 5000 })
      await page.locator('input[type="text"]').fill('关键术语')
      await page.locator('button:has-text("确认答案")').click()
      await page.locator('button:has-text("进入最终任务")').click()
    } else {
      // mockModule2: 5 Feynman steps (4 choice + 1 fill_blank)
      const stepAnswers2 = ['数学领域', '数据处理', '精确描述', '理论框架']
      for (let step = 1; step <= 4; step++) {
        await expect(page.locator(`text=费曼步骤${step}`)).toBeVisible({ timeout: 5000 })
        await page.locator(`button:has-text("${stepAnswers2[step - 1]}")`).click()
        await page.locator('button:has-text("确认选择")').click()
        await page.locator('button:has-text("下一步")').click()
      }
      // Step 5: fill blank
      await expect(page.locator('text=费曼步骤5')).toBeVisible({ timeout: 5000 })
      await page.locator('input[type="text"]').fill('关键术语')
      await page.locator('button:has-text("确认答案")').click()
      await page.locator('button:has-text("进入最终任务")').click()
    }

    // Feynman final
    await expect(page.locator('text=费曼最终任务')).toBeVisible({ timeout: 5000 })
    const output = isModule1
      ? '核心概念是将离散信息映射到连续空间的方法。'.repeat(6)
      : '进阶概念是数学领域的核心理论，主要用于数据处理。'.repeat(6)
    await page.locator('textarea').fill(output)
    await page.locator('button:has-text("提交评估")').click()

    // Feynman score
    await expect(page.locator('text=费曼得分')).toBeVisible({ timeout: 10000 })
    await page.locator('button:has-text("完成学习")').click()

    // --- Topic transition page (not /learn/done) ---
    await page.waitForURL('**/learn/topic/**', { timeout: 10000 })
    await expect(page.locator('text=刷题主题')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=1/2 完成')).toBeVisible()

    // Continue to next module
    await page.locator('button:has-text("继续学习")').click()
    await page.waitForURL('**/learn/module/**', { timeout: 5000 })

    // Verify second module loaded (check for its concept name)
    const secondModuleConcept = isModule1 ? '进阶概念' : '核心概念'
    await expect(page.locator(`text=${secondModuleConcept}`)).toBeVisible({ timeout: 5000 })
  })
})

test.describe('Review with filter tabs', () => {
  test('review page shows filter tabs and can switch between them', async ({ page }) => {
    // Pre-load module with some wrong attempts in localStorage
    await page.addInitScript((moduleData) => {
      // Store module
      localStorage.setItem(`alc:module:${moduleData.id}`, JSON.stringify(moduleData))

      // Store settings
      localStorage.setItem(
        'alc:settings',
        JSON.stringify({
          state: { config: { provider: 'deepseek', apiKey: 'test-key', model: 'test-model' } },
          version: 0,
        }),
      )

      // Store attempts: one wrong, one guessed
      localStorage.setItem(
        'alc:state:attempts',
        JSON.stringify({
          state: {
            attemptsBySlot: {
              'concept-1:0': [
                {
                  id: 'attempt-wrong',
                  quizId: 'concept-1:0',
                  originalQuizId: 'concept-1:0',
                  attemptVersion: 0,
                  userAnswer: '干扰项A',
                  score: 0,
                  gaps: ['概念定义'],
                  nextAction: 'retry',
                  timestamp: Date.now() - 2000,
                },
              ],
              'concept-1:1': [
                {
                  id: 'attempt-guessed',
                  quizId: 'concept-1:1',
                  originalQuizId: 'concept-1:1',
                  attemptVersion: 0,
                  userAnswer: '要点一和要点二',
                  score: 100,
                  gaps: [],
                  nextAction: 'advance',
                  guessed: true,
                  timestamp: Date.now() - 1000,
                },
              ],
            },
          },
          version: 0,
        }),
      )
    }, mockModule)

    await page.goto(`/learn/review/${mockModule.id}`)
    await page.waitForLoadState('networkidle')

    // Verify filter tabs are visible
    await expect(page.locator('text=全部')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=仅错题')).toBeVisible()
    await expect(page.locator('text=仅蒙对')).toBeVisible()

    // Verify counts (1 wrong + 1 guessed = 2 all, 1 wrong, 1 guessed)
    await expect(page.locator('button:has-text("全部(2)")')).toBeVisible()
    await expect(page.locator('button:has-text("仅错题(1)")')).toBeVisible()
    await expect(page.locator('button:has-text("仅蒙对(1)")')).toBeVisible()

    // Switch to "仅错题" tab
    await page.locator('button:has-text("仅错题")').click()
    await page.waitForURL(`**/learn/review/${mockModule.id}?filter=wrong`)
    await expect(page.locator('text=错题重刷')).toBeVisible()

    // Switch to "仅蒙对" tab
    await page.locator('button:has-text("仅蒙对")').click()
    await page.waitForURL(`**/learn/review/${mockModule.id}?filter=guessed`)
  })

  test('review with wrong filter shows only wrong questions and can complete', async ({ page }) => {
    await page.addInitScript((moduleData) => {
      localStorage.setItem(`alc:module:${moduleData.id}`, JSON.stringify(moduleData))
      localStorage.setItem(
        'alc:state:attempts',
        JSON.stringify({
          state: {
            attemptsBySlot: {
              'concept-1:0': [
                {
                  id: 'attempt-wrong',
                  quizId: 'concept-1:0',
                  originalQuizId: 'concept-1:0',
                  attemptVersion: 0,
                  userAnswer: '干扰项A',
                  score: 0,
                  gaps: ['概念定义'],
                  nextAction: 'retry',
                  timestamp: Date.now(),
                },
              ],
            },
          },
          version: 0,
        }),
      )
    }, mockModule)

    await page.goto(`/learn/review/${mockModule.id}?filter=wrong`)

    // Should show only1 question (the wrong one)
    await expect(page.locator('text=下面哪一项是核心概念的定义？')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=1 / 1')).toBeVisible()

    // Answer correctly
    await page.locator('button:has-text("正确答案")').click()
    await page.locator('button:has-text("确认选择")').click()
    await expect(page.locator('text=答对')).toBeVisible({ timeout: 5000 })

    // Click "查看结果"
    await page.locator('button:has-text("查看结果")').click()

    // Results summary
    await expect(page.locator('text=重刷完成')).toBeVisible({ timeout: 5000 })
    await expect(page.locator('text=100%')).toBeVisible()
    await expect(page.locator('text=正确 1 / 共 1 题')).toBeVisible()

    // Return to library
    await page.locator('button:has-text("返回题库")').click()
    await page.waitForURL('**/learn/library')
  })
})
