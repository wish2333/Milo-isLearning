import { describe, expect, it, vi } from 'vitest'

import type { LLMProvider } from '@/lib/providers'
import type { Quiz } from '@/types/domain'

import {
  clearSemanticEvaluationCache,
  evaluateSemanticAnswer,
  getSemanticEvaluationStats,
} from '../semantic-evaluation'

const fillBlankQuiz: Quiz = {
  id: 'concept-1:slot-3',
  conceptId: 'concept-1',
  ladderLevel: 2,
  expressionLevel: 3,
  interactionType: 'fill_blank',
  stem: '这些材料主要进入模型的哪一部分？',
  options: null,
  answer: '上下文窗口',
  acceptableAnswers: ['上下文窗口', 'context window'],
  answerHint: '模型本次回答时能同时看到的输入范围',
  explanation:
    'RAG 的检索片段是随请求一起提供的外部材料，模型在生成答案时参考它们；它们不会直接进入训练集，也不会改变模型权重。',
  distractors: ['训练集'],
  evaluationMode: 'semantic',
}

function providerReturning(content: string): LLMProvider {
  return {
    chat: vi.fn(async () => ({
      content,
      finishReason: 'stop',
      usage: { promptTokens: 11, completionTokens: 7 },
    })),
    chatStream: vi.fn(),
    ping: vi.fn(),
  } as unknown as LLMProvider
}

describe('evaluateSemanticAnswer', () => {
  it('accepts local normalized matches before calling the provider', async () => {
    clearSemanticEvaluationCache()
    const provider = providerReturning('{"accepted":false,"reason":"no"}')

    const result = await evaluateSemanticAnswer({
      quiz: fillBlankQuiz,
      userAnswer: ' context  window ',
      provider,
    })

    expect(result.accepted).toBe(true)
    expect(result.source).toBe('local')
    expect(provider.chat).not.toHaveBeenCalled()
  })

  it('falls back to LLM semantic evaluation after local mismatch', async () => {
    clearSemanticEvaluationCache()
    const provider = providerReturning('{"accepted":true,"reason":"同义表达"}')

    const result = await evaluateSemanticAnswer({
      quiz: fillBlankQuiz,
      userAnswer: '当前输入上下文',
      provider,
    })

    expect(result.accepted).toBe(true)
    expect(result.source).toBe('semantic')
    expect(result.reason).toBe('同义表达')
    expect(provider.chat).toHaveBeenCalledOnce()
  })

  it('uses cache for repeated semantic evaluations', async () => {
    clearSemanticEvaluationCache()
    const provider = providerReturning('{"accepted":true,"reason":"同义表达"}')

    await evaluateSemanticAnswer({ quiz: fillBlankQuiz, userAnswer: '当前输入上下文', provider })
    const result = await evaluateSemanticAnswer({
      quiz: fillBlankQuiz,
      userAnswer: '当前输入上下文',
      provider,
    })

    expect(result.source).toBe('cache')
    expect(provider.chat).toHaveBeenCalledOnce()
    expect(getSemanticEvaluationStats()).toMatchObject({ calls: 1, cacheHits: 1 })
  })

  it('degrades to local failure when provider fails', async () => {
    clearSemanticEvaluationCache()
    const provider: LLMProvider = {
      chat: vi.fn(async () => {
        throw new Error('network down')
      }),
      chatStream: vi.fn(),
      ping: vi.fn(),
    } as unknown as LLMProvider

    const result = await evaluateSemanticAnswer({
      quiz: fillBlankQuiz,
      userAnswer: '训练数据',
      provider,
    })

    expect(result.accepted).toBe(false)
    expect(result.source).toBe('failed')
    expect(result.reason).toContain('network down')
    expect(getSemanticEvaluationStats().providerFailures).toBe(1)
  })

  it('does not call provider when evaluationMode is exact', async () => {
    clearSemanticEvaluationCache()
    const provider = providerReturning('{"accepted":true,"reason":"would pass"}')

    const result = await evaluateSemanticAnswer({
      quiz: { ...fillBlankQuiz, evaluationMode: 'exact' },
      userAnswer: '当前输入上下文',
      provider,
    })

    expect(result.accepted).toBe(false)
    expect(result.source).toBe('local')
    expect(provider.chat).not.toHaveBeenCalled()
  })
})
