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

import type { AttemptRecord } from '@/types/domain'

interface AttemptsStoreState {
  /** 以 originalQuizId（槽位 id）为 key 的作答历史 */
  attemptsBySlot: Record<string, AttemptRecord[]>

  /** 追加一条作答记录到对应槽位 */
  addAttempt: (attempt: AttemptRecord) => void

  /** 获取某槽位的全部作答记录（按时间升序） */
  getAttempts: (slotId: string) => AttemptRecord[]

  /** 获取某槽位当前连续失败次数对应的 attemptVersion（用于新建 AttemptRecord） */
  getNextAttemptVersion: (slotId: string) => number

  /** 清除单个槽位的全部记录 */
  clearSlot: (slotId: string) => void

  /** 清除全部记录 */
  clearAll: () => void
}

export const useAttemptsStore = create<AttemptsStoreState>()(
  persist(
    (set, get) => ({
      attemptsBySlot: {},

      addAttempt: (attempt) =>
        set((state) => {
          const existing = state.attemptsBySlot[attempt.originalQuizId] ?? []
          return {
            attemptsBySlot: {
              ...state.attemptsBySlot,
              [attempt.originalQuizId]: [...existing, attempt],
            },
          }
        }),

      getAttempts: (slotId) => get().attemptsBySlot[slotId] ?? [],

      getNextAttemptVersion: (slotId) => {
        const attempts = get().attemptsBySlot[slotId] ?? []
        return attempts.length
      },

      clearSlot: (slotId) =>
        set((state) => {
          const next = { ...state.attemptsBySlot }
          delete next[slotId]
          return { attemptsBySlot: next }
        }),

      clearAll: () => set({ attemptsBySlot: {} }),
    }),
    {
      name: 'alc:state:attempts',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
