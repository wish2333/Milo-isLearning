// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'

import type { Quiz } from '@/types/domain'
import { ChoiceQuiz } from '../ChoiceQuiz'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { act } = require('react')

/**
 * ChoiceQuiz 三态渲染单元测试
 *
 * 覆盖场景：
 *   - 未提交：选项无三态标记
 *   - 答对：正解有 success + ✓，其他 opacity-50
 *   - 答错：正解有 success + ✓，错选有 warning + ✗，其他 opacity-50
 *   - submittedAnswer 未传（disabled=true）：原 opacity-60 行为
 *   - onAnswer 回调
 */

function makeChoiceQuiz(): Quiz {
  return {
    id: 'q-choice-1',
    conceptId: 'c1',
    ladderLevel: 1,
    expressionLevel: 1,
    interactionType: 'choice',
    stem: '以下哪项是正确答案？',
    options: ['选项一', '选项二', '选项三', '选项四'],
    answer: '选项二',
    explanation: '选项二是正确答案',
    distractors: ['选项一', '选项三', '选项四'],
  }
}

/** Fix Math.random so shuffle returns identity permutation.
 *  Fisher-Yates: i=3→j=3, i=2→j=2, i=1→j=1 when all j==i.
 * floor(0.875 * 4)=3, floor(0.875 * 3)=2, floor(0.875 * 2)=1 */
function lockShuffleIdentity() {
  const spy = vi.spyOn(Math, 'random').mockReturnValue(0.875)
  return spy
}

describe('ChoiceQuiz', () => {
  let container: HTMLDivElement
  let root: Root

  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    // unstubGlobals=true 会恢复全局，每次测试前重新设置
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    vi.stubGlobal('React', require('react'))
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = false
  })

  function optionButtons(): HTMLButtonElement[] {
    return [...container.querySelectorAll<HTMLButtonElement>('button.alc-option')]
  }

  function submitButton(): HTMLButtonElement {
    const btn = [...container.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === '确认选择',
    )
    if (!(btn instanceof HTMLButtonElement)) throw new Error('submit button not found')
    return btn
  }

  it('renders stem and 4 option buttons in unsubmitted state', () => {
    lockShuffleIdentity()
    const quiz = makeChoiceQuiz()
    const onAnswer = vi.fn()

    act(() => {
      root.render(<ChoiceQuiz quiz={quiz} disabled={false} onAnswer={onAnswer} />)
    })

    expect(container.textContent).toContain('以下哪项是正确答案？')

    const buttons = optionButtons()
    expect(buttons).toHaveLength(4)

    // identity shuffle → order preserved
    expect(buttons[0]!.textContent).toContain('选项一')
    expect(buttons[1]!.textContent).toContain('选项二')
    expect(buttons[2]!.textContent).toContain('选项三')
    expect(buttons[3]!.textContent).toContain('选项四')
  })

  it('shows no 三态 markers when not submitted', () => {
    lockShuffleIdentity()
    const quiz = makeChoiceQuiz()
    const onAnswer = vi.fn()

    act(() => {
      root.render(<ChoiceQuiz quiz={quiz} disabled={false} onAnswer={onAnswer} />)
    })

    const buttons = optionButtons()

    // 无 success / warning / opacity-50 class
    for (const btn of buttons) {
      expect(btn.className).not.toContain('text-success')
      expect(btn.className).not.toContain('text-warning')
      expect(btn.className).not.toContain('opacity-50')
    }

    // 无 ✓ / ✗
    expect(container.textContent).not.toContain('✓')
    expect(container.textContent).not.toContain('✗')
  })

  it('shows success marker on correct answer when submitted correctly', () => {
    lockShuffleIdentity()
    const quiz = makeChoiceQuiz()
    const onAnswer = vi.fn()

    act(() => {
      root.render(
        <ChoiceQuiz quiz={quiz} disabled={true} onAnswer={onAnswer} submittedAnswer="选项二" />,
      )
    })

    const buttons = optionButtons()

    // 正解 "选项二"（index 1）应有 success
    const correctBtn = buttons[1]!
    expect(correctBtn.className).toContain('text-success')
    expect(correctBtn.textContent).toContain('✓')

    // 其他选项应有 opacity-50
    expect(buttons[0]!.className).toContain('opacity-50')
    expect(buttons[2]!.className).toContain('opacity-50')
    expect(buttons[3]!.className).toContain('opacity-50')
  })

  it('shows success on correct + warning on wrong selection when submitted incorrectly', () => {
    lockShuffleIdentity()
    const quiz = makeChoiceQuiz()
    const onAnswer = vi.fn()

    act(() => {
      root.render(
        <ChoiceQuiz quiz={quiz} disabled={true} onAnswer={onAnswer} submittedAnswer="选项一" />,
      )
    })

    const buttons = optionButtons()

    // 正解 "选项二"（index 1）→ success + ✓
    expect(buttons[1]!.className).toContain('text-success')
    expect(buttons[1]!.textContent).toContain('✓')

    // 用户错选 "选项一"（index 0）→ warning + ✗
    expect(buttons[0]!.className).toContain('text-warning')
    expect(buttons[0]!.textContent).toContain('✗')

    // 其他选项 opacity-50
    expect(buttons[2]!.className).toContain('opacity-50')
    expect(buttons[3]!.className).toContain('opacity-50')
  })

  it('falls back to opacity-60 when disabled but submittedAnswer is undefined', () => {
    lockShuffleIdentity()
    const quiz = makeChoiceQuiz()
    const onAnswer = vi.fn()

    act(() => {
      root.render(<ChoiceQuiz quiz={quiz} disabled={true} onAnswer={onAnswer} />)
    })

    const buttons = optionButtons()

    for (const btn of buttons) {
      expect(btn.className).toContain('opacity-60')
      // 三态 class 不应出现
      expect(btn.className).not.toContain('text-success')
      expect(btn.className).not.toContain('text-warning')
    }

    // 无 ✓ / ✗
    expect(container.textContent).not.toContain('✓')
    expect(container.textContent).not.toContain('✗')
  })

  it('calls onAnswer with selected option when submit button is clicked', () => {
    lockShuffleIdentity()
    const quiz = makeChoiceQuiz()
    const onAnswer = vi.fn()

    act(() => {
      root.render(<ChoiceQuiz quiz={quiz} disabled={false} onAnswer={onAnswer} />)
    })

    // 选中 "选项三"
    act(() => {
      optionButtons()[2]!.click()
    })
    expect(optionButtons()[2]!.dataset.selected).toBe('true')

    // 点击确认
    act(() => {
      submitButton().click()
    })

    expect(onAnswer).toHaveBeenCalledWith('选项三')
  })

  it('does not call onAnswer when no option is selected and submit clicked', () => {
    lockShuffleIdentity()
    const quiz = makeChoiceQuiz()
    const onAnswer = vi.fn()

    act(() => {
      root.render(<ChoiceQuiz quiz={quiz} disabled={false} onAnswer={onAnswer} />)
    })

    // 确认按钮应为 disabled（未选择时）
    expect(submitButton().disabled).toBe(true)

    act(() => {
      submitButton().click()
    })

    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('does not call onAnswer when disabled', () => {
    lockShuffleIdentity()
    const quiz = makeChoiceQuiz()
    const onAnswer = vi.fn()

    act(() => {
      root.render(
        <ChoiceQuiz quiz={quiz} disabled={true} onAnswer={onAnswer} submittedAnswer="选项一" />,
      )
    })

    // disabled 状态下不应有提交按钮
    const hasSubmit = [...container.querySelectorAll('button')].some(
      (b) => b.textContent?.trim() === '确认选择',
    )
    expect(hasSubmit).toBe(false)
    expect(onAnswer).not.toHaveBeenCalled()
  })

  it('highlights selected option with data-selected before submit', () => {
    lockShuffleIdentity()
    const quiz = makeChoiceQuiz()
    const onAnswer = vi.fn()

    act(() => {
      root.render(<ChoiceQuiz quiz={quiz} disabled={false} onAnswer={onAnswer} />)
    })

    // 初始无选中
    for (const btn of optionButtons()) {
      expect(btn.dataset.selected).toBeUndefined()
    }

    // 选中 "选项四"
    act(() => {
      optionButtons()[3]!.click()
    })

    expect(optionButtons()[3]!.dataset.selected).toBe('true')
    // 其他未选中
    expect(optionButtons()[0]!.dataset.selected).toBeUndefined()
    expect(optionButtons()[1]!.dataset.selected).toBeUndefined()
    expect(optionButtons()[2]!.dataset.selected).toBeUndefined()
  })
})
