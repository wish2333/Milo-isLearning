import type { AttemptRecord, Module, Quiz, ReviewFilter } from '@/types/domain'
import { scheduleLibrary } from '@/lib/persistence/schedule-library'
import { isDue } from '@/lib/runtime/fsrs'
import { useSettingsStore } from '@/lib/state/settings-store'
import type { StorageRepository } from '@/lib/persistence/shared/repository'
import { collectReviewItemsForModules } from '@/lib/runtime/topic-review'
import type { CollectedReviewItem } from '@/lib/runtime/topic-review'

export interface AdaptiveSlot {
  slotId: string
  conceptIndex: number
  quizIndex: number
  ladderLevel: 1 | 2 | 3
  expressionLevel: 1 | 2 | 3
  interactionType: Quiz['interactionType']
  status: 'unseen' | 'answered-correct' | 'answered-wrong' | 'revisit'
  priority: number
}

export interface AdaptiveQueue {
  next: AdaptiveSlot | null
  upcoming: AdaptiveSlot[]
  rationale: string
}

interface BuildAdaptiveQueueArgs {
  slots: Quiz[]
  attempts: AttemptRecord[]
  currentSlotId: string
  conceptIndex?: number
}

export const PASS_THRESHOLD = 80

interface AdaptiveSettings {
  fsrs?: { enabled?: boolean }
}

interface SequencerOptions {
  /** 测试及迁移可显式传入；未传入时兼容旧 settings 数据。 */
  fsrsEnabled?: boolean
  timezone?: string
  repository?: StorageRepository
  now?: Date
}

function readFsrsEnabled(explicit: boolean | undefined): boolean {
  if (explicit !== undefined) return explicit
  const settings = useSettingsStore.getState() as AdaptiveSettings
  return settings.fsrs?.enabled === true
}

function localTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

function latestAttemptBySlot(attempts: AttemptRecord[]): Map<string, AttemptRecord> {
  const latest = new Map<string, AttemptRecord>()
  for (const attempt of attempts) {
    const existing = latest.get(attempt.originalQuizId)
    if (!existing || attempt.timestamp >= existing.timestamp) {
      latest.set(attempt.originalQuizId, attempt)
    }
  }
  return latest
}

function toAdaptiveSlot(
  quiz: Quiz,
  quizIndex: number,
  latestAttempt: AttemptRecord | undefined,
  conceptIndex: number,
): AdaptiveSlot {
  const status =
    latestAttempt === undefined
      ? 'unseen'
      : latestAttempt.score >= PASS_THRESHOLD
        ? 'answered-correct'
        : 'answered-wrong'

  return {
    slotId: quiz.id,
    conceptIndex,
    quizIndex,
    ladderLevel: quiz.ladderLevel,
    expressionLevel: quiz.expressionLevel,
    interactionType: quiz.interactionType,
    status,
    priority: status === 'unseen' ? 100 - quizIndex : status === 'answered-wrong' ? 50 : 0,
  }
}

function countAttemptsAfter(
  attempts: AttemptRecord[],
  timestamp: number,
  excludeSlotId: string,
): number {
  const slots = new Set<string>()
  for (const attempt of attempts) {
    if (attempt.timestamp > timestamp && attempt.originalQuizId !== excludeSlotId) {
      slots.add(attempt.originalQuizId)
    }
  }
  return slots.size
}

function hasTwoConsecutiveMisses(attempts: AttemptRecord[]): boolean {
  const lastTwo = [...attempts].sort((a, b) => a.timestamp - b.timestamp).slice(-2)
  return lastTwo.length === 2 && lastTwo.every((attempt) => attempt.score < PASS_THRESHOLD)
}

export function buildAdaptiveQueue({
  slots,
  attempts,
  currentSlotId,
  conceptIndex = 0,
}: BuildAdaptiveQueueArgs): AdaptiveQueue {
  const activeSlots = slots.filter((q) => !q.ignored)
  const latest = latestAttemptBySlot(attempts)
  const adaptiveSlots = activeSlots.map((quiz, index) =>
    toAdaptiveSlot(quiz, index, latest.get(quiz.id), conceptIndex),
  )
  const currentIndex = Math.max(
    adaptiveSlots.findIndex((slot) => slot.slotId === currentSlotId),
    -1,
  )

  const unseenAfterCurrent = adaptiveSlots.filter(
    (slot) => slot.status === 'unseen' && slot.quizIndex > currentIndex,
  )
  const unseenBeforeOrAtCurrent = adaptiveSlots.filter(
    (slot) => slot.status === 'unseen' && slot.quizIndex <= currentIndex,
  )
  const unseen = [...unseenAfterCurrent, ...unseenBeforeOrAtCurrent]

  const wrongSlots = adaptiveSlots.filter((slot) => slot.status === 'answered-wrong')
  const dueRevisits = wrongSlots.filter((slot) => {
    const attempt = latest.get(slot.slotId)
    if (!attempt) return false
    return countAttemptsAfter(attempts, attempt.timestamp, slot.slotId) >= 2
  })
  const waitingRevisits = wrongSlots.filter(
    (slot) => !dueRevisits.some((due) => due.slotId === slot.slotId),
  )

  let orderedUnseen = unseen
  if (hasTwoConsecutiveMisses(attempts)) {
    orderedUnseen = [...unseen].sort((a, b) => {
      const pressureA = a.interactionType === 'fill_blank' ? 2 : a.expressionLevel
      const pressureB = b.interactionType === 'fill_blank' ? 2 : b.expressionLevel
      return pressureA - pressureB || a.quizIndex - b.quizIndex
    })
  }

  const upcoming: AdaptiveSlot[] = []
  if (dueRevisits.length > 0) {
    upcoming.push(...dueRevisits.map((slot) => ({ ...slot, status: 'revisit' as const })))
  }

  for (const slot of orderedUnseen) {
    upcoming.push(slot)
    if (upcoming.filter((item) => item.status === 'unseen').length === 2) {
      upcoming.push(...waitingRevisits.map((item) => ({ ...item, status: 'revisit' as const })))
    }
  }

  if (orderedUnseen.length < 2) {
    upcoming.push(...waitingRevisits.map((item) => ({ ...item, status: 'revisit' as const })))
  }

  const deduped = upcoming.filter(
    (slot, index, all) => all.findIndex((candidate) => candidate.slotId === slot.slotId) === index,
  )

  return {
    next: deduped[0] ?? null,
    upcoming: deduped,
    rationale:
      waitingRevisits.length > 0
        ? '错题会在两题后回来，我们先补一块更低摩擦的台阶。'
        : '继续沿当前题组推进。',
  }
}

/**
 * Collect quiz slot IDs from a concept that were answered wrong or guessed-correct.
 * These will be injected as review slots into the NEXT concept.
 */
export function collectReviewSlots(
  module: Module,
  conceptIndex: number,
  attemptsBySlot: Record<string, AttemptRecord[]>,
  options?: SequencerOptions,
): string[] {
  const concept = module.concepts[conceptIndex]
  if (!concept) return []

  if (readFsrsEnabled(options?.fsrsEnabled)) {
    const due = new Set(
      collectDueSlots(
        module.id,
        options?.timezone ?? localTimezone(),
        options?.now ?? new Date(),
        options?.repository,
      ),
    )
    return concept.quizSeries.quizzes
      .filter((quiz) => !quiz.ignored && due.has(quiz.id))
      .map((quiz) => quiz.id)
  }

  const slots: string[] = []
  for (const quiz of concept.quizSeries.quizzes) {
    if (quiz.ignored) continue
    const attempts = attemptsBySlot[quiz.id]
    if (!attempts || attempts.length === 0) continue

    const hasWrong = attempts.some((a) => a.score < PASS_THRESHOLD)
    const hasGuessed = attempts.some((a) => a.guessed === true)
    if (hasWrong || hasGuessed) {
      slots.push(quiz.id)
    }
  }
  return slots
}

/**
 * Collect quiz slot IDs from a concept that were answered correctly on first attempt (not guessed).
 * These serve as "confirmation" reviews — verify the user still remembers.
 */
export function collectConfirmSlots(
  module: Module,
  conceptIndex: number,
  attemptsBySlot: Record<string, AttemptRecord[]>,
  options?: SequencerOptions,
): string[] {
  if (readFsrsEnabled(options?.fsrsEnabled)) return []
  if (conceptIndex < 0) return []
  const concept = module.concepts[conceptIndex]
  if (!concept) return []

  const slots: string[] = []
  for (const quiz of concept.quizSeries.quizzes) {
    if (quiz.ignored) continue
    const attempts = attemptsBySlot[quiz.id]
    if (!attempts || attempts.length === 0) continue

    const firstAttempt = attempts.find((a) => a.attemptVersion === 0)
    if (firstAttempt && firstAttempt.score >= PASS_THRESHOLD && !firstAttempt.guessed) {
      slots.push(quiz.id)
    }
  }
  return slots
}

/**
 * 收集模块内截至当前时刻已经到期的槽位。
 *
 * Today 消费的是 dueNow（包括此前已过期的卡），而不是把当天晚些时候
 * 才到期的 learning step 提前拉入队列。timezone 用于校验浏览器调用方，
 * epoch 比较则保证 DST 回拨时不会重复或漏掉卡片。
 */
export function collectDueSlots(
  moduleId: string,
  timezone: string,
  now: Date = new Date(),
  repository?: StorageRepository,
): string[] {
  return scheduleLibrary
    .listByModule(moduleId, repository)
    .filter((schedule) => isDue(schedule, now, timezone))
    .map((schedule) => schedule.slotId)
}

/**
 * From the current concept's reviewSlots, find ones that were answered WRONG during review.
 * These should be carried forward to the next concept's reviewSlots.
 *
 * 当传入 currentModule 时，跨模块穿插题（不属于 currentModule）不 carry —— 它们靠
 * FSRS due（开启时）或主题重刷页（关闭时）自然回来，保持穿插轻量（V2.1.6 决策 #3）。
 */
export function collectCarriedReviewSlots(
  currentReviewSlots: string[] | undefined,
  attemptsBySlot: Record<string, AttemptRecord[]>,
  currentModule?: Module,
): string[] {
  if (!currentReviewSlots || currentReviewSlots.length === 0) return []

  const carried: string[] = []
  for (const slotId of currentReviewSlots) {
    // 跨模块穿插题不 carry
    if (currentModule && !findQuizInModule(currentModule, slotId)) continue
    const attempts = attemptsBySlot[slotId]
    if (!attempts || attempts.length === 0) {
      carried.push(slotId)
      continue
    }
    const latest = attempts[attempts.length - 1]
    if (latest && latest.score < PASS_THRESHOLD) {
      carried.push(slotId)
    }
  }
  return carried
}

/**
 * Find a Quiz by its slot ID across the entire module (all concepts + challenge).
 */
export function findQuizInModule(module: Module, quizId: string): Quiz | undefined {
  for (const concept of module.concepts) {
    const quiz = concept.quizSeries.quizzes.find((q) => q.id === quizId)
    if (quiz) return quiz
  }
  if (module.challengeQuizzes) {
    const quiz = module.challengeQuizzes.find((q) => q.id === quizId)
    if (quiz) return quiz
  }
  return undefined
}

/**
 * 跨模块查找 quiz（主题内）。用于 ConceptView 渲染跨模块穿插的复习槽位。
 * 按 topicModules 顺序找第一个匹配且未 ignored 的 quiz。
 */
export function findQuizInTopic(topicModules: Module[], slotId: string): Quiz | undefined {
  for (const mod of topicModules) {
    const found = findQuizInModule(mod, slotId)
    if (found && !found.ignored) return found
  }
  return undefined
}

/**
 * 对收集到的跨模块复习项排序。
 * FSRS due 模式：按 schedule.due 升序（缺失 due 排末尾）。
 * wrong 模式：按最新 attempt timestamp 降序（无 attempts 排末尾）。
 */
function sortReviewItems(
  items: CollectedReviewItem[],
  attemptsBySlot: Record<string, AttemptRecord[]>,
  filter: ReviewFilter,
): CollectedReviewItem[] {
  if (filter === 'due') {
    return [...items].sort((a, b) => {
      const dueA = scheduleLibrary.get(a.slotId)?.due
      const dueB = scheduleLibrary.get(b.slotId)?.due
      if (dueA && dueB) return dueA.localeCompare(dueB)
      if (dueA && !dueB) return -1
      if (!dueA && dueB) return 1
      return 0
    })
  }

  // wrong / guessed / all: 按最新 attempt 降序
  return [...items].sort((a, b) => {
    const attemptsA = attemptsBySlot[a.slotId]
    const attemptsB = attemptsBySlot[b.slotId]
    const latestA = attemptsA?.length ? attemptsA[attemptsA.length - 1]!.timestamp : -Infinity
    const latestB = attemptsB?.length ? attemptsB[attemptsB.length - 1]!.timestamp : -Infinity
    return latestB - latestA
  })
}

/**
 * 收集主题内其他模块的复习槽位，用于跨模块穿插复习。
 * 复用 collectReviewItemsForModules 做过滤/聚合，然后按 filter 排序并截断。
 *
 * @param topicModules 主题包含的所有模块（按顺序）
 * @param currentModuleId 当前正在学习的模块（排除）
 * @param attemptsBySlot 各 slot 的作答记录
 * @param options.sequencer fsrsEnabled / timezone / now / cap（默认 5）
 * @returns 排序后的 slotId 列表，最多 cap 个
 */
export function collectCrossModuleReviewSlots(
  topicModules: Module[],
  currentModuleId: string,
  attemptsBySlot: Record<string, AttemptRecord[]>,
  options?: SequencerOptions & { cap?: number },
): string[] {
  const cap = options?.cap ?? 5
  const otherModules = topicModules.filter((m) => m.id !== currentModuleId)
  if (otherModules.length === 0) return []

  const fsrsEnabled = readFsrsEnabled(options?.fsrsEnabled)
  const filter: ReviewFilter = fsrsEnabled ? 'due' : 'wrong'

  const items = collectReviewItemsForModules(otherModules, attemptsBySlot, filter, {
    timezone: options?.timezone ?? localTimezone(),
    now: options?.now,
  })

  if (items.length === 0) return []

  return sortReviewItems(items, attemptsBySlot, filter)
    .slice(0, cap)
    .map((item) => item.slotId)
}
