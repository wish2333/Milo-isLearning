/**
 * Review Store — 错题重刷会话（Zustand, 非持久化）
 *
 * 内存 only — 刷新即丢失，不写入 LocalStorage。
 * 不影响 computeMastery（review attempts 有 attemptVersion > 0）。
 *
 * 支持单库模式和主题跨库模式。
 */

import { create } from 'zustand'

import type { Module, Quiz, ReviewFilter } from '@/types/domain'

import { collectReviewItemsForModules } from '@/lib/runtime/topic-review'
import { loadStoredModule } from '@/lib/persistence/module-library'
import { getTopic } from '@/lib/persistence/topic-library'
import { storage } from '@/lib/persistence/client/local-storage'
import { useAttemptsStore } from '@/lib/state/attempts-store'

const PASS_THRESHOLD = 80

export interface ReviewResult {
  slotId: string
  score: number
  passed: boolean
}

export interface ReviewQueueItem {
  quiz: Quiz
  moduleId: string
  slotId: string
}

export interface ReviewSession {
  moduleId: string
  topicId?: string
  filter: ReviewFilter
  queue: ReviewQueueItem[]
  currentIndex: number
  results: ReviewResult[]
}

interface ReviewStoreState {
  session: ReviewSession | null
  startSession: (moduleId: string, filter?: ReviewFilter) => boolean
  startTopicSession: (topicId: string, filter?: ReviewFilter) => boolean
  recordResult: (slotId: string, score: number) => void
  nextQuestion: () => void
  endSession: () => void
}

function shuffle<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const temp = result[i]!
    result[i] = result[j]!
    result[j] = temp
  }
  return result
}

export const useReviewStore = create<ReviewStoreState>()((set) => ({
  session: null,

  startSession: (moduleId, filter = 'all') => {
    const moduleData = loadStoredModule(storage, moduleId)
    if (!moduleData) return false

    const attemptsBySlot = useAttemptsStore.getState().attemptsBySlot
    const items = collectReviewItemsForModules([moduleData], attemptsBySlot, filter)
    if (items.length === 0) return false

    const queue = shuffle(
      items.map((item) => ({
        quiz: item.quiz,
        moduleId: item.moduleId,
        slotId: item.slotId,
      })),
    )

    set({
      session: {
        moduleId,
        filter,
        queue,
        currentIndex: 0,
        results: [],
      },
    })
    return true
  },

  startTopicSession: (topicId, filter = 'all') => {
    const topic = getTopic(storage, topicId)
    if (!topic) return false
    const modules = topic.moduleIds
      .map((id) => loadStoredModule(storage, id))
      .filter((m): m is Module => m !== null)
    if (modules.length === 0) return false

    const attemptsBySlot = useAttemptsStore.getState().attemptsBySlot
    const items = collectReviewItemsForModules(modules, attemptsBySlot, filter)
    if (items.length === 0) return false

    const queue = shuffle(
      items.map((item) => ({
        quiz: item.quiz,
        moduleId: item.moduleId,
        slotId: item.slotId,
      })),
    )

    set({
      session: {
        moduleId: `topic:${topicId}`,
        topicId,
        filter,
        queue,
        currentIndex: 0,
        results: [],
      },
    })
    return true
  },

  recordResult: (slotId, score) =>
    set((state) => {
      if (!state.session) return state
      return {
        session: {
          ...state.session,
          results: [...state.session.results, { slotId, score, passed: score >= PASS_THRESHOLD }],
        },
      }
    }),

  nextQuestion: () =>
    set((state) => {
      if (!state.session) return state
      return {
        session: {
          ...state.session,
          currentIndex: state.session.currentIndex + 1,
        },
      }
    }),

  endSession: () => set({ session: null }),
}))
