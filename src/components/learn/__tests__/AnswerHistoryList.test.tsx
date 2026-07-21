// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'

vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react')
  vi.stubGlobal('React', R)
})

import React from 'react'
import type { Module, Quiz, AttemptRecord } from '@/types/domain'
import { AnswerHistoryList } from '../AnswerHistoryList'

const { act } = React

const mockCorrectQuizAnswer = vi.fn()
const mockSetModule = vi.fn()
const mockMarkPendingAmnesty = vi.fn()

function makeAttempt(quizId: string): AttemptRecord {
  return {
    id: `att-${quizId}-1`,
    quizId,
    originalQuizId: 'c1:0',
    attemptVersion: 0,
    userAnswer: '选项A',
    score: 0,
    gaps: [],
    nextAction: 'retry',
    timestamp: Date.now(),
  }
}

const fixtureAttempts: Record<string, AttemptRecord[]> = {
  'q-1': [makeAttempt('q-1')],
}

vi.mock('@/lib/state/module-store', () => ({
  useModuleStore: (
    selector: (s: {
      setModule: typeof mockSetModule
      correctQuizAnswer: typeof mockCorrectQuizAnswer
    }) => unknown,
  ) => selector({ setModule: mockSetModule, correctQuizAnswer: mockCorrectQuizAnswer }),
}))

vi.mock('@/lib/state/attempts-store', () => ({
  useAttemptsStore: (
    selector: (s: {
      attemptsBySlot: Record<string, AttemptRecord[]>
      markPendingAmnesty: typeof mockMarkPendingAmnesty
    }) => unknown,
  ) =>
    selector({
      attemptsBySlot: fixtureAttempts,
      markPendingAmnesty: mockMarkPendingAmnesty,
    }),
}))

// Mock AnswerCorrector to avoid its React dependency chain in jsdom
const mockOnSave = vi.fn()
const mockOnCancel = vi.fn()
vi.mock('@/components/quiz/AnswerCorrector', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react')
  return {
    AnswerCorrector: ({
      onSave,
      onCancel,
    }: {
      onSave: (patch: unknown) => void
      onCancel: () => void
    }) => {
      mockOnSave.mockImplementation(onSave)
      mockOnCancel.mockImplementation(onCancel)
      return R.createElement(
        'div',
        { 'data-testid': 'answer-corrector' },
        R.createElement(
          'button',
          { type: 'button', onClick: () => onSave({ answer: '新答案' }) },
          '保存修改',
        ),
        R.createElement('button', { type: 'button', onClick: onCancel }, '取消'),
      )
    },
  }
})

function makeQuiz(overrides: Partial<Quiz> = {}): Quiz {
  return {
    id: 'q-1',
    conceptId: 'c1',
    ladderLevel: 1,
    expressionLevel: 1,
    interactionType: 'choice',
    stem: '测试题干',
    options: ['选项A', '选项B', '选项C', '选项D'],
    answer: '选项B',
    explanation: 'B 是正确答案',
    distractors: ['选项A', '选项C', '选项D'],
    ...overrides,
  }
}

function makeModule(quiz: Quiz, origin: 'user' | 'showcase' = 'user'): Module {
  return {
    id: 'mod-1',
    sourceId: 'src-1',
    title: '测试模块',
    intro: '',
    goal: '',
    concepts: [
      {
        id: 'c1',
        moduleId: 'mod-1',
        name: '概念1',
        definition: '概念定义',
        type: 'fact',
        keyPoints: [],
        order: 0,
        quizSeries: { conceptId: 'c1', quizzes: [quiz] },
      },
    ],
    feynmanTask: {
      moduleId: 'mod-1',
      steps: [],
      finalPrompt: '',
      rubric: [],
    },
    order: 0,
    origin,
  }
}

describe('AnswerHistoryList — 编辑入口（V2.1.3）', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    mockCorrectQuizAnswer.mockClear()
    mockSetModule.mockClear()
    mockMarkPendingAmnesty.mockClear()
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  function renderWithModule(mod: Module) {
    act(() => {
      root = createRoot(container)
      root.render(<AnswerHistoryList module={mod} />)
    })
  }

  it('user origin 题展开后显示"编辑此题"按钮', () => {
    const quiz = makeQuiz()
    const mod = makeModule(quiz, 'user')
    renderWithModule(mod)

    // Click to expand
    const header = container.querySelector('button')!
    act(() => header.click())

    expect(container.textContent).toContain('编辑此题')
  })

  it('showcase origin 题展开后不显示"编辑此题"按钮', () => {
    const quiz = makeQuiz()
    const mod = makeModule(quiz, 'showcase')
    renderWithModule(mod)

    // Click to expand
    const header = container.querySelector('button')!
    act(() => header.click())

    expect(container.textContent).not.toContain('编辑此题')
  })

  it('点击"编辑此题"切换到编辑模式', () => {
    const quiz = makeQuiz()
    const mod = makeModule(quiz, 'user')
    renderWithModule(mod)

    // Expand
    const header = container.querySelector('button')!
    act(() => header.click())

    // Click edit button
    const editBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === '编辑此题',
    )!
    act(() => editBtn.click())

    expect(container.querySelector('[data-testid="answer-corrector"]')).not.toBeNull()
  })

  it('AnswerCorrector onSave 调用 correctQuizAnswer + markPendingAmnesty + 关闭编辑模式', () => {
    const quiz = makeQuiz()
    const mod = makeModule(quiz, 'user')
    renderWithModule(mod)

    // Expand
    const header = container.querySelector('button')!
    act(() => header.click())

    // Enter edit mode
    const editBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === '编辑此题',
    )!
    act(() => editBtn.click())

    // Find save button
    const saveBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === '保存修改',
    )
    expect(saveBtn).toBeDefined()
    act(() => saveBtn!.click())

    expect(mockCorrectQuizAnswer).toHaveBeenCalledWith('q-1', expect.any(Object))
    expect(mockSetModule).toHaveBeenCalledWith(mod)
    expect(mockMarkPendingAmnesty).toHaveBeenCalledWith('q-1')

    // After save, the edit button should reappear
    const editBtnAfter = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === '编辑此题',
    )
    expect(editBtnAfter).toBeDefined()
  })

  it('AnswerCorrector onCancel 关闭编辑模式回到按钮', () => {
    const quiz = makeQuiz()
    const mod = makeModule(quiz, 'user')
    renderWithModule(mod)

    // Expand
    const header = container.querySelector('button')!
    act(() => header.click())

    // Enter edit mode
    const editBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === '编辑此题',
    )!
    act(() => editBtn.click())

    // Find cancel button
    const cancelBtn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === '取消',
    )
    expect(cancelBtn).toBeDefined()
    act(() => cancelBtn!.click())

    expect(mockCorrectQuizAnswer).not.toHaveBeenCalled()
    expect(mockMarkPendingAmnesty).not.toHaveBeenCalled()

    // Edit button should be visible again
    const editBtnAfter = [...container.querySelectorAll('button')].find(
      (b) => b.textContent === '编辑此题',
    )
    expect(editBtnAfter).toBeDefined()
  })
})
