/**
 * Topic Session Store — 主题刷题会话（Zustand, 持久化）
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

import type { ModuleTopicStatus, ProgressState, TopicProgress, TopicSession } from '@/types/domain'
import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { getStorage } from '@/lib/persistence/client/storage'
import { createZustandStorage } from '@/lib/persistence/client/zustand-storage-adapter'
import { StorageKeys } from '@/lib/persistence/shared/keys'
import { getTopic } from '@/lib/persistence/topic-library'

interface TopicSessionStoreState {
  session: TopicSession | null
  startSession: (topicId: string) => boolean
  markCurrentModuleDone: () => void
  /** 标记主题内任意模块为完成（用户偏离 currentIndex 流程学完某模块时使用）。 */
  markModuleDone: (moduleId: string) => void
  advanceToNextModule: () => string | null
  skipCurrentModule: () => string | null
  reenterModule: (moduleId: string) => void
  getCurrentModuleId: () => string | null
  exitSession: () => void
  isActive: () => boolean
}

/**
 * 合并主题会话状态与模块进度，仅用于呈现层防御性校正。
 * 主题会话仍是编排真值；模块进度只在会话状态明显落后时提升展示状态。
 */
export function mergeModuleTopicStatus(
  status: ModuleTopicStatus | undefined,
  progress: ProgressState | null | undefined,
): ModuleTopicStatus {
  const sessionStatus = status ?? 'pending'
  if (sessionStatus === 'done' || progress?.stage.kind === 'done') return 'done'

  // module_intro 是刚开始模块时的初始快照，不足以证明用户已经开始作答。
  if (sessionStatus === 'pending' && progress && progress.stage.kind !== 'module_intro') {
    return 'in_progress'
  }

  return sessionStatus
}

function persistTopicProgress(session: TopicSession): void {
  const completed = session.moduleIds.filter(
    (moduleId) => session.moduleStatus[moduleId] === 'done',
  )
  const skipped = session.moduleIds.filter(
    (moduleId) => session.moduleStatus[moduleId] === 'skipped',
  )
  const progress: TopicProgress = {
    topicId: session.topicId,
    completedModuleIds: completed,
    skippedModuleIds: skipped,
    lastVisitedAt: Date.now(),
  }
  getStorage().set(StorageKeys.topicProgress(session.topicId), progress)
}

function isReusableTopicSession(
  session: TopicSession,
  topicId: string,
  moduleIds: string[],
): boolean {
  if (session.topicId !== topicId || session.moduleIds.length !== moduleIds.length) return false
  if (session.moduleIds.some((moduleId, index) => moduleId !== moduleIds[index])) return false
  if (session.currentIndex < 0 || session.currentIndex >= session.moduleIds.length) return false

  const currentModuleId = session.moduleIds[session.currentIndex]
  if (!currentModuleId || session.moduleStatus[currentModuleId] !== 'in_progress') return false

  return session.moduleIds.every((moduleId) => {
    const status = session.moduleStatus[moduleId]
    return (
      status === 'pending' || status === 'in_progress' || status === 'done' || status === 'skipped'
    )
  })
}

export const useTopicSessionStore = create<TopicSessionStoreState>()(
  persist(
    (set, get) => ({
      session: null,

      startSession: (topicId) => {
        const topic = getTopic(getStorage(), topicId)
        if (!topic || topic.moduleIds.length === 0) return false

        const currentSession = get().session
        if (currentSession && isReusableTopicSession(currentSession, topicId, topic.moduleIds)) {
          return true
        }

        // F22: 读取上次进度快照，恢复已完成/已跳过模块状态
        const saved: TopicProgress | null = getStorage().get<TopicProgress>(
          StorageKeys.topicProgress(topicId),
        )
        const completedSet = new Set(saved?.completedModuleIds ?? [])
        const skippedSet = new Set(saved?.skippedModuleIds ?? [])

        // 从第一个未完成且未跳过的模块开始
        const firstIncompleteIndex = topic.moduleIds.findIndex(
          (mid) => !completedSet.has(mid) && !skippedSet.has(mid),
        )
        const startIndex = firstIncompleteIndex >= 0 ? firstIncompleteIndex : 0

        const moduleStatusWithProgress: Record<string, ModuleTopicStatus> = {}
        for (const mid of topic.moduleIds) {
          if (completedSet.has(mid)) {
            moduleStatusWithProgress[mid] = 'done'
          } else if (skippedSet.has(mid)) {
            moduleStatusWithProgress[mid] = 'skipped'
          } else {
            moduleStatusWithProgress[mid] = 'pending'
          }
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
        const state = get()
        if (!state.session) return
        const currentId = state.session.moduleIds[state.session.currentIndex]
        if (!currentId) return
        const nextSession: TopicSession = {
          ...state.session,
          moduleStatus: {
            ...state.session.moduleStatus,
            [currentId]: 'done',
          },
        }
        set({ session: nextSession })
        persistTopicProgress(nextSession)
      },

      markModuleDone: (moduleId: string) => {
        const state = get()
        if (!state.session) return
        if (!state.session.moduleIds.includes(moduleId)) return
        const nextSession: TopicSession = {
          ...state.session,
          moduleStatus: {
            ...state.session.moduleStatus,
            [moduleId]: 'done',
          },
        }
        set({ session: nextSession })
        persistTopicProgress(nextSession)
      },

      advanceToNextModule: () => {
        const state = get()
        if (!state.session) return null
        const nextIndex = state.session.currentIndex + 1
        if (nextIndex >= state.session.moduleIds.length) return null

        const nextModuleId = state.session.moduleIds[nextIndex]!
        const nextSession: TopicSession = {
          ...state.session,
          currentIndex: nextIndex,
          moduleStatus: {
            ...state.session.moduleStatus,
            [nextModuleId]: 'in_progress',
          },
        }
        set({ session: nextSession })
        persistTopicProgress(nextSession)
        return nextModuleId
      },

      skipCurrentModule: () => {
        const state = get()
        if (!state.session) return null
        const currentId = state.session.moduleIds[state.session.currentIndex]
        if (!currentId) return null

        const nextIndex = state.session.currentIndex + 1
        const isLast = nextIndex >= state.session.moduleIds.length

        const updatedStatus = {
          ...state.session.moduleStatus,
          [currentId]: 'skipped' as const,
        }

        if (!isLast) {
          const nextModuleId = state.session.moduleIds[nextIndex]!
          updatedStatus[nextModuleId] = 'in_progress'
        }

        const nextSession: TopicSession = {
          ...state.session,
          currentIndex: isLast ? state.session.currentIndex : nextIndex,
          moduleStatus: updatedStatus,
        }
        set({ session: nextSession })
        persistTopicProgress(nextSession)

        return isLast ? null : state.session.moduleIds[nextIndex]!
      },

      reenterModule: (moduleId: string) => {
        const state = get()
        if (!state.session) return
        const index = state.session.moduleIds.indexOf(moduleId)
        if (index < 0) return

        const nextSession: TopicSession = {
          ...state.session,
          currentIndex: index,
          moduleStatus: {
            ...state.session.moduleStatus,
            [moduleId]: 'in_progress',
          },
        }
        set({ session: nextSession })
        persistTopicProgress(nextSession)
      },

      getCurrentModuleId: () => {
        const session = get().session
        if (!session) return null
        return session.moduleIds[session.currentIndex] ?? null
      },

      exitSession: () => {
        const { session } = get()
        if (session) persistTopicProgress(session)
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
