import { describe, expect, it } from 'vitest'

import type { ChatRequest, ChatResponse, LLMProvider } from '@/lib/providers/types'

import { AgentOutputError } from '../errors'
import { runKnowledgeExpander } from '../knowledge-expander'

function makePayload() {
  return {
    title: '检索增强生成',
    intro: '理解检索增强生成如何把外部知识接入语言模型。',
    goal: '能够解释检索、排序与生成之间的协作关系。',
    normalizedSource: '# 检索增强生成\n\n' + '内容'.repeat(500),
    conceptAnchors: [
      { anchorId: 'anchor-1', name: '检索', knowledgePage: '检索'.repeat(200) },
      { anchorId: 'anchor-2', name: '生成', knowledgePage: '生成'.repeat(200) },
    ],
  }
}

function mockProvider(responses: string[]): LLMProvider & { calls: ChatRequest[] } {
  const calls: ChatRequest[] = []
  let index = 0
  const provider: LLMProvider = {
    chat(request) {
      calls.push(request)
      const content = responses[index] ?? responses[responses.length - 1] ?? ''
      index += 1
      return Promise.resolve({
        content,
        finishReason: 'stop',
        usage: { promptTokens: 10, completionTokens: 20 },
      } satisfies ChatResponse)
    },
    chatStream() {
      throw new Error('测试不需要流式调用')
    },
    ping() {
      return Promise.resolve({ ok: true, latencyMs: 0 })
    },
  }
  return Object.assign(provider, { calls })
}

const config = {
  provider: 'deepseek' as const,
  apiKey: 'test-key',
  model: 'test-model',
}

describe('runKnowledgeExpander', () => {
  it('构建主题与约束 prompt，并返回 Schema 校验后的扩充知识', async () => {
    const provider = mockProvider([JSON.stringify(makePayload())])

    const result = await runKnowledgeExpander('检索增强生成', '面向有编程基础的学习者', config, {
      provider,
    })

    expect(result.data.title).toBe('检索增强生成')
    expect(result.data.conceptAnchors).toHaveLength(2)
    expect(result.usage.totalTokens).toBe(30)
    expect(provider.calls).toHaveLength(1)
    expect(provider.calls[0]?.messages[1]?.content).toContain('检索增强生成')
    expect(provider.calls[0]?.messages[1]?.content).toContain('面向有编程基础的学习者')
    expect(provider.calls[0]?.jsonSchema).toBeDefined()
  })

  it('非法 JSON 后重试并成功', async () => {
    const provider = mockProvider(['不是 JSON', JSON.stringify(makePayload())])

    const result = await runKnowledgeExpander('检索增强生成', undefined, config, { provider })

    expect(result.data.normalizedSource).toContain('检索增强生成')
    expect(provider.calls).toHaveLength(2)
    expect(provider.calls[1]?.messages.some((m) => m.content.includes('合法 JSON'))).toBe(true)
  })

  it('Schema 持续违例后抛出 AgentOutputError', async () => {
    const provider = mockProvider([JSON.stringify({ title: '缺少必需字段' })])

    await expect(
      runKnowledgeExpander('检索增强生成', undefined, config, { provider }),
    ).rejects.toBeInstanceOf(AgentOutputError)
    expect(provider.calls).toHaveLength(5)
  })

  it('拒绝长度不在 5-50 字范围内的主题', async () => {
    const provider = mockProvider([JSON.stringify(makePayload())])

    await expect(runKnowledgeExpander('短', undefined, config, { provider })).rejects.toThrow(
      '5-50',
    )
    expect(provider.calls).toHaveLength(0)
  })
})
