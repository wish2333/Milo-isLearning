/**
 * Rating Store — 完成页模块评分（Zustand + persist）
 *
 * 持久化到 LocalStorage `alc:ratings`。
 * 每个 Module 只能评一次，评后只读。
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

import { StorageKeys } from '@/lib/persistence/shared/keys'
import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { getStorage } from '@/lib/persistence/client/storage'
import { createZustandStorage } from '@/lib/persistence/client/zustand-storage-adapter'

interface RatingEntry {
  score: number
  ratedAt: number
}

interface RatingStoreState {
  ratings: Record<string, RatingEntry>
  setRating: (moduleId: string, score: number) => void
}

export const useRatingStore = create<RatingStoreState>()(
  persist(
    (set) => ({
      ratings: {},

      setRating: (moduleId, score) =>
        set((state) => ({
          ratings: {
            ...state.ratings,
            [moduleId]: { score, ratedAt: Date.now() },
          },
        })),
    }),
    {
      name: StorageKeys.ratings,
      storage: createJSONStorage(() => createZustandStorage(getStorage())),
      skipHydration: !isShowcaseMode,
    },
  ),
)
