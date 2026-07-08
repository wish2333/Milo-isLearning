import { expect, test, type Page } from '@playwright/test'

import { mockModule } from './fixtures/mock-module'

function createPackage() {
  return {
    version: 1,
    exportedBy: 'ai-learning-compiler',
    exportedAt: 1720000000000,
    source: {
      id: mockModule.sourceId,
      type: 'markdown',
      content: '# 测试模块\n\n这是一个导入包。',
      createdAt: 1720000000000,
    },
    module: mockModule,
    qualityReport: {
      moduleId: mockModule.id,
      generatedAt: 1720000000000,
      conceptCount: 1,
      quizCount: 7,
      challengeCount: 0,
      expressionDistribution: { 1: 6, 2: 0, 3: 1 },
      ladderDistribution: { 1: 7, 2: 0, 3: 0 },
      avgDistractorsPerQuiz: 2,
      challengeCoverage: [],
    },
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

async function importPackage(page: Page) {
  await page.goto('/learn/library')
  await page.locator('input[type="file"]').setInputFiles({
    name: '测试模块.alc-module.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(createPackage())),
  })
  await expect(page.locator('text=导入成功，可立即开始学习')).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: '测试模块' })).toBeVisible()
}

test.describe('Module Library', () => {
  test.beforeEach(async ({ page }) => {
    await blockCompile(page)
  })

  test('shows empty state', async ({ page }) => {
    await page.goto('/learn/library')
    await expect(page.locator('text=题库还是空的')).toBeVisible()
  })

  test('imports, opens, exports, and deletes a module package without compiling', async ({
    page,
  }) => {
    await importPackage(page)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '导出' }).click()
    const download = await downloadPromise
    const stream = await download.createReadStream()
    const chunks: Buffer[] = []
    await new Promise<void>((resolve, reject) => {
      stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      stream.on('end', resolve)
      stream.on('error', reject)
    })
    const exported = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    expect(exported.version).toBe(1)
    expect(exported.exportedBy).toBe('ai-learning-compiler')
    expect(JSON.stringify(exported)).not.toContain('apiKey')

    await page.locator('button:has-text("继续")').click()
    await page.waitForURL('**/learn/overview')
    await expect(page.locator('h1')).toContainText('测试模块')

    await page.goto('/learn/library')
    await page.locator('button:has-text("删除")').click()
    await page.locator('button:has-text("确认删除")').click()
    await expect(page.locator('text=题库还是空的')).toBeVisible()
  })
})

test.describe('Compile recovery', () => {
  test('shows saved compile context and can return to editing', async ({ page }) => {
    await page.addInitScript(() => {
      const job = {
        jobId: 'job-recovery',
        sourceContent: '# 恢复测试',
        configSummary: { provider: 'deepseek', model: 'test-model' },
        status: 'running',
        stage: 'quiz',
        percent: 47,
        createdAt: Date.now() - 1000,
        updatedAt: Date.now(),
      }
      localStorage.setItem('alc:compile-job:job-recovery', JSON.stringify(job))
      localStorage.setItem('alc:compile-job:__index__', JSON.stringify(['job-recovery']))
    })

    await page.goto('/learn/compiling?jobId=job-recovery')
    await expect(page.locator('text=已恢复上次编译上下文')).toBeVisible()
    await expect(page.locator('text=47%')).toBeVisible()
    await page.locator('button:has-text("返回修改")').click()
    await page.waitForURL('**/learn/import')
  })
})

test.describe('Previous question review', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((moduleData) => {
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
            stage: { kind: 'concept', conceptIndex: 0, quizIndex: 1 },
            updatedAt: Date.now(),
            feynmanAttempt: null,
          },
          version: 0,
        }),
      )
      localStorage.setItem(
        'alc:state:attempts',
        JSON.stringify({
          state: {
            attemptsBySlot: {
              'concept-1:0': [
                {
                  id: 'attempt-1',
                  quizId: 'concept-1:0',
                  originalQuizId: 'concept-1:0',
                  attemptVersion: 0,
                  userAnswer: '正确答案',
                  score: 100,
                  gaps: [],
                  nextAction: 'advance',
                  timestamp: Date.now() - 1000,
                },
              ],
            },
          },
          version: 0,
        }),
      )
    }, mockModule)
  })

  test('shows previous concept answer without changing current progress', async ({ page }) => {
    await page.goto(`/learn/module/${mockModule.id}`)
    await expect(page.locator('text=核心概念的关键要点是什么？')).toBeVisible()

    await page.locator('button:has-text("回看上一题")').click()
    await expect(page.locator('text=上一题')).toBeVisible()
    await expect(page.locator('text=正确答案是核心概念的标准定义')).toBeVisible()
    await expect(page.locator('text=你的作答')).toBeVisible()

    await page.locator('button:has-text("返回当前题")').click()
    await expect(page.locator('text=核心概念的关键要点是什么？')).toBeVisible()
  })
})

test.describe('Module route recovery', () => {
  test('loads a stored module when current module state is missing', async ({ page }) => {
    await page.addInitScript((moduleData) => {
      localStorage.setItem(`alc:module:${moduleData.id}`, JSON.stringify(moduleData))
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
    }, mockModule)

    await page.goto(`/learn/module/${mockModule.id}`)
    await expect(page.locator('text=导言')).toBeVisible()
    await expect(page.locator('text=测试模块')).toBeVisible()
  })
})
