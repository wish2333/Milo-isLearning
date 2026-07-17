/**
 * Module Store — 当前学习 Module + 当前 Quiz 引用（Zustand + persist）
 *
 * 对应 docs/M4-M5-Plan.md W1 / Tech Spec §6.2 module-store。
 *
 * 职责：
 *   - 持有当前正在学习的 Module（编译产物）
 *   - 持有当前正在作答的 Quiz（可能是 retry 生成的替换题）
 *   - retry 时不触发状态机转移，仅替换 currentQuiz
 *
 * 持久化策略：
 *   - currentModule 持久化（刷新后恢复）
 *   - currentQuiz 持久化（刷新后恢复到当前题）
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

import type { Module, Quiz } from '@/types/domain'
import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { renameModule, updateQuizInModule } from '@/lib/persistence/module-library'
import { findQuizInModule } from '@/lib/runtime/adaptive-sequencer'
import { synchronizeScheduleForSlot } from '@/lib/runtime/fsrs-schedule-coordinator'
import { getStorage } from '@/lib/persistence/client/storage'
import { createZustandStorage } from '@/lib/persistence/client/zustand-storage-adapter'
import { scheduleLibrary } from '@/lib/persistence/schedule-library'
import { StorageKeys } from '@/lib/persistence/shared/keys'
import { useAttemptsStore } from './attempts-store'

interface ModuleStoreState {
  /** 当前学习的 Module；null = 未开始学习 */
  currentModule: Module | null
  /** 当前 Quiz 引用（可能是替换题）；null = 未进入 Concept 学习 */
  currentQuiz: Quiz | null

  /** 设置当前 Module（编译完成 / 从历史恢复时调用） */
  setModule: (module: Module) => void

  /** 设置当前 Quiz */
  setCurrentQuiz: (quiz: Quiz) => void

  /** 用替换题替换当前 Quiz（retry 时调用） */
  replaceCurrentQuiz: (replacement: Quiz) => void

  /** 清除当前 Quiz（advance 到下一题时调用） */
  clearCurrentQuiz: () => void

  /** 清除全部（退出学习 / 切换 Module 时调用） */
  clear: () => void

  /** 重命名当前 Module 的 title（同步持久化 + 更新内存状态） */
  renameCurrentModule: (newTitle: string) => void

  /** 修正当前 Module 内某道 Quiz 的字段（F40 修正答案 / F41 标记忽略 / 题目编辑） */
  correctQuizAnswer: (
    quizId: string,
    patch: Partial<
      Pick<
        Quiz,
        | 'answer'
        | 'options'
        | 'acceptableAnswers'
        | 'ignored'
        | 'stem'
        | 'explanation'
        | 'distractors'
        | 'answerHint'
      >
    >,
  ) => void

  /** 更新 Concept 的 knowledgePage 内容（AI 扩充模式编辑） */
  updateKnowledgePage: (conceptId: string, content: string) => void
}

export const useModuleStore = create<ModuleStoreState>()(
  persist(
    (set, get) => ({
      currentModule: null,
      currentQuiz: null,

      setModule: (module) => set({ currentModule: module, currentQuiz: null }),

      setCurrentQuiz: (quiz) => set({ currentQuiz: quiz }),

      replaceCurrentQuiz: (replacement) => set({ currentQuiz: replacement }),

      clearCurrentQuiz: () => set({ currentQuiz: null }),

      clear: () => set({ currentModule: null, currentQuiz: null }),

      renameCurrentModule: (newTitle) => {
        const current = get().currentModule
        if (!current) return
        renameModule(getStorage(), current.id, newTitle)
        set({ currentModule: { ...current, title: newTitle.trim() } })
      },

      correctQuizAnswer: (quizId, patch) => {
        const current = get().currentModule
        if (!current) return
        const updatedModule = updateQuizInModule(getStorage(), current.id, quizId, patch)
        set({ currentModule: updatedModule })
        const updatedQuiz = findQuizInModule(updatedModule, quizId)
        if (!updatedQuiz) return

        if (get().currentQuiz?.id === quizId) set({ currentQuiz: updatedQuiz })

        // SchedulingData 是 attempts 的派生缓存：忽略题目时删除，恢复时用
        // 当前 Module/Quiz 与完整 attempts 历史重放。这里不检查 FSRS 开关，
        // 以确保缓存命名空间始终与题库和作答历史保持一致。
        if (patch.ignored === true) {
          scheduleLibrary.remove(quizId)
        } else if (patch.ignored === false) {
          synchronizeScheduleForSlot({
            slotId: quizId,
            moduleId: updatedModule.id,
            conceptId: updatedQuiz.conceptId,
            quiz: updatedQuiz,
            attempts: useAttemptsStore.getState().getAttempts(quizId),
          })
        }
      },

      updateKnowledgePage: (conceptId, content) => {
        const current = get().currentModule
        if (!current) return
        if (current.origin === 'showcase') return

        const targetConcept = current.concepts.find((c) => c.id === conceptId)
        if (!targetConcept) return

        const updatedConcepts = current.concepts.map((c) =>
          c.id === conceptId ? { ...c, knowledgePage: content } : c,
        )
        const updatedModule: Module = { ...current, concepts: updatedConcepts }
        getStorage().set(StorageKeys.module(current.id), updatedModule)
        set({ currentModule: updatedModule })
      },
    }),
    {
      name: 'alc:state:module',
      storage: createJSONStorage(() => createZustandStorage(getStorage())),
      skipHydration: !isShowcaseMode,
    },
  ),
)
