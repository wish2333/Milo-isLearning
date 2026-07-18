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
import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { StorageKeys } from '@/lib/persistence/shared/keys'
import { getStorage } from '@/lib/persistence/client/storage'
import { createZustandStorage } from '@/lib/persistence/client/zustand-storage-adapter'
import { storage } from '@/lib/persistence/client/local-storage'
import { triggerAutoBackup } from '@/lib/persistence/client/auto-backup-trigger'

import {
  collectReviewSlots,
  collectCarriedReviewSlots,
  collectConfirmSlots,
} from '@/lib/runtime/adaptive-sequencer'
import { useAttemptsStore } from './attempts-store'
import { useModuleStore } from './module-store'
import { useSettingsStore } from './settings-store'

/**
 * Storage Invariant (V2.0.1): per-module progress keys
 *
 * `alc:progress:{moduleId}` 在所有运行模式下均通过 `storage`（LocalStorageRepository
 * 单例）读写。`getStorage()` 仅用于 Zustand persist 的全局 blob `alc:state:progress`。
 *
 * （production 的 getStorage() 返回 SQLite Repository，per-module 数据在 LS 不在 SQLite）。
 *
 * 详见 docs/v2.0.0/v2.0.1-fix-report.md §3。
 */
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

      // TODO(V2.0.1 F1-1): 新增 `resumeModule(moduleId)` action 时，MUST use `storage`（LS）读 per-module snapshot，禁止 `getStorage()`。详见文件顶部 Storage Invariant。
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
            // 导言 → 第一个 concept 的知识页（如有）或第一道题
            const firstConcept = currentModule.concepts[0]
            if (firstConcept?.knowledgePage) {
              set({
                stage: { kind: 'concept_intro', conceptIndex: 0 },
                updatedAt: Date.now(),
              })
            } else {
              set({
                stage: { kind: 'concept', conceptIndex: 0, quizIndex: 0 },
                updatedAt: Date.now(),
              })
            }
            break
          }

          case 'concept_intro': {
            set({
              stage: {
                kind: 'concept',
                conceptIndex: stage.conceptIndex,
                quizIndex: 0,
                ...(stage.reviewSlots && stage.reviewSlots.length > 0
                  ? { reviewSlots: stage.reviewSlots }
                  : {}),
              },
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

              // "确认掌握题"仅在用户未关闭时注入
              const { confirmReviewEnabled } = useSettingsStore.getState()
              const confirmSlots = confirmReviewEnabled
                ? collectConfirmSlots(currentModule, conceptIndex - 1, attemptsBySlot)
                : []

              const nextReviewSlots = [...wrongSlots, ...carriedSlots, ...confirmSlots]

              const nextConceptIdx = conceptIndex + 1
              const nextConcept = currentModule.concepts[nextConceptIdx]
              const reviewSlotsPayload =
                nextReviewSlots.length > 0 ? { reviewSlots: nextReviewSlots } : {}
              const nextStage: ModuleStage = nextConcept?.knowledgePage
                ? { kind: 'concept_intro', conceptIndex: nextConceptIdx, ...reviewSlotsPayload }
                : {
                    kind: 'concept',
                    conceptIndex: nextConceptIdx,
                    quizIndex: 0,
                    ...reviewSlotsPayload,
                  }

              set({
                stage: nextStage,
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

      submitFeynman: (finalOutput, finalScore, finalGaps) => {
        if (!get().feynmanAttempt) return

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
        })

        void triggerAutoBackup(true)
      },

      setStage: (stage) => set({ stage, updatedAt: Date.now() }),

      reset: () => set(initialState),
    }),
    {
      /**
       * [双写机制 - 第 1 写入端] Zustand persist 配置
       *
       * 全局 blob key: alc:state:progress
       *   由 zustand/middleware persist 自动管理。存储当前活跃 Module 的 4 个字段
       *   (moduleId / stage / updatedAt / feynmanAttempt)，即"最后学习的那个 Module 的进度快照"。
       *
       * per-module key: alc:progress:{moduleId}
       *   此 key 不由 persist 直接写入，而是由下方 subscribe 监听器同步写入。
       *   listStoredModules() 依赖此 key 来展示每个 Module 的 updatedAt / completed 状态。
       *
       * 两者必须保持同步，否则题库列表的 updatedAt / completed 状态会失真。
       *
       * onRehydrateStorage 回调在页面刷新后做一次 per-module 同步，
       * 但仅对 persist blob 中保存的当前 moduleId 生效。
       * 其他 Module 的 per-module 副本必须在 v1.0.0 迁移时整体搬运。
       *
       * v1.0.0 迁移约束：
       *   从 LocalStorage 迁移到 SQLite（或任何新存储后端）时，这两个 key 都必须搬运，
       *   且搬运后必须立即跑一次 subscribe 同步（或遍历所有 module 写入 per-module key），
       *   确保两者一致。否则题库列表将显示错误的进度状态。
       */
      name: 'alc:state:progress',
      storage: createJSONStorage(() => createZustandStorage(getStorage())),
      skipHydration: !isShowcaseMode,
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
 * [双写机制 - 第 2 写入端] subscribe 监听器
 *
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
 *
 * 注意：此监听器只对当前正在使用的 Module 生效。当用户从 A 切换到 B 时，
 *   A 的最终进度会被保存到 alc:progress:A。但若用户直接关闭页面（未切换），
 *   A 的最新进度已在 persist blob（alc:state:progress）中保存，
 *   而 alc:progress:A 可能滞后。这就是 onRehydrateStorage 存在的原因。
 *   迁移时必须同时搬运这两个 key，并在搬运后触发一次 subscribe 同步。
 */
/** @internal 保留 unsubscribe 引用，测试 / HMR 可调用清理 */
export const _unsubscribeProgressSync = useProgressStore.subscribe((state, prevState) => {
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
