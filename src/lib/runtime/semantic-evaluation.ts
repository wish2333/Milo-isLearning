import type { LLMProvider } from '@/lib/providers'
import type { Quiz } from '@/types/domain'

import { isFillBlankAnswerAccepted, normalizeFillBlankAnswer } from './fill-blank'

export interface SemanticEvaluationResult {
  accepted: boolean
  source: 'local' | 'semantic' | 'cache' | 'failed'
  reason: string
}

export interface SemanticEvaluationStats {
  calls: number
  cacheHits: number
  semanticAccepted: number
  providerFailures: number
  estimatedPromptTokens: number
  estimatedCompletionTokens: number
}

interface EvaluateSemanticAnswerArgs {
  quiz: Quiz
  userAnswer: string
  provider?: LLMProvider | null
}

const cache = new Map<string, SemanticEvaluationResult>()

let stats: SemanticEvaluationStats = {
  calls: 0,
  cacheHits: 0,
  semanticAccepted: 0,
  providerFailures: 0,
  estimatedPromptTokens: 0,
  estimatedCompletionTokens: 0,
}

function shouldUseSemantic(quiz: Quiz): boolean {
  if (quiz.interactionType !== 'fill_blank') return false
  return quiz.evaluationMode !== 'exact' && quiz.evaluationMode !== 'normalized'
}

function cacheKey(quiz: Quiz, userAnswer: string): string {
  return [
    quiz.id,
    normalizeFillBlankAnswer(userAnswer),
    normalizeFillBlankAnswer(quiz.answer),
    ...(quiz.acceptableAnswers ?? []).map(normalizeFillBlankAnswer).sort(),
  ].join('|')
}

function parseProviderResult(content: string): { accepted: boolean; reason: string } {
  try {
    const parsed = JSON.parse(content) as { accepted?: unknown; reason?: unknown }
    return {
      accepted: parsed.accepted === true,
      reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    }
  } catch {
    return { accepted: false, reason: 'LLM 返回无法解析' }
  }
}

export function clearSemanticEvaluationCache(): void {
  cache.clear()
  stats = {
    calls: 0,
    cacheHits: 0,
    semanticAccepted: 0,
    providerFailures: 0,
    estimatedPromptTokens: 0,
    estimatedCompletionTokens: 0,
  }
}

export function getSemanticEvaluationStats(): SemanticEvaluationStats {
  return { ...stats }
}

export async function evaluateSemanticAnswer({
  quiz,
  userAnswer,
  provider,
}: EvaluateSemanticAnswerArgs): Promise<SemanticEvaluationResult> {
  const localAccepted = isFillBlankAnswerAccepted(userAnswer, quiz.answer, quiz.acceptableAnswers)
  if (localAccepted || !shouldUseSemantic(quiz)) {
    return {
      accepted: localAccepted,
      source: 'local',
      reason: localAccepted ? '本地答案匹配' : '本地答案不匹配',
    }
  }

  if (!provider) {
    return { accepted: false, source: 'failed', reason: '未配置语义判分 Provider' }
  }

  const key = cacheKey(quiz, userAnswer)
  const cached = cache.get(key)
  if (cached) {
    stats.cacheHits++
    return { ...cached, source: 'cache' }
  }

  stats.calls++
  try {
    const response = await provider.chat({
      temperature: 0,
      maxTokens: 120,
      messages: [
        {
          role: 'system',
          content:
            '你是严格的短语答案语义判分器。只输出 JSON：{"accepted": boolean, "reason": string}。不要泄露或记录 API Key。',
        },
        {
          role: 'user',
          content: JSON.stringify({
            stem: quiz.stem,
            answer: quiz.answer,
            acceptableAnswers: quiz.acceptableAnswers ?? [],
            answerHint: quiz.answerHint,
            userAnswer,
          }),
        },
      ],
    })
    stats.estimatedPromptTokens += response.usage.promptTokens
    stats.estimatedCompletionTokens += response.usage.completionTokens

    const parsed = parseProviderResult(response.content)
    const result: SemanticEvaluationResult = {
      accepted: parsed.accepted,
      source: 'semantic',
      reason: parsed.reason || (parsed.accepted ? '语义等价' : '语义不等价'),
    }
    if (result.accepted) stats.semanticAccepted++
    cache.set(key, result)
    return result
  } catch (error) {
    stats.providerFailures++
    return {
      accepted: false,
      source: 'failed',
      reason: error instanceof Error ? error.message : String(error),
    }
  }
}
