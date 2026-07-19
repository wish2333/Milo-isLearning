/**
 * FSRS 派生缓存首次回填与参数变化重放。
 *
 * SchedulingData 不是学习数据的真值；这里始终从 attemptsBySlot 重建。题目所属
 * 模块/概念通过扫描 Module 树建立映射，绝不解析 originalQuizId 的字符串格式，
 * 因而也能兼容旧数据和包含冒号的自定义 id。
 */

import type { AttemptRecord, Module, Quiz } from '@/types/domain'
import { StorageKeys } from '@/lib/persistence/shared/keys'
import type { StorageRepository } from '@/lib/persistence/shared/repository'

import { computeConfigRevision, computeContentRevision } from './content-revision'
import { rebuildScheduleForSlot, type FsrsReplayConfig } from './fsrs-replay'
import { scheduleLibrary } from '@/lib/persistence/schedule-library'

export interface FsrsMigrationSummary {
  replayed: boolean
  rebuiltSlots: number
  skippedSlots: number
  unresolvedSlots: number
}

export interface RebuildAllSchedulesParams {
  repository: StorageRepository
  attemptsBySlot: Record<string, AttemptRecord[]>
  fsrsConfig: FsrsReplayConfig
}

interface QuizContext {
  moduleId: string
  conceptId: string
  quiz: Quiz
}

/**
 * 在需要时全量重建当前 production cache 中的所有 schedule。
 *
 * 触发条件是 schedule 为空，或任意现有 schedule 的 configRevision 已过期；不写
 * migration flag，因此用户修改 FSRS 参数后下次启动仍会自动 replay。
 */
export function rebuildAllSchedulesIfNeeded({
  repository,
  attemptsBySlot,
  fsrsConfig,
}: RebuildAllSchedulesParams): FsrsMigrationSummary {
  const schedules = scheduleLibrary.listAll(repository)
  const configRevision = computeConfigRevision(fsrsConfig)
  const needsReplay =
    schedules.length === 0 ||
    schedules.some((schedule) => schedule.configRevision !== configRevision)

  if (!needsReplay) {
    return {
      replayed: false,
      rebuiltSlots: 0,
      skippedSlots: 0,
      unresolvedSlots: 0,
    }
  }

  const contexts = buildQuizContexts(repository)
  scheduleLibrary.clearAll(repository)

  let rebuiltSlots = 0
  let skippedSlots = 0
  let unresolvedSlots = 0

  for (const [slotId, attempts] of Object.entries(attemptsBySlot)) {
    if (attempts.length === 0) continue

    const context = resolveQuizContext(slotId, attempts, contexts)
    if (!context) {
      unresolvedSlots += 1
      continue
    }
    if (context.quiz.ignored) {
      skippedSlots += 1
      continue
    }

    const schedule = rebuildScheduleForSlot({
      slotId,
      moduleId: context.moduleId,
      conceptId: context.conceptId,
      quiz: context.quiz,
      attempts,
      contentRevision: computeContentRevision(context.quiz),
      configRevision,
      fsrsConfig,
    })
    if (schedule) {
      scheduleLibrary.set(slotId, schedule, repository)
      rebuiltSlots += 1
    }
  }

  return { replayed: true, rebuiltSlots, skippedSlots, unresolvedSlots }
}

function buildQuizContexts(repository: StorageRepository): Map<string, QuizContext> {
  const modulePrefix = StorageKeys.module('').slice(0, -1)
  const contexts = new Map<string, QuizContext>()

  for (const key of repository.keys()) {
    if (!key.startsWith(modulePrefix)) continue
    const storedModule = repository.get<Module>(key)
    if (!storedModule || storedModule.origin === 'showcase') continue

    for (const concept of storedModule.concepts) {
      for (const quiz of concept.quizSeries.quizzes) {
        contexts.set(quiz.id, { moduleId: storedModule.id, conceptId: concept.id, quiz })
      }
    }
    for (const quiz of storedModule.challengeQuizzes ?? []) {
      contexts.set(quiz.id, { moduleId: storedModule.id, conceptId: 'challenge', quiz })
    }
  }

  return contexts
}

function resolveQuizContext(
  slotId: string,
  attempts: AttemptRecord[],
  contexts: Map<string, QuizContext>,
): QuizContext | null {
  const direct = contexts.get(slotId)
  if (direct) return direct

  // 旧记录的 slot key 可能与 quiz.id 不同；用记录中的实际 quizId 精确匹配，
  // 仍不对 originalQuizId 做任何字符串解析或模块归属猜测。
  for (const attempt of attempts) {
    const byQuizId = contexts.get(attempt.quizId)
    if (byQuizId) return byQuizId
  }

  return null
}
