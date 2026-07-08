import type { AttemptRecord, Quiz } from '@/types/domain'

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

const PASS_THRESHOLD = 80

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
  const latest = latestAttemptBySlot(attempts)
  const adaptiveSlots = slots.map((quiz, index) =>
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
