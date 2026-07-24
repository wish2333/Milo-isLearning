import { describe, expect, it } from 'vitest'

import type { Module, Quiz } from '@/types/domain'

import { findQuizInTopic } from '../adaptive-sequencer'

function makeQuiz(id: string, opts: { ignored?: boolean; conceptId?: string } = {}): Quiz {
  return {
    id,
    conceptId: opts.conceptId ?? 'c',
    ladderLevel: 1,
    expressionLevel: 1,
    interactionType: 'choice',
    stem: `Q: ${id}`,
    options: ['A', 'B', 'C', 'D'],
    answer: 'A',
    explanation: 'A is correct',
    distractors: ['B'],
    ...(opts.ignored ? { ignored: true } : {}),
  }
}

/** 构建单 concept 模块，quizzes 可控（含 ignored 标注）。 */
function makeModule(moduleId: string, quizzes: Quiz[]): Module {
  return {
    id: moduleId,
    sourceId: `src-${moduleId}`,
    title: moduleId,
    intro: 'intro',
    goal: 'goal',
    concepts: [
      {
        id: `${moduleId}-c0`,
        moduleId,
        name: 'C0',
        definition: 'def',
        type: 'fact',
        keyPoints: [],
        quizSeries: { conceptId: `${moduleId}-c0`, quizzes },
        order: 0,
      },
    ],
    feynmanTask: { moduleId, steps: [], finalPrompt: 'p', rubric: ['g'] },
    order: 1,
  }
}

describe('findQuizInTopic', () => {
  it('(a) slot 在第一个模块 → 返回该 quiz', () => {
    const modules = [
      makeModule('m1', [makeQuiz('m1:slot-0'), makeQuiz('m1:slot-1')]),
      makeModule('m2', [makeQuiz('m2:slot-0')]),
    ]
    expect(findQuizInTopic(modules, 'm1:slot-0')?.id).toBe('m1:slot-0')
  })

  it('(b) slot 在后续模块 → 返回该 quiz', () => {
    const modules = [
      makeModule('m1', [makeQuiz('m1:slot-0')]),
      makeModule('m2', [makeQuiz('m2:slot-0'), makeQuiz('m2:slot-1')]),
    ]
    expect(findQuizInTopic(modules, 'm2:slot-1')?.id).toBe('m2:slot-1')
  })

  it('(c) slot 不在主题任何模块 → undefined', () => {
    const modules = [makeModule('m1', [makeQuiz('m1:slot-0')]), makeModule('m2', [])]
    expect(findQuizInTopic(modules, 'nope')).toBeUndefined()
  })

  it('(d) slot 在模块 A 被 ignored，在模块 B 未 ignored → 跳过 A 返回 B', () => {
    const modules = [
      makeModule('m1', [makeQuiz('shared', { ignored: true })]),
      makeModule('m2', [makeQuiz('shared')]),
    ]
    // 两个模块都有 id='shared'，但 m1 的被 ignored → findQuizInTopic 应跳过 m1 返回 m2 的
    const found = findQuizInTopic(modules, 'shared')
    expect(found).toBeDefined()
    expect(found?.ignored).toBeFalsy()
    // 确认返回的是 m2 的（m2 模块内 quiz 未 ignored）
    expect(found?.id).toBe('shared')
  })

  it('(e) 空主题 → undefined', () => {
    expect(findQuizInTopic([], 'any')).toBeUndefined()
  })

  it('slot 全部模块都 ignored → undefined（不返回 ignored quiz）', () => {
    const modules = [makeModule('m1', [makeQuiz('only', { ignored: true })])]
    expect(findQuizInTopic(modules, 'only')).toBeUndefined()
  })
})
