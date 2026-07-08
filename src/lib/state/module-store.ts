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
}

export const useModuleStore = create<ModuleStoreState>()(
  persist(
    (set) => ({
      currentModule: null,
      currentQuiz: null,

      setModule: (module) => set({ currentModule: module, currentQuiz: null }),

      setCurrentQuiz: (quiz) => set({ currentQuiz: quiz }),

      replaceCurrentQuiz: (replacement) => set({ currentQuiz: replacement }),

      clearCurrentQuiz: () => set({ currentQuiz: null }),

      clear: () => set({ currentModule: null, currentQuiz: null }),
    }),
    {
      name: 'alc:state:module',
      storage: createJSONStorage(() => localStorage),
    },
  ),
)
