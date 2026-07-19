// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const rangeState = vi.hoisted(() => ({
  attemptsBySlot: {},
}))

vi.mock('@/lib/hooks/useHydrated', () => ({
  useHydrated: () => true,
}))

vi.mock('@/lib/state/attempts-store', () => ({
  useAttemptsStore: (selector: (state: typeof rangeState) => unknown) => selector(rangeState),
}))

vi.mock('@/lib/state/settings-store', () => ({
  useSettingsStore: (selector: (state: { fsrs: { enabled: boolean } }) => unknown) =>
    selector({ fsrs: { enabled: true } }),
}))

vi.mock('@/lib/runtime/app-mode', () => ({ isShowcaseMode: false }))
vi.mock('@/lib/runtime/streak', () => ({ loadStreak: () => null }))
vi.mock('@/lib/persistence/schedule-library', () => ({
  scheduleLibrary: { listAll: () => [] },
}))
vi.mock('@/lib/persistence/shared/keys', () => ({
  StorageKeys: { module: (id: string) => `alc:module:${id}` },
}))
vi.mock('@/lib/persistence/client/storage', () => ({
  getStorage: () => ({
    keys: () => [],
    get: () => null,
  }),
}))

vi.mock('@/lib/runtime/stats-compute', () => ({
  computeStats: () => {
    const trend = Array.from({ length: 7 }, (_, index) => ({
      date: `2026-07-${String(11 + index).padStart(2, '0')}`,
      attemptCount: index === 6 ? 3 : index === 5 ? 1 : 0,
      correctCount: index === 6 ? 2 : 0,
      accuracy: index === 6 ? 67 : 0,
      firstAttemptCount: index === 6 ? 2 : 0,
      firstCorrectCount: index === 6 ? 1 : 0,
      firstCorrectRate: index === 6 ? 50 : 0,
      dueCount: index === 6 ? 2 : 0,
      dueCompletedCount: index === 6 ? 1 : 0,
      dueCompletionRate: index === 6 ? 50 : 0,
      reviewAttemptCount: index === 6 ? 1 : 0,
      newAttemptCount: index === 6 ? 2 : 0,
      studyDay: index >= 5,
    }))
    return {
      todayDueCount: 2,
      todayCompletedCount: 1,
      currentStreak: 2,
      longestStreak: 4,
      sevenDayAccuracy: 67,
      sevenDayCorrect: 2,
      sevenDayAttempts: 3,
      sevenDayTrend: trend,
      thirtyDayTrend: Array.from({ length: 30 }, (_, index) => ({
        ...trend.at(-1)!,
        date: `2026-06-${String(index + 1).padStart(2, '0')}`,
      })),
      sevenDayStudyDays: 2,
      thirtyDayStudyDays: 3,
      moduleCount: 1,
      totalAttempts: 3,
    }
  },
}))

import StatsPage from '../page'

describe('StatsPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
  })

  async function renderPage() {
    await act(async () => {
      root.render(<StatsPage />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })
  }

  it('shows basic learning stats, separates new/review attempts, and switches to 30 days', async () => {
    await renderPage()

    expect(container.textContent).toContain('今日学习')
    expect(container.textContent).toContain('2 次新题首答 · 1 次复习作答')
    expect(container.textContent).toContain('已完成 / 当前到期，不等于今日总作答')
    expect(container.textContent).toContain('最近 7 日')
    expect(container.querySelector('[aria-label="7日作答趋势"]')).not.toBeNull()

    const thirtyButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '30 日',
    )
    expect(thirtyButton).toBeDefined()
    await act(async () => {
      thirtyButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })

    expect(container.textContent).toContain('最近 30 日')
    expect(container.querySelector('[aria-label="30日作答趋势"]')).not.toBeNull()
  })
})
