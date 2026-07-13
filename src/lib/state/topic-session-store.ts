/**
 * Topic Session Store — 主题刷题会话（Zustand, 持久化）
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

import type { ModuleTopicStatus, TopicSession } from '@/types/domain'
import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { getStorage } from '@/lib/persistence/client/storage'
import { createZustandStorage } from '@/lib/persistence/client/zustand-storage-adapter'
import { getTopic } from '@/lib/persistence/topic-library'
import { storage } from '@/lib/persistence/client/local-storage'

interface TopicSessionStoreState {
  session: TopicSession | null
  startSession: (topicId: string) => boolean
  markCurrentModuleDone: () => void
  advanceToNextModule: () => string | null
  getCurrentModuleId: () => string | null
  exitSession: () => void
  isActive: () => boolean
}

export const useTopicSessionStore = create<TopicSessionStoreState>()(
  persist(
    (set, get) => ({
      session: null,

      startSession: (topicId) => {
        const topic = getTopic(storage, topicId)
        if (!topic || topic.moduleIds.length === 0) return false

        const moduleStatus: Record<string, ModuleTopicStatus> = {}
        for (const mid of topic.moduleIds) {
          moduleStatus[mid] = 'pending'
        }
        const firstModuleId = topic.moduleIds[0]!
        moduleStatus[firstModuleId] = 'in_progress'

        set({
          session: {
            topicId,
            moduleIds: [...topic.moduleIds],
            currentIndex: 0,
            moduleStatus,
            startedAt: Date.now(),
          },
        })
        return true
      },

      markCurrentModuleDone: () => {
        set((state) => {
          if (!state.session) return state
          const currentId = state.session.moduleIds[state.session.currentIndex]
          if (!currentId) return state
          return {
            session: {
              ...state.session,
              moduleStatus: {
                ...state.session.moduleStatus,
                [currentId]: 'done',
              },
            },
          }
        })
      },

      advanceToNextModule: () => {
        const state = get()
        if (!state.session) return null
        const nextIndex = state.session.currentIndex + 1
        if (nextIndex >= state.session.moduleIds.length) return null

        const nextModuleId = state.session.moduleIds[nextIndex]!
        set({
          session: {
            ...state.session,
            currentIndex: nextIndex,
            moduleStatus: {
              ...state.session.moduleStatus,
              [nextModuleId]: 'in_progress',
            },
          },
        })
        return nextModuleId
      },

      getCurrentModuleId: () => {
        const session = get().session
        if (!session) return null
        return session.moduleIds[session.currentIndex] ?? null
      },

      exitSession: () => set({ session: null }),

      isActive: () => get().session !== null,
    }),
    {
      name: 'alc:state:topic-session',
      storage: createJSONStorage(() => createZustandStorage(getStorage())),
      skipHydration: !isShowcaseMode,
    },
  ),
)
