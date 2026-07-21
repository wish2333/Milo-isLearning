// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'

vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const R = require('react')
  vi.stubGlobal('React', R)
})

import type { Quiz } from '@/types/domain'
import { AnswerCorrector } from '../AnswerCorrector'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { act } = require('react')

/**
 * AnswerCorrector 单元测试
 *
 * 覆盖场景：
 *   - ChoiceEditor: radio 列表、初始选中、点击切换、保存回调
 *   - FillBlankEditor: 正解 input + acceptableAnswers + 无 answerHint
 *   - SortingEditor: 简单冒烟（渲染不崩）
 */

function makeChoiceQuiz(): Quiz {
  return {
    id: 'q-choice-1',
    conceptId: 'c1',
    ladderLevel: 1,
    expressionLevel: 1,
    interactionType: 'choice',
    stem: '选择题干',
    options: ['选项A', '选项B', '选项C', '选项D'],
    answer: '选项B',
    explanation: 'B 是正确答案',
    distractors: ['选项A', '选项C', '选项D'],
  }
}

function makeFillBlankQuiz(): Quiz {
  return {
    id: 'q-fill-1',
    conceptId: 'c1',
    ladderLevel: 1,
    expressionLevel: 1,
    interactionType: 'fill_blank',
    stem: '填空题干',
    options: null,
    answer: '正确答案',
    explanation: '解析',
    distractors: [],
    answerHint: '提示文本',
    acceptableAnswers: ['正确答案', '可接受变体'],
  }
}

function makeSortingQuiz(): Quiz {
  return {
    id: 'q-sort-1',
    conceptId: 'c1',
    ladderLevel: 2,
    expressionLevel: 2,
    interactionType: 'sorting',
    stem: '排序题干',
    options: ['第三', '第一', '第二'],
    answer: '第一\n第二\n第三',
    explanation: '排序解析',
    distractors: [],
  }
}

describe('AnswerCorrector — ChoiceEditor', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    vi.stubGlobal('React', require('react'))
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
  })

  function radioButtons(): HTMLButtonElement[] {
    return [...container.querySelectorAll<HTMLButtonElement>('button[role="radio"]')]
  }

  function saveButton(): HTMLButtonElement {
    const btn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === '保存',
    )
    if (!(btn instanceof HTMLButtonElement)) throw new Error('save button not found')
    return btn
  }

  it('renders all options as radio rows', () => {
    const quiz = makeChoiceQuiz()
    act(() => {
      root.render(<AnswerCorrector quiz={quiz} onSave={vi.fn()} onCancel={vi.fn()} />)
    })

    const radios = radioButtons()
    expect(radios).toHaveLength(4)
    expect(radios[0]!.textContent).toContain('A.')
    expect(radios[0]!.textContent).toContain('选项A')
    expect(radios[1]!.textContent).toContain('B.')
    expect(radios[1]!.textContent).toContain('选项B')
  })

  it('initially selects the quiz.answer option', () => {
    const quiz = makeChoiceQuiz()
    act(() => {
      root.render(<AnswerCorrector quiz={quiz} onSave={vi.fn()} onCancel={vi.fn()} />)
    })

    const radios = radioButtons()
    // 选项B 是 answer
    expect(radios[1]!.getAttribute('aria-checked')).toBe('true')
    expect(radios[1]!.textContent).toContain('●')
    expect(radios[1]!.textContent).toContain('✓ 当前正解')

    // 其他未选中
    expect(radios[0]!.getAttribute('aria-checked')).toBe('false')
    expect(radios[0]!.textContent).toContain('○')
  })

  it('switches selected option on click', () => {
    const quiz = makeChoiceQuiz()
    act(() => {
      root.render(<AnswerCorrector quiz={quiz} onSave={vi.fn()} onCancel={vi.fn()} />)
    })

    // 点击选项C
    act(() => {
      radioButtons()[2]!.click()
    })

    const radios = radioButtons()
    expect(radios[2]!.getAttribute('aria-checked')).toBe('true')
    expect(radios[1]!.getAttribute('aria-checked')).toBe('false')
  })

  it('calls onSave with new answer when save clicked after switch', () => {
    const quiz = makeChoiceQuiz()
    const onSave = vi.fn()

    act(() => {
      root.render(<AnswerCorrector quiz={quiz} onSave={onSave} onCancel={vi.fn()} />)
    })

    // 保存按钮初始应 disabled（未修改）
    expect(saveButton().disabled).toBe(true)

    // 切换到选项C
    act(() => {
      radioButtons()[2]!.click()
    })

    // 保存按钮现在可用
    expect(saveButton().disabled).toBe(false)

    act(() => {
      saveButton().click()
    })

    expect(onSave).toHaveBeenCalledWith({ answer: '选项C' })
  })

  it('does not render stem or explanation text inputs for choice', () => {
    const quiz = makeChoiceQuiz()
    act(() => {
      root.render(<AnswerCorrector quiz={quiz} onSave={vi.fn()} onCancel={vi.fn()} />)
    })

    // 无文本 input（choice 只用 radio）
    const inputs = container.querySelectorAll('input')
    expect(inputs).toHaveLength(0)
  })

  it('disables save button when selection unchanged', () => {
    const quiz = makeChoiceQuiz()
    act(() => {
      root.render(<AnswerCorrector quiz={quiz} onSave={vi.fn()} onCancel={vi.fn()} />)
    })

    expect(saveButton().disabled).toBe(true)

    // 点击当前已选的选项B（不变）
    act(() => {
      radioButtons()[1]!.click()
    })

    expect(saveButton().disabled).toBe(true)
  })
})

describe('AnswerCorrector — FillBlankEditor', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    vi.stubGlobal('React', require('react'))
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
  })

  function saveButton(): HTMLButtonElement {
    const btn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === '保存',
    )
    if (!(btn instanceof HTMLButtonElement)) throw new Error('save button not found')
    return btn
  }

  it('renders correct answer input with quiz.answer value', () => {
    const quiz = makeFillBlankQuiz()
    act(() => {
      root.render(<AnswerCorrector quiz={quiz} onSave={vi.fn()} onCancel={vi.fn()} />)
    })

    const primaryInput = container.querySelector('#corrector-primary') as HTMLInputElement | null
    expect(primaryInput).not.toBeNull()
    expect(primaryInput!.value).toBe('正确答案')
  })

  it('renders acceptable answers input', () => {
    const quiz = makeFillBlankQuiz()
    act(() => {
      root.render(<AnswerCorrector quiz={quiz} onSave={vi.fn()} onCancel={vi.fn()} />)
    })

    const extraInput = container.querySelector('#corrector-extra') as HTMLInputElement | null
    expect(extraInput).not.toBeNull()
    // acceptableAnswers 过滤掉 primaryAnswer 后：['可接受变体']
    expect(extraInput!.value).toBe('可接受变体')
  })

  it('does not render answerHint input', () => {
    const quiz = makeFillBlankQuiz()
    act(() => {
      root.render(<AnswerCorrector quiz={quiz} onSave={vi.fn()} onCancel={vi.fn()} />)
    })

    // 应无 hint input
    const hintInput = container.querySelector('#corrector-hint')
    expect(hintInput).toBeNull()

    // 更保险：检查所有 input id
    const allInputIds = [...container.querySelectorAll('input')].map((i) => i.id)
    expect(allInputIds).toEqual(['corrector-primary', 'corrector-extra'])
  })

  it('calls onSave with answer and acceptableAnswers on save', () => {
    const quiz = makeFillBlankQuiz()
    const onSave = vi.fn()

    act(() => {
      root.render(<AnswerCorrector quiz={quiz} onSave={onSave} onCancel={vi.fn()} />)
    })

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!

    act(() => {
      const primaryInput = container.querySelector('#corrector-primary') as HTMLInputElement
      nativeInputValueSetter.call(primaryInput, '新答案')
      primaryInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    act(() => {
      saveButton().click()
    })

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        answer: '新答案',
        acceptableAnswers: expect.arrayContaining(['新答案']),
      }),
    )
  })

  it('shows validation error when all answers are empty', () => {
    const quiz: Quiz = {
      id: 'q-fill-v',
      conceptId: 'c1',
      ladderLevel: 1,
      expressionLevel: 1,
      interactionType: 'fill_blank',
      stem: '填空题干',
      options: null,
      answer: '正确答案',
      explanation: '解析',
      distractors: [],
      answerHint: '提示文本',
      acceptableAnswers: [],
    }
    const onSave = vi.fn()

    act(() => {
      root.render(<AnswerCorrector quiz={quiz} onSave={onSave} onCancel={vi.fn()} />)
    })

    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )!.set!

    const primaryInput = container.querySelector('#corrector-primary') as HTMLInputElement
    act(() => {
      nativeInputValueSetter.call(primaryInput, '')
      primaryInput.dispatchEvent(new Event('change', { bubbles: true }))
    })

    act(() => {
      saveButton().click()
    })

    expect(onSave).not.toHaveBeenCalled()
    expect(container.textContent).toContain('答案不能为空')
  })
})

describe('AnswerCorrector — SortingEditor', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    vi.stubGlobal('React', require('react'))
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
  })

  it('renders sorting items without crashing', () => {
    const quiz = makeSortingQuiz()
    act(() => {
      root.render(<AnswerCorrector quiz={quiz} onSave={vi.fn()} onCancel={vi.fn()} />)
    })

    expect(container.textContent).toContain('第三')
    expect(container.textContent).toContain('第一')
    expect(container.textContent).toContain('第二')
    expect(container.textContent).toContain('指定正确答案')
  })

  it('renders up/down arrow buttons for reordering', () => {
    const quiz = makeSortingQuiz()
    act(() => {
      root.render(<AnswerCorrector quiz={quiz} onSave={vi.fn()} onCancel={vi.fn()} />)
    })

    // 3 items × 2 arrows = 6 arrow buttons
    const arrowButtons = [...container.querySelectorAll('button')].filter(
      (b) => b.textContent?.trim() === '▲' || b.textContent?.trim() === '▼',
    )
    expect(arrowButtons).toHaveLength(6)

    // First item's up arrow disabled
    const upArrows = [...container.querySelectorAll('button')].filter(
      (b) => b.textContent?.trim() === '▲',
    )
    expect(upArrows[0]!.disabled).toBe(true)
    expect(upArrows[1]!.disabled).toBe(false)
  })
})
