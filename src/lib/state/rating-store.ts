/**
 * Rating Store — 完成页模块评分（Zustand + persist）
 *
 * 持久化到 LocalStorage `alc:ratings`。
 * 每个 Module 只能评一次，评后只读。
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

import { StorageKeys } from '@/lib/persistence/keys'

interface RatingEntry {
  score: number
  ratedAt: number
}

interface RatingStoreState {
  ratings: Record<string, RatingEntry>
  setRating: (moduleId: string, score: number) => void
  getRating: (moduleId: string) => RatingEntry | undefined
}

export const useRatingStore = create<RatingStoreState>()(
  persist(
    (set, get) => ({
      ratings: {},

      setRating: (moduleId, score) =>
        set((state) => ({
          ratings: {
            ...state.ratings,
            [moduleId]: { score, ratedAt: Date.now() },
          },
        })),

      getRating: (moduleId) => get().ratings[moduleId],
    }),
    {
      name: StorageKeys.ratings,
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
