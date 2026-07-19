import type { AttemptRecord, Module, Quiz } from '@/types/domain'
import { scheduleLibrary } from '@/lib/persistence/schedule-library'
import { isDue } from '@/lib/runtime/fsrs'
import { useSettingsStore } from '@/lib/state/settings-store'
import type { StorageRepository } from '@/lib/persistence/shared/repository'

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
 */
export function collectCarriedReviewSlots(
  currentReviewSlots: string[] | undefined,
  attemptsBySlot: Record<string, AttemptRecord[]>,
): string[] {
  if (!currentReviewSlots || currentReviewSlots.length === 0) return []

  const carried: string[] = []
  for (const slotId of currentReviewSlots) {
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
