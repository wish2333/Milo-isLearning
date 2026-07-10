// wrong-question-book.test.ts — 错题本收集与 Markdown 导出单测
//
// 覆盖：
//   - collectWrongQuestions: 按 wrongCount 降序 / 蒙对分离 / 空结果
//   - buildWrongQuestionMarkdown: 正确的 section 结构 / 特殊字符转义
//   - hasWrongQuestions: 快速检查

import { describe, expect, it } from 'vitest'

import type { AttemptRecord, Concept, FeynmanStep, Module, Quiz } from '@/types/domain'

import {
  buildWrongQuestionMarkdown,
  collectWrongQuestions,
  hasWrongQuestions,
} from '../wrong-question-book'

// =================================================================
// Fixtures
// =================================================================

function makeQuiz(overrides: Partial<Quiz> & { id: string }): Quiz {
  return {
    conceptId: 'c1',
    ladderLevel: 1,
    expressionLevel: 1,
    interactionType: 'choice',
    stem: '题干',
    options: ['正确答案', '干扰项A', '干扰项B', '干扰项C'],
    answer: '正确答案',
    explanation: '解析内容',
    distractors: [],
    ...overrides,
  }
}

function makeAttempt(overrides: Partial<AttemptRecord> & { id: string }): AttemptRecord {
  return {
    quizId: overrides.id,
    originalQuizId: overrides.id,
    attemptVersion: 0,
    userAnswer: '错误答案',
    score: 0,
    gaps: [],
    nextAction: 'retry',
    timestamp: Date.now(),
    ...overrides,
  }
}

function makeModule(concepts: Concept[]): Module {
  return {
    id: 'mod-1',
    sourceId: 'src-1',
    title: '测试模块',
    intro: '',
    goal: '',
    concepts,
    feynmanTask: {
      moduleId: 'mod-1',
      steps: [] as FeynmanStep[],
      finalPrompt: '',
      rubric: [],
    },
    order: 1,
  }
}

function makeConcept(name: string, quizzes: Quiz[]): Concept {
  return {
    id: name,
    moduleId: 'mod-1',
    name,
    definition: '',
    type: 'fact',
    keyPoints: [],
    quizSeries: { conceptId: name, quizzes },
    order: 0,
  }
}

function firstOf<T>(arr: T[]): T {
  return arr[0]!
}

// =================================================================
// Tests
// =================================================================

describe('collectWrongQuestions', () => {
  it('returns empty array when no wrong answers', () => {
    const quiz = makeQuiz({ id: 'q1' })
    const testModule = makeModule([makeConcept('概念 1', [quiz])])
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      q1: [makeAttempt({ id: 'q1', score: 100, nextAction: 'advance' })],
    }

    const result = collectWrongQuestions(testModule, attemptsBySlot)
    expect(result).toEqual([])
  })

  it('returns empty array when no attempts exist', () => {
    const quiz = makeQuiz({ id: 'q1' })
    const testModule = makeModule([makeConcept('概念 1', [quiz])])

    const result = collectWrongQuestions(testModule, {})
    expect(result).toEqual([])
  })

  it('collects wrong answers from concepts', () => {
    const quiz1 = makeQuiz({ id: 'q1', stem: '第一题' })
    const quiz2 = makeQuiz({ id: 'q2', stem: '第二题' })
    const testModule = makeModule([makeConcept('概念 1', [quiz1, quiz2])])
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      q1: [makeAttempt({ id: 'q1', score: 0 })],
      q2: [makeAttempt({ id: 'q2', score: 100 })],
    }

    const result = collectWrongQuestions(testModule, attemptsBySlot)
    expect(result).toHaveLength(1)
    expect(firstOf(result).slotId).toBe('q1')
    expect(firstOf(result).stem).toBe('第一题')
    expect(firstOf(result).wrongCount).toBe(1)
    expect(firstOf(result).guessed).toBe(false)
  })

  it('collects guessed-correct entries', () => {
    const quiz = makeQuiz({ id: 'q1' })
    const testModule = makeModule([makeConcept('概念 1', [quiz])])
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      q1: [makeAttempt({ id: 'q1', score: 100, nextAction: 'advance', guessed: true })],
    }

    const result = collectWrongQuestions(testModule, attemptsBySlot)
    expect(result).toHaveLength(1)
    expect(firstOf(result).guessed).toBe(true)
  })

  it('sorts wrong entries before guessed, and by wrongCount desc', () => {
    const q1 = makeQuiz({ id: 'q1', stem: '错3次' })
    const q2 = makeQuiz({ id: 'q2', stem: '错1次' })
    const q3 = makeQuiz({ id: 'q3', stem: '蒙对' })
    const testModule = makeModule([makeConcept('概念 1', [q1, q2, q3])])

    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      q1: [
        makeAttempt({ id: 'q1', score: 0 }),
        makeAttempt({ id: 'q1', score: 0 }),
        makeAttempt({ id: 'q1', score: 0 }),
      ],
      q2: [makeAttempt({ id: 'q2', score: 0 })],
      q3: [makeAttempt({ id: 'q3', score: 100, nextAction: 'advance', guessed: true })],
    }

    const result = collectWrongQuestions(testModule, attemptsBySlot)
    expect(result).toHaveLength(3)
    expect(result[0]!.stem).toBe('错3次')
    expect(result[0]!.guessed).toBe(false)
    expect(result[1]!.stem).toBe('错1次')
    expect(result[1]!.guessed).toBe(false)
    expect(result[2]!.stem).toBe('蒙对')
    expect(result[2]!.guessed).toBe(true)
  })

  it('collects from challenge quizzes', () => {
    const quiz = makeQuiz({ id: 'ch1', conceptId: 'challenge', stem: '挑战题' })
    const testModule = makeModule([makeConcept('概念 1', [])])
    testModule.challengeQuizzes = [quiz]

    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      ch1: [makeAttempt({ id: 'ch1', score: 0 })],
    }

    const result = collectWrongQuestions(testModule, attemptsBySlot)
    expect(result).toHaveLength(1)
    expect(firstOf(result).conceptTitle).toBe('综合挑战')
    expect(firstOf(result).stageLabel).toBe('综合挑战')
  })

  it('uses latest attempt userAnswer', () => {
    const quiz = makeQuiz({ id: 'q1' })
    const testModule = makeModule([makeConcept('概念 1', [quiz])])
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      q1: [
        makeAttempt({ id: 'q1', userAnswer: '第一次答案' }),
        makeAttempt({ id: 'q1', userAnswer: '最后一次答案' }),
      ],
    }

    const result = collectWrongQuestions(testModule, attemptsBySlot)
    expect(result).toHaveLength(1)
    expect(firstOf(result).userAnswer).toBe('最后一次答案')
  })

  it('handles sorting quiz correct answer', () => {
    const quiz = makeQuiz({
      id: 'q1',
      interactionType: 'sorting',
      options: ['A', 'B', 'C'],
      answer: 'A',
      stem: '排序题',
    })
    const testModule = makeModule([makeConcept('概念 1', [quiz])])
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      q1: [makeAttempt({ id: 'q1', score: 0 })],
    }

    const result = collectWrongQuestions(testModule, attemptsBySlot)
    expect(firstOf(result).correctAnswer).toBe('A → B → C')
  })

  it('handles fill_blank quiz correct answer', () => {
    const quiz = makeQuiz({
      id: 'q1',
      interactionType: 'fill_blank',
      options: null,
      answer: '正确',
      acceptableAnswers: ['正确', 'OK'],
      stem: '填空题',
    })
    const testModule = makeModule([makeConcept('概念 1', [quiz])])
    const attemptsBySlot: Record<string, AttemptRecord[]> = {
      q1: [makeAttempt({ id: 'q1', score: 0 })],
    }

    const result = collectWrongQuestions(testModule, attemptsBySlot)
    expect(firstOf(result).correctAnswer).toBe('正确 / OK')
  })
})

describe('buildWrongQuestionMarkdown', () => {
  it('produces correct structure with sections', () => {
    const q1 = makeQuiz({ id: 'q1', stem: '错题', misconception: '易错点' })
    const q2 = makeQuiz({ id: 'q2', stem: '蒙对题' })
    const testModule = makeModule([makeConcept('概念 Alpha', [q1, q2])])

    const entries = collectWrongQuestions(testModule, {
      q1: [makeAttempt({ id: 'q1', score: 0 })],
      q2: [makeAttempt({ id: 'q2', score: 100, nextAction: 'advance', guessed: true })],
    })

    const md = buildWrongQuestionMarkdown(entries, testModule)

    expect(md).toContain('# 错题本 — 测试模块')
    expect(md).toContain('## 概念 1：概念 Alpha')
    expect(md).toContain('### ❌ 错题')
    expect(md).toContain('### 🤔 蒙对的题')
    expect(md).toContain('错题')
    expect(md).toContain('蒙对题')
    expect(md).toContain('易错点：易错点')
    expect(md).toContain('错误次数：1')
  })

  it('escapes markdown special characters', () => {
    const quiz = makeQuiz({
      id: 'q1',
      stem: '含有 *特殊_字符` 的题干',
      misconception: '这里也有*号',
    })
    const testModule = makeModule([makeConcept('概念 1', [quiz])])

    const entries = collectWrongQuestions(testModule, {
      q1: [makeAttempt({ id: 'q1', score: 0 })],
    })

    const md = buildWrongQuestionMarkdown(entries, testModule)
    expect(md).toContain('\\*特殊\\_字符\\`')
    expect(md).toContain('这里也有\\*号')
  })

  it('produces empty markdown for no entries', () => {
    const testModule = makeModule([makeConcept('概念 1', [])])
    const md = buildWrongQuestionMarkdown([], testModule)
    expect(md).toContain('# 错题本 — 测试模块')
    expect(md).toContain('共 0 道题')
  })
})

describe('hasWrongQuestions', () => {
  it('returns true when there are wrong answers', () => {
    const quiz = makeQuiz({ id: 'q1' })
    const testModule = makeModule([makeConcept('概念 1', [quiz])])

    expect(hasWrongQuestions(testModule, { q1: [makeAttempt({ id: 'q1', score: 0 })] })).toBe(true)
  })

  it('returns false when all correct', () => {
    const quiz = makeQuiz({ id: 'q1' })
    const testModule = makeModule([makeConcept('概念 1', [quiz])])

    expect(
      hasWrongQuestions(testModule, {
        q1: [makeAttempt({ id: 'q1', score: 100, nextAction: 'advance' })],
      }),
    ).toBe(false)
  })
})
