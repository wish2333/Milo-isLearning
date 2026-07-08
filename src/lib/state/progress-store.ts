/**
 * Progress Store — 学习状态机 + 费曼作答追踪（Zustand + persist）
 *
 * 对应 docs/M4-M5-Plan.md W1 / Tech Spec §5.1 状态机 / §5.5 Feynman。
 *
 * 核心职责：
 *   - 管理 ModuleStage 状态转移（module_intro → concept → feynman → done）
 *   - 封装 advance/retry 转移规则，UI 只调 action 不操作 stage
 *   - 追踪 Feynman 步骤得分 + 最终输出
 *
 * 状态机转移图（Tech Spec §5.1）：
 *   module_intro --[start]--> concept(0, 0)
 *   concept(i, q) --[advance]--> next-quiz | next-concept | feynman_intro
 *   concept(i, q) --[retry]--> concept(i, q)（不转移，module-store 替换 quiz）
 *   feynman_intro --[start-feynman]--> feynman_step(1)
 *   feynman_step(k) --[advance]--> feynman_step(k+1) | feynman_final
 *   feynman_final --[submit]--> done
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

import type { FeynmanAttempt, ModuleStage } from '@/types/domain'

import { useModuleStore } from './module-store'

interface ProgressStoreState {
  /** 当前 Module ID；null = 未开始 */
  moduleId: string | null
  /** 当前阶段；null = 未开始 */
  stage: ModuleStage | null
  /** 最后更新时间戳 */
  updatedAt: number
  /** 费曼作答记录（feynman_intro 阶段初始化，done 阶段提交） */
  feynmanAttempt: FeynmanAttempt | null

  // --- 生命周期 ---

  /** 初始化 Module 学习：设置 moduleId + stage = module_intro */
  startModule: (moduleId: string) => void

  /** 从 module_intro 进入 concept(0, 0) */
  startConcept: () => void

  // --- Concept 阶段转移 ---

  /**
   * 推进到下一题 / 下一 Concept / Feynman 阶段。
   * 从 module-store 读取当前 Module 结构来计算转移目标。
   */
  advance: () => void

  /**
   * retry 不触发状态机转移——保持当前 stage 不变。
   * 调用方负责通过 module-store.replaceCurrentQuiz() 替换题目。
   */
  retry: () => void

  // --- Feynman 阶段 ---

  /** 从 feynman_intro 或 concept 末尾进入 feynman_step(1) */
  startFeynman: () => void

  /** 记录单个 Feynman 步骤的得分 */
  recordFeynmanStep: (stepOrder: number, score: number) => void

  /** feynman_final 提交最终输出 */
  submitFeynman: (finalOutput: string, finalScore: number, finalGaps: string[]) => void

  // --- 通用 ---

  /** 手动设置 stage（用于从 LocalStorage 恢复 / 调试） */
  setStage: (stage: ModuleStage) => void

  /** 重置全部进度（退出 Module / 清除进度时调用） */
  reset: () => void
}

const initialState = {
  moduleId: null as string | null,
  stage: null as ModuleStage | null,
  updatedAt: 0,
  feynmanAttempt: null as FeynmanAttempt | null,
}

export const useProgressStore = create<ProgressStoreState>()(
  persist(
    (set, get) => ({
      ...initialState,

      startModule: (moduleId) =>
        set({
          moduleId,
          stage: { kind: 'module_intro' },
          updatedAt: Date.now(),
          feynmanAttempt: null,
        }),

      startConcept: () => {
        const { moduleId } = get()
        if (!moduleId) return
        set({
          stage: { kind: 'concept', conceptIndex: 0, quizIndex: 0 },
          updatedAt: Date.now(),
        })
      },

      advance: () => {
        const state = get()
        if (!state.stage) return

        const currentModule = useModuleStore.getState().currentModule
        if (!currentModule) return

        const stage = state.stage

        switch (stage.kind) {
          case 'module_intro': {
            // 导言 → 第一道 concept 题
            set({
              stage: { kind: 'concept', conceptIndex: 0, quizIndex: 0 },
              updatedAt: Date.now(),
            })
            break
          }

          case 'concept': {
            const { conceptIndex, quizIndex } = stage
            const concept = currentModule.concepts[conceptIndex]
            if (!concept) return

            const quizCount = concept.quizSeries.quizzes.length

            // 同一 Concept 内还有下一题
            if (quizIndex + 1 < quizCount) {
              set({
                stage: { kind: 'concept', conceptIndex, quizIndex: quizIndex + 1 },
                updatedAt: Date.now(),
              })
              return
            }

            // 跳到下一 Concept
            if (conceptIndex + 1 < currentModule.concepts.length) {
              set({
                stage: { kind: 'concept', conceptIndex: conceptIndex + 1, quizIndex: 0 },
                updatedAt: Date.now(),
              })
              return
            }

            // 所有 Concept 完成 → 进入 Feynman
            set({
              stage: { kind: 'feynman_intro' },
              updatedAt: Date.now(),
            })
            break
          }

          case 'challenge': {
            // Challenge 是 Should/W9，当前跳过到 feynman_intro
            set({
              stage: { kind: 'feynman_intro' },
              updatedAt: Date.now(),
            })
            break
          }

          case 'feynman_intro': {
            set({
              stage: { kind: 'feynman_step', stepOrder: 1 },
              updatedAt: Date.now(),
              feynmanAttempt: {
                moduleId: state.moduleId ?? '',
                stepResults: [],
                submittedAt: 0,
              },
            })
            break
          }

          case 'feynman_step': {
            if (stage.stepOrder < 5) {
              set({
                stage: { kind: 'feynman_step', stepOrder: (stage.stepOrder + 1) as 2 | 3 | 4 | 5 },
                updatedAt: Date.now(),
              })
            } else {
              set({
                stage: { kind: 'feynman_final' },
                updatedAt: Date.now(),
              })
            }
            break
          }

          case 'feynman_final': {
            // submitFeynman() 负责转移到 done
            break
          }

          case 'done': {
            // 终态，无转移
            break
          }
        }
      },

      retry: () => {
        // retry 不触发状态机转移，仅更新时间戳
        set({ updatedAt: Date.now() })
      },

      startFeynman: () => {
        const { moduleId } = get()
        if (!moduleId) return
        set({
          stage: { kind: 'feynman_step', stepOrder: 1 },
          updatedAt: Date.now(),
          feynmanAttempt: {
            moduleId,
            stepResults: [],
            submittedAt: 0,
          },
        })
      },

      recordFeynmanStep: (stepOrder, score) =>
        set((state) => {
          if (!state.feynmanAttempt) return state
          return {
            feynmanAttempt: {
              ...state.feynmanAttempt,
              stepResults: [
                ...state.feynmanAttempt.stepResults.filter((s) => s.stepOrder !== stepOrder),
                { stepOrder, score },
              ],
            },
            updatedAt: Date.now(),
          }
        }),

      submitFeynman: (finalOutput, finalScore, finalGaps) =>
        set((state) => {
          if (!state.feynmanAttempt) return state
          return {
            stage: { kind: 'done' },
            feynmanAttempt: {
              ...state.feynmanAttempt,
              finalOutput,
              finalScore,
              finalGaps,
              submittedAt: Date.now(),
            },
            updatedAt: Date.now(),
          }
        }),

      setStage: (stage) => set({ stage, updatedAt: Date.now() }),

      reset: () => set(initialState),
    }),
    {
      name: 'alc:state:progress',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        moduleId: state.moduleId,
        stage: state.stage,
        updatedAt: state.updatedAt,
        feynmanAttempt: state.feynmanAttempt,
      }),
    },
  ),
)
