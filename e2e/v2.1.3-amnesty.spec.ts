/**
 * V2.1.3 — 错题编辑 Amnesty 与 force-advance 编辑入口回归。
 *
 * 通过预置真实的 Module / progress / attempts 状态，覆盖：
 *   - 编辑后首次答对：历史只保留新的 score=100 attempt
 *   - 编辑后首次答错：token 消费，原历史继续保留
 *   - 连续失败 force-advance 时仍能看到“编辑此题”入口
 */

import { expect, test, type Page } from '@playwright/test'

import { mockModule } from './fixtures/mock-module'

const SLOT_ID = 'concept-1:0'

function makeAttempt(id: string, score: number, timestamp: number) {
  return {
    id,
    quizId: SLOT_ID,
    originalQuizId: SLOT_ID,
    attemptVersion: timestamp,
    userAnswer: '干扰项C',
    score,
    gaps: score >= 80 ? [] : ['干扰项C'],
    nextAction: score >= 80 ? ('advance' as const) : ('retry' as const),
    timestamp,
  }
}

async function seedLearningState(page: Page, attempts: ReturnType<typeof makeAttempt>[]) {
  await page.addInitScript(
    ({ moduleData, seededAttempts }) => {
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
        JSON.stringify({
          state: {
            attemptsBySlot: { 'concept-1:0': seededAttempts },
            pendingAmnesty: {},
          },
          version: 0,
        }),
      )
      localStorage.setItem(`alc:module:${moduleData.id}`, JSON.stringify(moduleData))
    },
    { moduleData: { ...mockModule, origin: 'user' }, seededAttempts: attempts },
  )
}

async function openHistoryAndEdit(page: Page) {
  await page.getByRole('button', { name: '答题历史' }).click()
  await page.getByRole('button', { name: /下面哪一项是核心概念的定义/ }).click()
  await page.getByRole('button', { name: /编辑此题:/ }).click()
  await expect(page.getByRole('radiogroup', { name: '选择正确答案' })).toBeVisible()
}

async function readAttempts(page: Page) {
  return page.evaluate(() => {
    const persisted = JSON.parse(localStorage.getItem('alc:state:attempts') ?? '{}')
    return persisted.state as {
      attemptsBySlot: Record<string, Array<{ score: number; id: string }>>
      pendingAmnesty?: Record<string, string>
    }
  })
}

test.describe('V2.1.3 Amnesty', () => {
  test('编辑后首次答对：清空历史，仅保留新的正确 attempt', async ({ page }) => {
    const now = Date.now()
    await seedLearningState(page, [makeAttempt('old-1', 0, now - 2000)])
    await page.goto(`/learn/module/${mockModule.id}`)
    await expect(page.getByText('下面哪一项是核心概念的定义？')).toBeVisible()

    await openHistoryAndEdit(page)
    await page.getByRole('radio', { name: /干扰项A/ }).click()
    await page.getByRole('button', { name: '保存编辑' }).click()
    await page.getByRole('button', { name: '收起答题历史' }).click()

    await page.getByRole('button', { name: /干扰项A/ }).click()
    await page.getByRole('button', { name: '确认选择' }).click()
    await expect(page.getByText('答对！继续保持这个节奏。')).toBeVisible()

    const state = await readAttempts(page)
    expect(state.attemptsBySlot[SLOT_ID]).toHaveLength(1)
    expect(state.attemptsBySlot[SLOT_ID]![0]?.score).toBe(100)
    expect(state.attemptsBySlot[SLOT_ID]![0]?.id).not.toBe('old-1')
    expect(state.pendingAmnesty?.[SLOT_ID]).toBeUndefined()
  })

  test('编辑后首次答错：消费 token，原历史继续保留', async ({ page }) => {
    const now = Date.now()
    await seedLearningState(page, [makeAttempt('old-1', 0, now - 2000)])
    await page.goto(`/learn/module/${mockModule.id}`)
    await expect(page.getByText('下面哪一项是核心概念的定义？')).toBeVisible()

    await openHistoryAndEdit(page)
    await page.getByRole('radio', { name: /干扰项A/ }).click()
    await page.getByRole('button', { name: '保存编辑' }).click()
    await page.getByRole('button', { name: '收起答题历史' }).click()

    await page.getByRole('button', { name: /正确答案/ }).click()
    await page.getByRole('button', { name: '确认选择' }).click()
    await expect(page.getByText('再试一题，重点看解析里的关键关系。')).toBeVisible()

    const state = await readAttempts(page)
    expect(state.attemptsBySlot[SLOT_ID]).toHaveLength(2)
    expect(state.attemptsBySlot[SLOT_ID]!.map((attempt) => attempt.id)).toContain('old-1')
    expect(state.attemptsBySlot[SLOT_ID]!.at(-1)?.score).toBe(0)
    expect(state.pendingAmnesty?.[SLOT_ID]).toBeUndefined()
  })

  test('force-advance 时仍显示“编辑此题”入口', async ({ page }) => {
    const now = Date.now()
    await seedLearningState(page, [
      makeAttempt('old-1', 0, now - 3000),
      makeAttempt('old-2', 0, now - 2000),
    ])
    await page.goto(`/learn/module/${mockModule.id}`)
    await expect(page.getByText('下面哪一项是核心概念的定义？')).toBeVisible()

    await page.getByRole('button', { name: /干扰项C/ }).click()
    await page.getByRole('button', { name: '确认选择' }).click()
    await expect(page.getByText('编辑此题', { exact: true })).toBeVisible()
  })
})
