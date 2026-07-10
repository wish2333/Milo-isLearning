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

import type { FeynmanAttempt, ModuleStage, ProgressState } from '@/types/domain'
import { StorageKeys } from '@/lib/persistence/keys'
import { storage } from '@/lib/persistence/local-storage'

import {
  collectReviewSlots,
  collectCarriedReviewSlots,
  collectConfirmSlots,
} from '@/lib/runtime/adaptive-sequencer'
import { useAttemptsStore } from './attempts-store'
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
            const currentReviewSlots = stage.reviewSlots ?? []
            const totalSlots = quizCount + currentReviewSlots.length

            // 同一 Concept 内还有下一题（含复习槽位）
            if (quizIndex + 1 < totalSlots) {
              set({
                stage: {
                  kind: 'concept',
                  conceptIndex,
                  quizIndex: quizIndex + 1,
                  ...(currentReviewSlots.length > 0 ? { reviewSlots: currentReviewSlots } : {}),
                },
                updatedAt: Date.now(),
              })
              return
            }

            // 跳到下一 Concept — 注入跨概念复习槽位
            if (conceptIndex + 1 < currentModule.concepts.length) {
              const attemptsBySlot = useAttemptsStore.getState().attemptsBySlot
              const wrongSlots = collectReviewSlots(currentModule, conceptIndex, attemptsBySlot)
              const carriedSlots = collectCarriedReviewSlots(currentReviewSlots, attemptsBySlot)
              const confirmSlots = collectConfirmSlots(
                currentModule,
                conceptIndex - 1,
                attemptsBySlot,
              )
              const nextReviewSlots = [...wrongSlots, ...carriedSlots, ...confirmSlots]

              set({
                stage: {
                  kind: 'concept',
                  conceptIndex: conceptIndex + 1,
                  quizIndex: 0,
                  ...(nextReviewSlots.length > 0 ? { reviewSlots: nextReviewSlots } : {}),
                },
                updatedAt: Date.now(),
              })
              return
            }

            // 所有 Concept 完成 → 进入 Challenge（如果有）或 Feynman
            if (currentModule.challengeQuizzes?.length) {
              set({
                stage: { kind: 'challenge', quizIndex: 0 },
                updatedAt: Date.now(),
              })
            } else {
              set({
                stage: { kind: 'feynman_intro' },
                updatedAt: Date.now(),
              })
            }
            break
          }

          case 'challenge': {
            // Challenge 正常推进：下一题或进入 Feynman
            const challengeCount = currentModule.challengeQuizzes?.length ?? 0
            if (stage.quizIndex + 1 < challengeCount) {
              set({
                stage: { kind: 'challenge', quizIndex: stage.quizIndex + 1 },
                updatedAt: Date.now(),
              })
            } else {
              set({
                stage: { kind: 'feynman_intro' },
                updatedAt: Date.now(),
              })
            }
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
      onRehydrateStorage: () => (state) => {
        // 首次加载（hydration）后同步到 per-module 存储
        if (state?.moduleId && state.stage) {
          storage.set<ProgressState>(StorageKeys.progress(state.moduleId), {
            moduleId: state.moduleId,
            stage: state.stage,
            updatedAt: state.updatedAt,
          })
        }
      },
    },
  ),
)

/**
 * 同步 progress-store 到 per-module 存储（alc:progress:{moduleId}）。
 *
 * 背景：listStoredModules 从 per-module key 读取 progress，但 Zustand persist
 * 只写到全局 key（alc:state:progress）。此 subscribe 桥接两者，使题库列表
 * 能获取到正确的 updatedAt / completed 状态。
 *
 * 触发时机：
 *   - 每次状态变更（advance / retry / startModule 等）
 *   - 切换 Module 时保存前一个 Module 的最终进度
 *   - reset 时不写（避免 clearAll 后又写入）
 */
useProgressStore.subscribe((state, prevState) => {
  // reset 后 state 为初始态，不写 per-module key
  if (!state.moduleId || !state.stage) return

  // 切换 Module 时保存前一个 Module 的最终进度
  if (prevState.moduleId && prevState.moduleId !== state.moduleId && prevState.stage) {
    storage.set<ProgressState>(StorageKeys.progress(prevState.moduleId), {
      moduleId: prevState.moduleId,
      stage: prevState.stage,
      updatedAt: prevState.updatedAt,
    })
  }

  // 始终同步当前 Module 的进度
  storage.set<ProgressState>(StorageKeys.progress(state.moduleId), {
    moduleId: state.moduleId,
    stage: state.stage,
    updatedAt: state.updatedAt,
  })
})
