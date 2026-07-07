import { describe, expect, it } from 'vitest'

import { runAgent } from '../_runner'
import { AgentOutputError } from '../errors'
import { getAgentConfig } from '../config'
import { feedbackSchema, importSchema, quizSchema } from '@/lib/compiler/schemas'
import type { ChatMessage, ChatRequest, ChatResponse, LLMProvider } from '@/lib/providers/types'

/**
 * runAgent 测试
 *
 * 覆盖 M2 验收点（M1-Review §9：单 Agent 单测通过）的"调用闭环"维度：
 *   - 成功路径：合法 JSON + 通过 Schema → 返回校验后的数据
 *   - 非法 JSON 重试 1 次后成功
 *   - Schema 违例重试 1 次后成功
 *   - 重试 hint 被追加到对话
 *   - 两次均失败 → 抛 AgentOutputError（reason 正确）
 *   - 空内容 → 触发重试
 *   - 调用参数：temperature / maxTokens / jsonSchema 按 AgentKind 配置传入
 *
 * 使用 mock provider，不依赖真实 LLM API（CI 无需 key 即可跑）。
 */

/** 构造一个按序返回预设响应的 mock provider，并记录所有调用 */
function mockProvider(responses: ChatResponse[]): LLMProvider & { calls: ChatRequest[] } {
  const calls: ChatRequest[] = []
  let idx = 0
  const provider = {
    chat(req: ChatRequest): Promise<ChatResponse> {
      calls.push(req)
      const res = responses[idx] ?? responses[responses.length - 1]
      idx += 1
      if (!res) throw new Error('mockProvider 响应队列已耗尽')
      return Promise.resolve(res)
    },
    chatStream(): AsyncIterable<ChatResponse> {
      throw new Error('mockProvider.chatStream 未实现（本测试不需要）')
    },
    ping(): Promise<{ ok: boolean; latencyMs: number; message?: string }> {
      return Promise.resolve({ ok: true, latencyMs: 0 })
    },
  }
  return Object.assign(provider, { calls })
}

function ok(content: string): ChatResponse {
  return { content, finishReason: 'stop', usage: { promptTokens: 0, completionTokens: 0 } }
}

/** 从对话中找含特定关键词的 system 重试提示（安全解包） */
function findRetryHint(messages: ChatMessage[], keyword: string): ChatMessage | undefined {
  return messages.find((m) => m.role === 'system' && m.content.includes(keyword))
}

describe('runAgent — 成功与重试', () => {
  it('合法 JSON + 通过 Schema → 返回校验后的数据', async () => {
    const validPayload = {
      normalizedText: '# RAG\n\n标准化后的文本内容。',
      stats: { originalLength: 100, normalizedLength: 90, removedElements: 5 },
    }
    const provider = mockProvider([ok(JSON.stringify(validPayload))])

    const result = await runAgent('import', { rawMarkdown: '原始文本' }, provider, importSchema)

    expect(result).toEqual(validPayload)
    expect(provider.calls).toHaveLength(1)
  })

  it('非法 JSON（无 JSON 结构）→ 重试后成功', async () => {
    const validPayload = {
      normalizedText: '标准化文本。',
      stats: { originalLength: 50, normalizedLength: 48, removedElements: 1 },
    }
    const provider = mockProvider([
      ok('这完全不是JSON，没有任何大括号或代码块结构'), // 第一次非法（enhanced parser 也无法提取）
      ok(JSON.stringify(validPayload)), // 第二次合法
    ])

    const result = await runAgent('import', { rawMarkdown: 'x' }, provider, importSchema)

    expect(result).toEqual(validPayload)
    expect(provider.calls).toHaveLength(2)
    // 第二次调用应在 messages 里追加了重试提示
    const secondMessages = provider.calls[1]?.messages
    expect(secondMessages).toBeDefined()
    expect(secondMessages?.length ?? 0).toBeGreaterThan(2) // 多于初始 system+user
    expect(secondMessages && findRetryHint(secondMessages, '合法 JSON')).toBeDefined()
  })

  it('Schema 违例 → 重试 1 次后成功，hint 含校验问题', async () => {
    // 第一次：缺 stats 字段（Schema 违例）
    const invalidPayload = { normalizedText: '只有文本，缺 stats' }
    // 第二次：合规
    const validPayload = {
      normalizedText: '完整文本。',
      stats: { originalLength: 50, normalizedLength: 48, removedElements: 1 },
    }
    const provider = mockProvider([
      ok(JSON.stringify(invalidPayload)),
      ok(JSON.stringify(validPayload)),
    ])

    const result = await runAgent('import', { rawMarkdown: 'x' }, provider, importSchema)

    expect(result).toEqual(validPayload)
    const secondMessages = provider.calls[1]?.messages
    expect(secondMessages && findRetryHint(secondMessages, 'Schema 校验')).toBeDefined()
  })

  it('两次均失败 → 抛 AgentOutputError，reason 为最后一次失败类型', async () => {
    const provider = mockProvider([ok('totally not json'), ok('still not json')])

    await expect(
      runAgent('import', { rawMarkdown: 'x' }, provider, importSchema),
    ).rejects.toMatchObject({
      name: 'AgentOutputError',
      kind: 'import',
      reason: 'invalid_json',
    })
    // MAX_ATTEMPTS=5 → 5 次尝试均失败
    expect(provider.calls).toHaveLength(5)
  })

  it('Schema 违例两次 → reason=schema_violation', async () => {
    const provider = mockProvider([
      ok(JSON.stringify({ normalizedText: '缺 stats' })),
      ok(JSON.stringify({ normalizedText: '又缺 stats' })),
    ])

    await expect(
      runAgent('import', { rawMarkdown: 'x' }, provider, importSchema),
    ).rejects.toMatchObject({
      name: 'AgentOutputError',
      kind: 'import',
      reason: 'schema_violation',
    })
  })

  it('空内容 → 触发重试', async () => {
    const validPayload = {
      normalizedText: '文本。',
      stats: { originalLength: 10, normalizedLength: 9, removedElements: 0 },
    }
    const provider = mockProvider([
      { content: '', finishReason: 'stop', usage: { promptTokens: 0, completionTokens: 0 } },
      ok(JSON.stringify(validPayload)),
    ])

    const result = await runAgent('import', { rawMarkdown: 'x' }, provider, importSchema)

    expect(result).toEqual(validPayload)
    expect(provider.calls).toHaveLength(2)
    const secondMessages = provider.calls[1]?.messages
    expect(secondMessages && findRetryHint(secondMessages, '为空')).toBeDefined()
  })

  it('finish_reason=length 触发截断提示重试', async () => {
    const validPayload = {
      normalizedText: '文本。',
      stats: { originalLength: 10, normalizedLength: 9, removedElements: 0 },
    }
    const provider = mockProvider([
      { content: '', finishReason: 'length', usage: { promptTokens: 0, completionTokens: 0 } },
      ok(JSON.stringify(validPayload)),
    ])

    await runAgent('import', { rawMarkdown: 'x' }, provider, importSchema)

    const secondMessages = provider.calls[1]?.messages
    expect(secondMessages && findRetryHint(secondMessages, '截断')).toBeDefined()
  })
})

describe('runAgent — AgentKind 配置传递', () => {
  it('按 AgentKind 配置传递 temperature（M3 W8 移除 maxTokens）', async () => {
    const validPayload = {
      normalizedText: 'x',
      stats: { originalLength: 10, normalizedLength: 9, removedElements: 0 },
    }
    const provider = mockProvider([ok(JSON.stringify(validPayload))])

    await runAgent('import', { rawMarkdown: 'x' }, provider, importSchema)

    const cfg = getAgentConfig('import')
    const firstCall = provider.calls[0]
    expect(firstCall?.temperature).toBe(cfg.temperature)
  })

  it('Quiz Agent 用高温度 0.7，Feedback 用低温度 0.1', async () => {
    // feedback 合法输出
    const feedbackPayload = {
      score: 100,
      gaps: [],
      next_action: 'advance',
      feedback_text: '完全正确，继续保持。',
    }
    const provider = mockProvider([ok(JSON.stringify(feedbackPayload))])

    await runAgent('feedback', { quiz: {}, userAnswer: 'x' }, provider, feedbackSchema)

    expect(provider.calls[0]?.temperature).toBe(0.1)
    expect(getAgentConfig('quiz').temperature).toBe(0.7)
  })

  it('每次调用都传 jsonSchema（触发 provider 的 response_format=json_object）', async () => {
    const validPayload = {
      normalizedText: 'x',
      stats: { originalLength: 10, normalizedLength: 9, removedElements: 0 },
    }
    const provider = mockProvider([ok(JSON.stringify(validPayload))])

    await runAgent('import', { rawMarkdown: 'x' }, provider, importSchema)

    const schema = provider.calls[0]?.jsonSchema
    expect(schema).toBeDefined()
    // jsonSchema 应含 type=object（由 zod-to-json-schema 产出）
    expect((schema as Record<string, unknown>)?.type).toBe('object')
  })
})

describe('runAgent — AgentOutputError 形状', () => {
  it('错误携带 kind / reason / raw，message 可读', async () => {
    const provider = mockProvider([ok('bad'), ok('bad2')])
    let thrown: unknown
    try {
      await runAgent('quiz', { placeholder: {} }, provider, quizSchema)
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(AgentOutputError)
    const err = thrown as AgentOutputError
    expect(err.kind).toBe('quiz')
    expect(err.reason).toBe('invalid_json')
    expect(err.raw).toBe('bad2')
    expect(err.message).toContain('quiz')
  })
})
