/**
 * Attempts Store — 作答历史（Zustand + persist）
 *
 * 对应 docs/M4-M5-Plan.md W1 / Tech Spec §5.3 / §6.2 attempts-store。
 *
 * 职责：
 *   - 按 originalQuizId（槽位）分组存储 AttemptRecord[]
 *   - 提供查询接口供 retry-policy / mastery 计算
 *   - 每次 addAttempt 后触发 mastery 重算（通过 progress-store）
 *
 * 数据结构：
 *   attemptsBySlot: Record<originalQuizId, AttemptRecord[]>
 *   每个 slot 的记录按 timestamp 升序（addAttempt 追加到末尾）
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

import type { AttemptRecord, Quiz } from '@/types/domain'
import type { LLMProvider } from '@/lib/providers'
import type { FeedbackRuntime } from '@/lib/compiler/agents/mappers'
import { evaluateAnswerAsync } from '@/lib/runtime/evaluate-answer'
import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { getStorage } from '@/lib/persistence/client/storage'
import { createZustandStorage } from '@/lib/persistence/client/zustand-storage-adapter'
import { triggerAutoBackup } from '@/lib/persistence/client/auto-backup-trigger'
import { scheduleLibrary } from '@/lib/persistence/schedule-library'
import { localDateString, loadStreak, saveStreak, updateStreak } from '@/lib/runtime/streak'

interface AttemptsStoreState {
  /** 以 originalQuizId（槽位 id）为 key 的作答历史 */
  attemptsBySlot: Record<string, AttemptRecord[]>

  /** 追加一条作答记录到对应槽位 */
  addAttempt: (attempt: AttemptRecord) => void

  /** 获取某槽位的全部作答记录（按时间升序） */
  getAttempts: (slotId: string) => AttemptRecord[]

  /** 获取某槽位当前连续失败次数对应的 attemptVersion（用于新建 AttemptRecord） */
  getNextAttemptVersion: (slotId: string) => number

  markGuessed: (originalQuizId: string) => void

  /** 撤销最后一次的蒙对标注 */
  unmarkGuessed: (originalQuizId: string) => void

  /**
   * 用修正后的 quiz 重新评估某 slot 的最后一条作答，原地更新其 score/gaps/nextAction。
   * 用于 F40 答案修正后纠正历史判定。保留 userAnswer/timestamp/guessed 不变。
   * async（fill_blank 可能触发语义判分 LLM 调用）。
   * @returns re-evaluated FeedbackRuntime for display update.
   */
  reevaluateLastAttempt: (
    slotId: string,
    correctedQuiz: Quiz,
    provider?: LLMProvider | null,
  ) => Promise<FeedbackRuntime>

  /** 清除单个槽位的全部记录 */
  clearSlot: (slotId: string) => void

  /** 清除全部记录 */
  clearAll: () => void
}

export const useAttemptsStore = create<AttemptsStoreState>()(
  persist(
    (set, get) => ({
      attemptsBySlot: {},

      addAttempt: (attempt) => {
        set((state) => {
          const existing = state.attemptsBySlot[attempt.originalQuizId] ?? []
          return {
            attemptsBySlot: {
              ...state.attemptsBySlot,
              [attempt.originalQuizId]: [...existing, attempt],
            },
          }
        })
        void triggerAutoBackup(false)
        recordStudyDay()
      },

      getAttempts: (slotId) => get().attemptsBySlot[slotId] ?? [],

      getNextAttemptVersion: (slotId) => {
        const attempts = get().attemptsBySlot[slotId] ?? []
        return attempts.length
      },

      clearSlot: (slotId) =>
        set((state) => {
          const next = { ...state.attemptsBySlot }
          delete next[slotId]
          scheduleLibrary.remove(slotId)
          return { attemptsBySlot: next }
        }),

      markGuessed: (originalQuizId) =>
        set((state) => {
          const attempts = state.attemptsBySlot[originalQuizId]
          if (!attempts || attempts.length === 0) return state
          const last = attempts[attempts.length - 1]
          if (!last || last.guessed) return state
          const updated: AttemptRecord = { ...last, guessed: true }
          return {
            attemptsBySlot: {
              ...state.attemptsBySlot,
              [originalQuizId]: [...attempts.slice(0, -1), updated],
            },
          }
        }),

      unmarkGuessed: (originalQuizId) =>
        set((state) => {
          const attempts = state.attemptsBySlot[originalQuizId]
          if (!attempts || attempts.length === 0) return state
          const last = attempts[attempts.length - 1]
          if (!last || !last.guessed) return state
          const { guessed: _guessed, ...rest } = last
          const updated: AttemptRecord = rest
          return {
            attemptsBySlot: {
              ...state.attemptsBySlot,
              [originalQuizId]: [...attempts.slice(0, -1), updated],
            },
          }
        }),

      reevaluateLastAttempt: async (slotId, correctedQuiz, provider) => {
        const attempts = get().attemptsBySlot[slotId]
        if (!attempts || attempts.length === 0) {
          return { score: 0, gaps: [], nextAction: 'retry', feedbackText: '' }
        }
        const last = attempts[attempts.length - 1]!
        const result = await evaluateAnswerAsync(correctedQuiz, last.userAnswer, provider)
        const updated: AttemptRecord = {
          ...last,
          score: result.score,
          gaps: result.gaps,
          nextAction: result.nextAction,
        }
        set((state) => ({
          attemptsBySlot: {
            ...state.attemptsBySlot,
            [slotId]: [...attempts.slice(0, -1), updated],
          },
        }))
        return result
      },

      clearAll: () => {
        set({ attemptsBySlot: {} })
        scheduleLibrary.clearAll()
      },
    }),
    {
      name: 'alc:state:attempts',
      storage: createJSONStorage(() => createZustandStorage(getStorage())),
      skipHydration: !isShowcaseMode,
    },
  ),
)

/** Streak 是反馈数据，写入失败不能阻断已经完成的作答。 */
function recordStudyDay(): void {
  try {
    const repo = getStorage()
    const current = loadStreak(repo)
    const next = updateStreak(current, localDateString())
    saveStreak(next, repo)
  } catch (error) {
    console.warn('[streak] 保存学习连续统计失败', error)
  }
}
