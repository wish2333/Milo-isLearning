/**
 * V2.1.6 跨模块错题穿插 E2E
 *
 * 验证：
 *   1. 主题学习流中，module A 的 concept 转移处注入主题内其他模块（module B）的错题作为复习槽位；
 *      ConceptView 渲染跨模块 quiz 并显示"复习 · 来自《模块名》"badge。
 *   2. 单模块主题降级：无其他模块 → 不穿插，学习流正常推进。
 *
 * 策略：seed module B 的错题 attempt 到 localStorage（attempts-store），通过文件导入 +
 * UI 创建主题 + 主题学习流驱动到 concept 转移，断言跨模块 badge。
 * 选择题答对走本地确定性评估，不触发 /api/feedback。
 */
import { test, expect, type Page } from '@playwright/test'

import { mockModuleCross } from './fixtures/mock-module-cross'
import { mockModuleCrossB } from './fixtures/mock-module-cross-b'
import { mockFeynmanEval } from './fixtures/mock-module'

function createPackage(mod: typeof mockModuleCross) {
  return {
    version: 1,
    exportedBy: 'ai-learning-compiler',
    exportedAt: 1720000000000,
    source: {
      id: mod.sourceId,
      type: 'markdown' as const,
      content: `# ${mod.title}\n\n导入包。`,
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

async function mockFeynmanEvalAPI(page: Page) {
  await page.route('**/api/feynman-eval', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockFeynmanEval),
    })
  })
}

async function importModulePackage(page: Page, mod: typeof mockModuleCross) {
  const pkg = createPackage(mod)
  await page.locator('input[type="file"]').setInputFiles({
    name: `${mod.title}.alc-module.json`,
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(pkg)),
  })
  await expect(page.locator('text=导入成功，可立即开始学习')).toBeVisible()
}

/**
 * 直接 seed 两个 cross 模块到 localStorage（绕过导入的 id 重写，保留已知 quiz id），
 * 并 seed 两模块首题的错题 attempt，使主题内"另一模块"无论哪个先学都能被跨模块收集器命中。
 */
async function seedCrossModulesAndAttempts(page: Page) {
  const script = `
    (function () {
      var mods = ${JSON.stringify([mockModuleCross, mockModuleCrossB])};
      for (var i = 0; i < mods.length; i++) {
        localStorage.setItem('alc:module:' + mods[i].id, JSON.stringify(mods[i]));
      }
      var makeAtt = function (slotId) {
        return {
          id: 'seed-att-' + slotId,
          quizId: slotId,
          originalQuizId: slotId,
          attemptVersion: 1,
          userAnswer: 'wrong',
          score: 30,
          gaps: ['gap'],
          nextAction: 'retry',
          timestamp: Date.now(),
        };
      };
      localStorage.setItem(
        'alc:state:attempts',
        JSON.stringify({
          state: {
            attemptsBySlot: {
              'cross-c1:0': [makeAtt('cross-c1:0')],
              'crossb-c1:0': [makeAtt('crossb-c1:0')],
            },
            pendingAmnesty: {},
          },
          version: 0,
        }),
      );
    })();
  `
  await page.addInitScript(script)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'alc:runtime-mode',
      JSON.stringify({ state: { studioMode: true }, version: 0 }),
    )
  })
  await blockCompile(page)
  await mockFeynmanEvalAPI(page)
})

test.describe('V2.1.6 跨模块错题穿插', () => {
  test('主题学习流 concept 转移注入其他模块错题，ConceptView 渲染跨模块复习题', async ({
    page,
  }) => {
    await seedCrossModulesAndAttempts(page)

    await page.goto('/learn/library')

    // 两个模块已直接 seed 到 localStorage（绕过导入 id 重写），创建含两者的主题
    await page.locator('button:has-text("+ 创建主题")').click()
    await page.locator('#topic-name').fill('穿插主题')
    const checkboxes = page.locator('[role="dialog"] input[type="checkbox"]')
    await checkboxes.nth(0).click()
    await checkboxes.nth(1).click()
    await page.locator('button:has-text("保存")').click()
    await expect(page.locator('text=穿插主题')).toBeVisible()

    // 开始主题学习 → 进入首个模块（顺序无关：两个均 2 concept，都会触发 concept 转移）
    await page.locator('button:has-text("开始主题学习")').click()
    await page.waitForURL('**/learn/module/**', { timeout: 5000 })

    await expect(page.locator('text=导言')).toBeVisible({ timeout: 5000 })
    await page.locator('button:has-text("开始学习")').first().click()

    // concept 0 的唯一题（按 stem 检测当前模块，选对应正确答案）
    const stemA0 = page.locator('text=概念零的唯一题目？')
    const stemB0 = page.locator('text=概念B零的唯一题目？')
    await stemA0.or(stemB0).waitFor({ timeout: 10000 })
    const isModuleA = await stemA0.isVisible()
    const answerC0 = isModuleA ? '正确零' : '正确B零'
    const answerC1 = isModuleA ? '正确一' : '正确B一'
    const otherModuleTitle = isModuleA ? '穿插模块B' : '穿插模块A'

    // concept 0 答对 → 继续（触发 concept 转移，注入另一模块的错题 slot）
    await page.locator(`button:has-text("${answerC0}")`).click()
    await page.locator('button:has-text("确认选择")').click()
    await page.locator('button:has-text("继续")').click()

    // concept 1 的唯一题答对 → 继续（游标推进到复习槽位 = 另一模块的错题）
    const stemC1 = isModuleA ? '概念一的唯一题目？' : '概念B一的唯一题目？'
    await expect(page.locator(`text=${stemC1}`)).toBeVisible({ timeout: 10000 })
    await page.locator(`button:has-text("${answerC1}")`).click()
    await page.locator('button:has-text("确认选择")').click()
    await page.locator('button:has-text("继续")').click()

    // 断言：跨模块复习题渲染 + badge 显示来源模块名
    await expect(page.locator(`text=复习 · 来自《${otherModuleTitle}》`)).toBeVisible({
      timeout: 10000,
    })
  })

  test('单模块主题降级：无其他模块不穿插，学习流正常推进', async ({ page }) => {
    await page.goto('/learn/library')
    await importModulePackage(page, mockModuleCross)

    // 创建仅含穿插模块A 的单模块主题
    await page.locator('button:has-text("+ 创建主题")').click()
    await page.locator('#topic-name').fill('单模块主题')
    await page.locator('[role="dialog"] input[type="checkbox"]').first().click()
    await page.locator('button:has-text("保存")').click()
    await expect(page.locator('text=单模块主题')).toBeVisible()

    await page.locator('button:has-text("开始主题学习")').click()
    await page.waitForURL('**/learn/module/**', { timeout: 5000 })

    await expect(page.locator('text=导言')).toBeVisible({ timeout: 5000 })
    await page.locator('button:has-text("开始学习")').first().click()

    // concept 0 答对 → 转移到 concept 1（无其他模块 → 无跨模块注入）
    await expect(page.locator('text=概念零的唯一题目？')).toBeVisible({ timeout: 10000 })
    await page.locator('button:has-text("正确零")').click()
    await page.locator('button:has-text("确认选择")').click()
    await page.locator('button:has-text("继续")').click()

    // concept 1 正常显示，无跨模块 badge
    await expect(page.locator('text=概念一的唯一题目？')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('text=复习 · 来自《')).toHaveCount(0)
  })
})
