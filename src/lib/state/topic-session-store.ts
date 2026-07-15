/**
 * Topic Session Store — 主题刷题会话（Zustand, 持久化）
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

import type { ModuleTopicStatus, TopicProgress, TopicSession } from '@/types/domain'
import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { getStorage } from '@/lib/persistence/client/storage'
import { createZustandStorage } from '@/lib/persistence/client/zustand-storage-adapter'
import { StorageKeys } from '@/lib/persistence/shared/keys'
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

        // F22: 读取上次进度快照，恢复已完成模块状态
        const saved: TopicProgress | null = storage.get<TopicProgress>(
          StorageKeys.topicProgress(topicId),
        )
        const completedSet = new Set(saved?.completedModuleIds ?? [])

        // 从第一个未完成模块开始（全部完成则从头）
        const firstIncompleteIndex = topic.moduleIds.findIndex((mid) => !completedSet.has(mid))
        const startIndex = firstIncompleteIndex >= 0 ? firstIncompleteIndex : 0

        const moduleStatusWithProgress: Record<string, ModuleTopicStatus> = {}
        for (const mid of topic.moduleIds) {
          moduleStatusWithProgress[mid] = completedSet.has(mid) ? 'done' : 'pending'
        }
        if (startIndex < topic.moduleIds.length) {
          moduleStatusWithProgress[topic.moduleIds[startIndex]!] = 'in_progress'
        }

        set({
          session: {
            topicId,
            moduleIds: [...topic.moduleIds],
            currentIndex: startIndex,
            moduleStatus: moduleStatusWithProgress,
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

      exitSession: () => {
        const { session } = get()
        if (session) {
          const completed = Object.entries(session.moduleStatus)
            .filter(([, status]) => status === 'done')
            .map(([moduleId]) => moduleId)
          const progress: TopicProgress = {
            topicId: session.topicId,
            completedModuleIds: completed,
            lastVisitedAt: Date.now(),
          }
          storage.set(StorageKeys.topicProgress(session.topicId), progress)
        }
        set({ session: null })
      },

      isActive: () => get().session !== null,
    }),
    {
      name: 'alc:state:topic-session',
      storage: createJSONStorage(() => createZustandStorage(getStorage())),
      skipHydration: !isShowcaseMode,
    },
  ),
)
