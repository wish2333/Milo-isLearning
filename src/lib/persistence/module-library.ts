/**
 * Module Library repository helpers (M7.5)
 *
 * 提供读取本地 Module 列表、打开、重新学习、删除的纯 repository 操作。
 * 不包含 UI 状态管理（由 Zustand store 负责）。
 */

import type { Module, ProgressState, Quiz } from '@/types/domain'
import { isShowcaseMode } from '@/lib/runtime/app-mode'
import { useRuntimeMode } from '@/lib/state/runtime-mode-store'

import { StorageKeys } from './shared/keys'
import type { StorageRepository } from './shared/repository'

/**
 * Library 列表中单条 Module 的摘要视图。
 */
export interface StoredModuleSummary {
  id: string
  sourceId: string
  title: string
  conceptCount: number
  quizCount: number
  updatedAt: number
  completed: boolean
}

/**
 * 列出所有已存储的 Module（按 updatedAt 降序）。
 *
 * quizCount 统计：Concept quiz + Challenge quiz + Feynman steps。
 * 无 progress 的 Module 视为 updatedAt=0（最旧）。
 */
export function listStoredModules(repo: StorageRepository): StoredModuleSummary[] {
  return repo
    .keys()
    .filter((key) => key.startsWith('alc:module:'))
    .map((key) => repo.get<Module>(key))
    .filter((module): module is Module => module !== null)
    .filter((module) => {
      // 运行时模式感知：studio 上下文下按 production 过滤
      const effectiveShowcase = isShowcaseMode && !useRuntimeMode.getState().studioMode
      return effectiveShowcase ? module.origin === 'showcase' : module.origin !== 'showcase'
    })
    .map((module) => {
      const progress = repo.get<ProgressState>(StorageKeys.progress(module.id))
      const conceptQuizCount = module.concepts.reduce(
        (sum, concept) => sum + concept.quizSeries.quizzes.length,
        0,
      )
      const challengeCount = module.challengeQuizzes?.length ?? 0
      const feynmanStepCount = module.feynmanTask.steps.length
      return {
        id: module.id,
        sourceId: module.sourceId,
        title: module.title,
        conceptCount: module.concepts.length,
        quizCount: conceptQuizCount + challengeCount + feynmanStepCount,
        updatedAt: progress?.updatedAt ?? 0,
        completed: progress?.stage.kind === 'done',
      }
    })
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

/**
 * 按 id 加载单个 Module；不存在返回 null。
 */
export function loadStoredModule(repo: StorageRepository, moduleId: string): Module | null {
  return repo.get<Module>(StorageKeys.module(moduleId))
}

/**
 * 重置 Module 的学习进度（progress / feynman / module-scoped attempts），
 * 但保留 Module 本体和 source，允许用户重新学习。
 */
/** 重命名 Module 的 title 字段。不改 moduleId、不改 storage key。 */
export function renameModule(repo: StorageRepository, moduleId: string, newTitle: string): void {
  const trimmed = newTitle.trim()
  if (trimmed.length === 0 || trimmed.length > 100) {
    throw new Error('Module title must be 1-100 characters after trimming')
  }
  const storedModule = loadStoredModule(repo, moduleId)
  if (!storedModule) throw new Error(`Module ${moduleId} not found`)
  repo.set(StorageKeys.module(moduleId), { ...storedModule, title: trimmed })
}

export function resetStoredModuleProgress(repo: StorageRepository, moduleId: string): void {
  repo.remove(StorageKeys.progress(moduleId))
  repo.remove(StorageKeys.feynman(moduleId))
  repo.remove(StorageKeys.attemptsModule(moduleId))
}

/**
 * 更新 Module 中指定 Quiz 的字段（F40 手动纠题 / F41 忽略题）。
 *
 * 在 concepts[].quizSeries.quizzes[] 和 challengeQuizzes[] 中查找 quizId，
 * 找到后合并 patch 并写回存储。不可变更新（spread rebuild）。
 */
export function updateQuizInModule(
  repo: StorageRepository,
  moduleId: string,
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
): Module {
  const storedModule = loadStoredModule(repo, moduleId)
  if (!storedModule) throw new Error(`Module ${moduleId} not found`)

  let found = false

  const patchedConcepts = storedModule.concepts.map((concept) => {
    const quizIdx = concept.quizSeries.quizzes.findIndex((q) => q.id === quizId)
    if (quizIdx === -1) return concept
    found = true
    const updatedQuizzes = concept.quizSeries.quizzes.map((q, i) =>
      i === quizIdx ? { ...q, ...patch } : q,
    )
    return { ...concept, quizSeries: { ...concept.quizSeries, quizzes: updatedQuizzes } }
  })

  let patchedChallenges = storedModule.challengeQuizzes
  if (!found && storedModule.challengeQuizzes) {
    const chIdx = storedModule.challengeQuizzes.findIndex((q) => q.id === quizId)
    if (chIdx !== -1) {
      found = true
      patchedChallenges = storedModule.challengeQuizzes.map((q, i) =>
        i === chIdx ? { ...q, ...patch } : q,
      )
    }
  }

  if (!found) throw new Error(`Quiz ${quizId} not found in Module ${moduleId}`)

  const updated: Module = { ...storedModule, concepts: patchedConcepts }
  if (patchedChallenges !== undefined) {
    updated.challengeQuizzes = patchedChallenges
  }
  repo.set(StorageKeys.module(moduleId), updated)
  return updated
}
