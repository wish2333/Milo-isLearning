/**
 * 今日复习会话 Store。
 *
 * TodaySession 与错题重刷会话分开持久化：普通 review session 刷新即丢失，
 * 而今日复习必须能在 `/learn/today/review` 刷新后继续。这里仍通过统一
 * StorageRepository 访问数据，避免把 LocalStorage 细节泄漏到页面组件。
 */

import { create } from 'zustand'

import type { TodaySession } from '@/types/domain'
import type { ReviewQueueItem, ReviewResult } from '@/lib/state/review-store'
import { StorageKeys } from '@/lib/persistence/shared/keys'
import { getStorage } from '@/lib/persistence/client/storage'

interface TodaySessionState {
  session: TodaySession | null
  hydrate: () => TodaySession | null
  startSession: (queue: ReviewQueueItem[], date: string) => boolean
  recordResult: (slotId: string, score: number) => void
  updateResult: (slotId: string, score: number) => void
  nextQuestion: () => void
  clearSession: () => void
}

function toStoredQueue(queue: ReviewQueueItem[]): TodaySession['queue'] {
  return queue.map((item) => ({
    quiz: item.quiz,
    moduleId: item.moduleId,
    slotId: item.slotId,
  }))
}

function persistSession(session: TodaySession | null): void {
  const repo = getStorage()
  if (session) {
    repo.set(StorageKeys.todaySession, session)
  } else {
    repo.remove(StorageKeys.todaySession)
  }
}

export const useTodaySessionStore = create<TodaySessionState>()((set, get) => ({
  session: null,

  hydrate: () => {
    const stored = getStorage().get<TodaySession>(StorageKeys.todaySession)
    set({ session: stored })
    return stored
  },

  startSession: (queue, date) => {
    if (queue.length === 0 || date.length === 0) return false

    const session: TodaySession = {
      date,
      initialDueSnapshot: queue.map((item) => item.slotId),
      queue: toStoredQueue(queue),
      currentIndex: 0,
      results: [],
      startedAt: Date.now(),
    }
    persistSession(session)
    set({ session })
    return true
  },

  recordResult: (slotId, score) => {
    const session = get().session
    if (!session || session.results.some((result) => result.slotId === slotId)) return

    const result: ReviewResult = {
      slotId,
      score,
      passed: score >= 80,
    }
    const nextSession: TodaySession = {
      ...session,
      results: [...session.results, result],
    }
    persistSession(nextSession)
    set({ session: nextSession })
  },

  updateResult: (slotId, score) => {
    const session = get().session
    if (!session) return
    const nextSession: TodaySession = {
      ...session,
      results: session.results.map((result) =>
        result.slotId === slotId ? { ...result, score, passed: score >= 80 } : result,
      ),
    }
    persistSession(nextSession)
    set({ session: nextSession })
  },

  nextQuestion: () => {
    const session = get().session
    if (!session || session.currentIndex >= session.queue.length) return

    const nextSession = {
      ...session,
      currentIndex: session.currentIndex + 1,
    }
    persistSession(nextSession)
    set({ session: nextSession })
  },

  clearSession: () => {
    persistSession(null)
    set({ session: null })
  },
}))
