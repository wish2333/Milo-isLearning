/**
 * Review Store — 错题重刷会话（Zustand, 非持久化）
 *
 * 内存 only — 刷新即丢失，不写入 LocalStorage。
 * 不影响 computeMastery（review attempts 有 attemptVersion > 0）。
 */

import { create } from 'zustand'

import type { AttemptRecord, Quiz } from '@/types/domain'

import { loadStoredModule } from '@/lib/persistence/module-library'
import { storage } from '@/lib/persistence/local-storage'
import { useAttemptsStore } from '@/lib/state/attempts-store'
import { findQuizInModule } from '@/lib/runtime/adaptive-sequencer'

const PASS_THRESHOLD = 80

export interface ReviewResult {
  slotId: string
  score: number
  passed: boolean
}

export interface ReviewSession {
  moduleId: string
  queue: Quiz[]
  currentIndex: number
  results: ReviewResult[]
}

interface ReviewStoreState {
  session: ReviewSession | null
  startSession: (moduleId: string) => boolean
  recordResult: (slotId: string, score: number) => void
  nextQuestion: () => void
  endSession: () => void
}

function shuffle<T>(array: T[]): T[] {
  const result = [...array]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j]!, result[i]!]
  }
  return result
}

function collectWrongSlotIds(
  module: ReturnType<typeof loadStoredModule>,
  attemptsBySlot: Record<string, AttemptRecord[]>,
): string[] {
  if (!module) return []

  const slotIds: string[] = []

  for (const concept of module.concepts) {
    for (const quiz of concept.quizSeries.quizzes) {
      const attempts = attemptsBySlot[quiz.id]
      if (!attempts || attempts.length === 0) continue
      const hasWrong = attempts.some((a) => a.score < PASS_THRESHOLD)
      const hasGuessed = attempts.some((a) => a.guessed === true)
      if (hasWrong || hasGuessed) slotIds.push(quiz.id)
    }
  }

  if (module.challengeQuizzes) {
    for (const quiz of module.challengeQuizzes) {
      const attempts = attemptsBySlot[quiz.id]
      if (!attempts || attempts.length === 0) continue
      const hasWrong = attempts.some((a) => a.score < PASS_THRESHOLD)
      const hasGuessed = attempts.some((a) => a.guessed === true)
      if (hasWrong || hasGuessed) slotIds.push(quiz.id)
    }
  }

  return slotIds
}

export const useReviewStore = create<ReviewStoreState>()((set) => ({
  session: null,

  startSession: (moduleId) => {
    const moduleData = loadStoredModule(storage, moduleId)
    if (!moduleData) return false

    const attemptsBySlot = useAttemptsStore.getState().attemptsBySlot

    const wrongSlotIds = collectWrongSlotIds(moduleData, attemptsBySlot)
    if (wrongSlotIds.length === 0) return false

    const queue = wrongSlotIds
      .map((id) => findQuizInModule(moduleData, id))
      .filter((q): q is Quiz => q !== undefined)

    set({
      session: {
        moduleId,
        queue: shuffle(queue),
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
