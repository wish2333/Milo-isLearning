// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'

const router = vi.hoisted(() => ({ push: vi.fn() }))
const todayStore = vi.hoisted(() => ({ session: null, hydrate: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => router,
}))
vi.mock('@/lib/hooks/useHydrated', () => ({ useHydrated: () => true }))
vi.mock('@/lib/state/settings-store', () => ({
  useSettingsStore: (selector: (state: { fsrs: { enabled: boolean } }) => unknown) =>
    selector({ fsrs: { enabled: false } }),
}))
vi.mock('@/lib/state/today-session-store', () => ({
  useTodaySessionStore: (selector: (state: { session: null; hydrate: () => void }) => unknown) =>
    selector(todayStore),
}))
vi.mock('@/lib/state/review-store', () => ({
  useReviewStore: (selector: (state: { startTodaySession: () => boolean }) => unknown) =>
    selector({ startTodaySession: () => false }),
}))
vi.mock('@/lib/persistence/client/storage', () => ({
  getStorage: () => ({ keys: () => [], get: () => null }),
}))
vi.mock('@/lib/persistence/module-library', () => ({
  listStoredModules: () => [],
  loadStoredModule: () => null,
}))
vi.mock('@/lib/persistence/schedule-library', () => ({
  scheduleLibrary: { listByModule: () => [] },
}))
vi.mock('@/lib/runtime/streak', () => ({
  localDateString: (date: Date) => date.toISOString().slice(0, 10),
  loadStreak: () => null,
}))
vi.mock('@/lib/runtime/fsrs', () => ({ isDue: () => false }))
vi.mock('@/lib/runtime/adaptive-sequencer', () => ({ findQuizInModule: () => null }))

import TodayPage from '../page'

describe('TodayPage', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    router.push.mockClear()
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

  it('keeps the non-FSRS page useful and links to basic learning statistics', async () => {
    await act(async () => {
      root.render(<TodayPage />)
      await new Promise((resolve) => setTimeout(resolve, 0))
    })

    expect(container.textContent).toContain('今日到期（FSRS）')
    expect(container.textContent).toContain('今日到期队列不可用')
    const statsButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '查看学习统计',
    )
    expect(statsButton).toBeDefined()
    await act(async () => {
      statsButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
    expect(router.push).toHaveBeenCalledWith('/learn/stats')
  })
})
