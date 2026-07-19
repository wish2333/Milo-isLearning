import { describe, expect, it } from 'vitest'

import type { Quiz } from '@/types/domain'

import { computeConfigRevision, computeContentRevision } from './content-revision'

function quiz(overrides: Partial<Quiz> = {}): Quiz {
  return {
    id: 'quiz-1',
    conceptId: 'concept-1',
    ladderLevel: 1,
    expressionLevel: 1,
    interactionType: 'choice',
    stem: '什么是间隔重复？',
    options: ['按固定频率复习', '根据遗忘调整复习'],
    answer: '根据遗忘调整复习',
    explanation: '复习间隔会随掌握程度变化。',
    distractors: ['按固定频率复习'],
    acceptableAnswers: ['根据遗忘调整复习', '依遗忘曲线调整复习'],
    ...overrides,
  }
}

describe('computeContentRevision', () => {
  it('returns the same revision for equivalent quiz content', () => {
    expect(computeContentRevision(quiz())).toBe(computeContentRevision(quiz()))
  })

  it('only depends on the design-specified fields', () => {
    const baseline = computeContentRevision(quiz())

    expect(computeContentRevision(quiz({ id: 'quiz-2' }))).toBe(baseline)
    expect(computeContentRevision(quiz({ explanation: '不同解释' }))).toBe(baseline)
    expect(computeContentRevision(quiz({ distractors: ['不同干扰项'] }))).toBe(baseline)
    expect(computeContentRevision(quiz({ ignored: true }))).toBe(baseline)
  })

  it.each([
    ['stem', quiz({ stem: '什么是主动回忆？' })],
    ['answer', quiz({ answer: '按固定频率复习' })],
    ['options', quiz({ options: ['根据遗忘调整复习', '按固定频率复习'] })],
    ['acceptableAnswers', quiz({ acceptableAnswers: ['间隔复习'] })],
  ] as const)('changes when %s changes', (_field, changedQuiz) => {
    expect(computeContentRevision(changedQuiz)).not.toBe(computeContentRevision(quiz()))
  })

  it('handles optional undefined fields consistently', () => {
    const withoutOptionalFields = quiz()
    delete withoutOptionalFields.options
    delete withoutOptionalFields.acceptableAnswers

    expect(computeContentRevision(quiz({ options: undefined, acceptableAnswers: undefined }))).toBe(
      computeContentRevision(withoutOptionalFields),
    )
  })
})

describe('computeConfigRevision', () => {
  it('is stable regardless of input property order', () => {
    expect(computeConfigRevision({ requestRetention: 0.9, maximumInterval: 365 })).toBe(
      computeConfigRevision({ maximumInterval: 365, requestRetention: 0.9 }),
    )
  })

  it.each([
    { requestRetention: 0.8, maximumInterval: 365 },
    { requestRetention: 0.9, maximumInterval: 730 },
  ])('changes when a scheduling parameter changes', (changedConfig) => {
    expect(computeConfigRevision(changedConfig)).not.toBe(
      computeConfigRevision({ requestRetention: 0.9, maximumInterval: 365 }),
    )
  })
})
