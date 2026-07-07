/**
 * OpenAI 兼容协议通用实现
 *
 * 对应 docs/Technical-Specification.md §3.2 + §3.4。
 *
 * 复用：
 *   - DeepSeek 完全兼容 OpenAI 协议
 *   - 智谱 GLM v4 提供 `/api/paas/v4/chat/completions` 兼容端点
 *
 * 重试策略（Tech Spec §3.4）：
 *   | 错误类型         | 重试 | 退避              |
 *   | 429              | 2 次 | 1s → 2s           |
 *   | 5xx              | 2 次 | 500ms → 1s        |
 *   | 网络超时 (30s)   | 1 次 | 1s                |
 *   | 4xx（除 429）    | 0 次 | 立即抛出          |
 *
 *   JSON Schema 校验失败的重试在 _runner.ts 中处理（Tech Spec §4.3），
 *   不在 Provider 层。
 *
 * 流式响应：不做重试（流被部分消费后无法干净重启），调用方自行决定是否在外层重试。
 */

import {
  ProviderError,
  type ChatRequest,
  type ChatResponse,
  type LLMConfig,
  type LLMProvider,
  type PingResult,
} from './types'

// =================================================================
// 重试策略
// =================================================================

interface RetryPolicy {
  maxRetries: number
  backoffMs: (attempt: number) => number
}

/** 429 限流：1s → 2s（共 2 次重试） */
const RETRY_429: RetryPolicy = {
  maxRetries: 2,
  backoffMs: (attempt: number): number => 1000 * 2 ** attempt,
}

/** 5xx 服务端错误：500ms → 1s（共 2 次重试） */
const RETRY_5XX: RetryPolicy = {
  maxRetries: 2,
  backoffMs: (attempt: number): number => 500 * 2 ** attempt,
}

/** 网络 / 超时：1s（共 1 次重试） */
const RETRY_NETWORK: RetryPolicy = {
  maxRetries: 1,
  backoffMs: (): number => 1000,
}

const DEFAULT_TIMEOUT_MS = 600_000

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// =================================================================
// OpenAICompatProvider
// =================================================================

export class OpenAICompatProvider implements LLMProvider {
  constructor(
    private readonly config: LLMConfig,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {
    if (!config.apiKey) {
      throw new Error('LLMConfig.apiKey is required')
    }
    if (!config.baseURL) {
      throw new Error('LLMConfig.baseURL is required')
    }
    if (!config.model) {
      throw new Error('LLMConfig.model is required')
    }
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const url = this.chatCompletionsURL()
    const init = this.buildRequestInit(req, /* stream */ false)

    for (let attempt = 0; ; attempt++) {
      try {
        const response = await this.fetchWithTimeout(url, init)

        if (response.status === 429) {
          if (attempt >= RETRY_429.maxRetries) {
            throw new ProviderError('llm_rate_limit', 'HTTP 429 rate limited', 429, false)
          }
          await sleep(RETRY_429.backoffMs(attempt))
          continue
        }

        if (response.status >= 500 && response.status < 600) {
          if (attempt >= RETRY_5XX.maxRetries) {
            throw new ProviderError(
              'llm_unavailable',
              `HTTP ${response.status} server error`,
              response.status,
              false,
            )
          }
          await sleep(RETRY_5XX.backoffMs(attempt))
          continue
        }

        if (response.status >= 400) {
          // 4xx (除 429)：立即抛出，不重试
          const body = await this.readErrorBody(response)
          throw new ProviderError(
            'llm_client_error',
            `HTTP ${response.status} client error${body ? `: ${body}` : ''}`,
            response.status,
            false,
          )
        }

        // 2xx
        const json = await this.parseJsonSafely(response)
        return this.parseChatResponse(json)
      } catch (e) {
        if (e instanceof ProviderError) throw e
        // 网络 / 超时 / abort
        if (attempt >= RETRY_NETWORK.maxRetries) {
          throw this.classifyNetworkError(e)
        }
        await sleep(RETRY_NETWORK.backoffMs(attempt))
      }
    }
  }

  async *chatStream(req: ChatRequest): AsyncIterable<ChatResponse> {
    const url = this.chatCompletionsURL()
    const init = this.buildRequestInit(req, /* stream */ true)

    // 流式：无重试（流被部分消费后无法干净重启）
    const response = await this.fetchWithTimeout(url, init)

    if (response.status === 429) {
      throw new ProviderError('llm_rate_limit', 'HTTP 429 rate limited', 429, false)
    }
    if (response.status >= 500) {
      throw new ProviderError('llm_unavailable', `HTTP ${response.status}`, response.status, false)
    }
    if (response.status >= 400) {
      throw new ProviderError('llm_client_error', `HTTP ${response.status}`, response.status, false)
    }
    if (!response.body) {
      throw new ProviderError('invalid_response', 'stream response has no body')
    }

    for await (const data of parseSSEStream(response.body)) {
      const parsed = this.parseStreamChunk(data)
      if (parsed) yield parsed
    }
  }

  async ping(): Promise<PingResult> {
    const start = Date.now()
    try {
      // 单次最小请求，不重试 — ping 反映当前健康度
      await this.chatOnce({
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 5,
      })
      return {
        ok: true,
        latencyMs: Date.now() - start,
        message: `OK (${this.config.provider}/${this.config.model})`,
      }
    } catch (e) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        message: e instanceof Error ? e.message : String(e),
      }
    }
  }

  /**
   * 无重试版本的 chat，专供 ping 使用
   */
  private async chatOnce(req: ChatRequest): Promise<ChatResponse> {
    const url = this.chatCompletionsURL()
    const init = this.buildRequestInit(req, /* stream */ false)
    try {
      const response = await this.fetchWithTimeout(url, init)

      if (response.status === 429) {
        throw new ProviderError('llm_rate_limit', 'HTTP 429', 429, false)
      }
      if (response.status >= 500) {
        throw new ProviderError(
          'llm_unavailable',
          `HTTP ${response.status}`,
          response.status,
          false,
        )
      }
      if (response.status >= 400) {
        throw new ProviderError(
          'llm_client_error',
          `HTTP ${response.status}`,
          response.status,
          false,
        )
      }
      const json = await this.parseJsonSafely(response)
      return this.parseChatResponse(json)
    } catch (e) {
      if (e instanceof ProviderError) throw e
      throw this.classifyNetworkError(e)
    }
  }

  // ===================== 私有 helpers =====================

  private chatCompletionsURL(): string {
    return `${this.config.baseURL}/chat/completions`
  }

  private buildRequestInit(req: ChatRequest, stream: boolean): RequestInit {
    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: req.messages,
      temperature: req.temperature ?? this.config.temperature ?? 0.7,
    }
    const maxTokens = req.maxTokens ?? this.config.maxTokens
    if (maxTokens !== undefined) {
      body.max_tokens = maxTokens
    }
    if (req.jsonSchema) {
      // 强制 JSON 输出。Schema 在客户端通过 Zod 校验（Tech Spec §4.3）。
      body.response_format = { type: 'json_object' }
    }
    if (stream) {
      body.stream = true
    }
    // extraBody shallow-merge（M2.5 W3）：供应商私有字段透传，例如 GLM enable_thinking。
    // 已存在的键不被覆盖（caller 责任避免命名冲突）。
    if (req.extraBody) {
      for (const [k, v] of Object.entries(req.extraBody)) {
        if (!(k in body)) {
          body[k] = v
        }
      }
    }
    return {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    }
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      return await fetch(url, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timer)
    }
  }

  private async parseJsonSafely(response: Response): Promise<unknown> {
    try {
      return await response.json()
    } catch (e) {
      throw new ProviderError(
        'invalid_response',
        `failed to parse JSON: ${e instanceof Error ? e.message : String(e)}`,
        undefined,
        false,
      )
    }
  }

  private async readErrorBody(response: Response): Promise<string> {
    try {
      const text = await response.text()
      return text.length > 200 ? `${text.slice(0, 200)}...` : text
    } catch {
      return ''
    }
  }

  private classifyNetworkError(e: unknown): ProviderError {
    if (e instanceof Error) {
      if (e.name === 'AbortError') {
        return new ProviderError(
          'network',
          `request timeout after ${this.timeoutMs}ms`,
          undefined,
          true,
        )
      }
      // fetch 在 DNS / 连接失败时抛 TypeError
      if (e.name === 'TypeError') {
        return new ProviderError('network', e.message, undefined, true)
      }
    }
    return new ProviderError(
      'invalid_response',
      e instanceof Error ? e.message : String(e),
      undefined,
      false,
    )
  }

  private parseChatResponse(json: unknown): ChatResponse {
    if (typeof json !== 'object' || json === null) {
      throw new ProviderError('invalid_response', 'response is not an object')
    }
    const obj = json as Record<string, unknown>
    const choices = obj['choices']
    if (!Array.isArray(choices) || choices.length === 0) {
      throw new ProviderError('invalid_response', 'response missing choices[]')
    }
    const firstChoice = choices[0] as Record<string, unknown> | undefined
    if (!firstChoice) {
      throw new ProviderError('invalid_response', 'response.choices[0] is undefined')
    }
    const message = firstChoice['message'] as Record<string, unknown> | undefined
    const rawContent = message?.['content']
    // GLM thinking 模式 / DeepSeek V4 默认 thinking：content 可能为空，
    // 实际答案落在 reasoning_content（见 Prompt-Engineering.md §2.2.3 响应字段回退）。
    // 优先取 content；为空时回退到 reasoning_content；两者都空才报错。
    const reasoningContent = message?.['reasoning_content']
    const content =
      typeof rawContent === 'string' && rawContent.length > 0
        ? rawContent
        : typeof reasoningContent === 'string'
          ? reasoningContent
          : ''
    if (!content) {
      throw new ProviderError(
        'invalid_response',
        'response.choices[0].message.content and reasoning_content are both empty',
      )
    }
    const finishReason = firstChoice['finish_reason']
    const usage = obj['usage'] as Record<string, unknown> | undefined

    return {
      content,
      finishReason:
        finishReason === 'length'
          ? 'length'
          : finishReason === 'content_filter'
            ? 'content_filter'
            : 'stop',
      usage: {
        promptTokens: typeof usage?.['prompt_tokens'] === 'number' ? usage['prompt_tokens'] : 0,
        completionTokens:
          typeof usage?.['completion_tokens'] === 'number' ? usage['completion_tokens'] : 0,
      },
    }
  }

  private parseStreamChunk(data: string): ChatResponse | null {
    if (data === '[DONE]') return null
    let parsed: unknown
    try {
      parsed = JSON.parse(data)
    } catch {
      return null // skip malformed chunk
    }
    if (typeof parsed !== 'object' || parsed === null) return null
    const obj = parsed as Record<string, unknown>
    const choices = obj['choices']
    if (!Array.isArray(choices) || choices.length === 0) return null
    const firstChoice = choices[0] as Record<string, unknown> | undefined
    if (!firstChoice) return null
    const delta = firstChoice['delta'] as Record<string, unknown> | undefined
    const content = delta?.['content']
    if (typeof content !== 'string') return null

    return {
      content,
      finishReason: 'stop',
      usage: { promptTokens: 0, completionTokens: 0 },
    }
  }
}

// =================================================================
// SSE 流解析器
// =================================================================

/**
 * 解析 SSE 流，按 `\n\n` 切分事件，提取每条事件的 `data:` 行。
 *
 * 处理网络数据块边界（一个事件可能跨多个 chunk）。
 */
async function* parseSSEStream(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const events = buffer.split('\n\n')
      // 最后一段可能不完整，留到下一轮
      buffer = events.pop() ?? ''
      for (const event of events) {
        const data = extractDataLine(event)
        if (data !== null) yield data
      }
    }
    // flush 残余 buffer
    if (buffer.trim()) {
      const data = extractDataLine(buffer)
      if (data !== null) yield data
    }
  } finally {
    reader.releaseLock()
  }
}

function extractDataLine(event: string): string | null {
  const dataLine = event.split('\n').find((line) => line.startsWith('data:'))
  if (!dataLine) return null
  const data = dataLine.slice('data:'.length).trim()
  return data.length > 0 ? data : null
}
