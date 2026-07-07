import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { OpenAICompatProvider } from '../openai-compat'
import { ProviderError, type LLMConfig } from '../types'

// =================================================================
// 测试夹具
// =================================================================

const validConfig: LLMConfig = {
  provider: 'deepseek',
  apiKey: 'test-key-xxx',
  baseURL: 'https://api.test.example/v1',
  model: 'deepseek-v4-flash',
  temperature: 0.7,
}

/** 构造 OpenAI 兼容的 200 响应体 */
function openAIResponse(content: string): unknown {
  return {
    id: 'chatcmpl-test',
    object: 'chat.completion',
    choices: [
      {
        index: 0,
        message: { role: 'assistant', content },
        finish_reason: 'stop',
      },
    ],
    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
  }
}

/** 构造最小 Response mock */
function mockResponse(status: number, body: unknown): Response {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(),
    json: async () => JSON.parse(bodyStr),
    text: async () => bodyStr,
    body: null,
  } as Response
}

/** 跑过 provider 内部所有 setTimeout 退避（fake timers 模式下） */
async function flushTimers(): Promise<void> {
  // 足够覆盖 4s 退避（429 第二次重试）
  await vi.advanceTimersByTimeAsync(10_000)
}

// =================================================================
// 测试用例
// =================================================================

describe('OpenAICompatProvider', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  // ----------------------------------------------------------------
  // 构造校验
  // ----------------------------------------------------------------

  describe('constructor', () => {
    it('throws when apiKey missing', () => {
      expect(
        () =>
          new OpenAICompatProvider({
            ...validConfig,
            apiKey: '',
          }),
      ).toThrow(/apiKey/)
    })

    it('throws when baseURL missing', () => {
      expect(
        () =>
          new OpenAICompatProvider({
            ...validConfig,
            baseURL: undefined,
          }),
      ).toThrow(/baseURL/)
    })

    it('throws when model missing', () => {
      expect(
        () =>
          new OpenAICompatProvider({
            ...validConfig,
            model: '',
          }),
      ).toThrow(/model/)
    })
  })

  // ----------------------------------------------------------------
  // chat() 成功路径
  // ----------------------------------------------------------------

  describe('chat — success path', () => {
    it('parses a 200 response into ChatResponse', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, openAIResponse('hello world')))

      vi.stubGlobal('fetch', fetchMock)

      const provider = new OpenAICompatProvider(validConfig)
      const result = await provider.chat({
        messages: [{ role: 'user', content: 'hi' }],
      })

      expect(result.content).toBe('hello world')
      expect(result.finishReason).toBe('stop')
      expect(result.usage.promptTokens).toBe(10)
      expect(result.usage.completionTokens).toBe(5)

      // 验证请求体
      const call = fetchMock.mock.calls[0]
      expect(call?.[1]?.method).toBe('POST')
      const init = call?.[1] as RequestInit
      const body = JSON.parse(init.body as string) as Record<string, unknown>
      expect(body['model']).toBe('deepseek-v4-flash')
      expect(body['temperature']).toBe(0.7)
      expect(init.headers).toMatchObject({
        'Content-Type': 'application/json',
        Authorization: 'Bearer test-key-xxx',
      })
    })

    it('attaches response_format when jsonSchema provided', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, openAIResponse('{}')))

      vi.stubGlobal('fetch', fetchMock)

      const provider = new OpenAICompatProvider(validConfig)
      await provider.chat({
        messages: [{ role: 'user', content: 'x' }],
        jsonSchema: { type: 'object' },
      })

      const init = fetchMock.mock.calls[0]?.[1] as RequestInit
      const body = JSON.parse(init.body as string) as Record<string, unknown>
      expect(body['response_format']).toEqual({ type: 'json_object' })
    })

    it('respects per-request temperature override', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, openAIResponse('ok')))

      vi.stubGlobal('fetch', fetchMock)

      const provider = new OpenAICompatProvider(validConfig)
      await provider.chat({
        messages: [{ role: 'user', content: 'x' }],
        temperature: 0.2,
      })

      const init = fetchMock.mock.calls[0]?.[1] as RequestInit
      const body = JSON.parse(init.body as string) as Record<string, unknown>
      expect(body['temperature']).toBe(0.2)
    })

    // M2.5 W3：extraBody 透传（GLM enable_thinking 等）
    it('merges extraBody into request body', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, openAIResponse('{}')))

      vi.stubGlobal('fetch', fetchMock)

      const provider = new OpenAICompatProvider(validConfig)
      await provider.chat({
        messages: [{ role: 'user', content: 'x' }],
        extraBody: { enable_thinking: false },
      })

      const init = fetchMock.mock.calls[0]?.[1] as RequestInit
      const body = JSON.parse(init.body as string) as Record<string, unknown>
      expect(body['enable_thinking']).toBe(false)
    })

    it('extraBody does NOT overwrite reserved fields (model/messages/...)', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(200, openAIResponse('{}')))

      vi.stubGlobal('fetch', fetchMock)

      const provider = new OpenAICompatProvider(validConfig)
      // 攻击性输入：试图覆盖 model
      await provider.chat({
        messages: [{ role: 'user', content: 'x' }],
        extraBody: { model: 'attacker-model', enable_thinking: true },
      })

      const init = fetchMock.mock.calls[0]?.[1] as RequestInit
      const body = JSON.parse(init.body as string) as Record<string, unknown>
      // model 来自 LLMConfig，未被 extraBody 覆盖
      expect(body['model']).toBe('deepseek-v4-flash')
      // 私有字段正常透传
      expect(body['enable_thinking']).toBe(true)
    })
  })

  // ----------------------------------------------------------------
  // chat() 重试策略 — 429
  // ----------------------------------------------------------------

  describe('chat — 429 retry', () => {
    it('retries up to 2 times on 429, then succeeds', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(429, { error: 'rate limit' }))
        .mockResolvedValueOnce(mockResponse(429, { error: 'rate limit' }))
        .mockResolvedValueOnce(mockResponse(200, openAIResponse('finally')))

      vi.stubGlobal('fetch', fetchMock)

      const provider = new OpenAICompatProvider(validConfig)
      const promise = provider.chat({ messages: [{ role: 'user', content: 'x' }] })
      await flushTimers()
      const result = await promise

      expect(result.content).toBe('finally')
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })

    it('throws llm_rate_limit after exhausting 429 retries', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValue(mockResponse(429, { error: 'rate limit' }))

      vi.stubGlobal('fetch', fetchMock)

      const provider = new OpenAICompatProvider(validConfig)
      const promise = provider.chat({ messages: [{ role: 'user', content: 'x' }] })
      // 先挂接断言（避免 promise 在 flushTimers 期间 reject 时触发 unhandled rejection）
      const assertion = expect(promise).rejects.toMatchObject({
        kind: 'llm_rate_limit',
        httpStatus: 429,
      })
      await flushTimers()
      await assertion
      // 初始 + 2 次重试 = 3 次
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })
  })

  // ----------------------------------------------------------------
  // chat() 重试策略 — 5xx
  // ----------------------------------------------------------------

  describe('chat — 5xx retry', () => {
    it('retries on 500, then succeeds', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(500, 'internal error'))
        .mockResolvedValueOnce(mockResponse(200, openAIResponse('recovered')))

      vi.stubGlobal('fetch', fetchMock)

      const provider = new OpenAICompatProvider(validConfig)
      const promise = provider.chat({ messages: [{ role: 'user', content: 'x' }] })
      await flushTimers()
      const result = await promise

      expect(result.content).toBe('recovered')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('throws llm_unavailable after exhausting 5xx retries', async () => {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(mockResponse(503, 'unavailable'))

      vi.stubGlobal('fetch', fetchMock)

      const provider = new OpenAICompatProvider(validConfig)
      const promise = provider.chat({ messages: [{ role: 'user', content: 'x' }] })
      // 先挂接断言（避免 promise 在 flushTimers 期间 reject 时触发 unhandled rejection）
      const assertion = expect(promise).rejects.toMatchObject({
        kind: 'llm_unavailable',
        httpStatus: 503,
      })
      await flushTimers()
      await assertion
      expect(fetchMock).toHaveBeenCalledTimes(3)
    })
  })

  // ----------------------------------------------------------------
  // chat() 4xx 不重试
  // ----------------------------------------------------------------

  describe('chat — 4xx no retry', () => {
    it('throws llm_client_error immediately on 400', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(mockResponse(400, { error: 'bad request' }))

      vi.stubGlobal('fetch', fetchMock)

      const provider = new OpenAICompatProvider(validConfig)
      await expect(
        provider.chat({ messages: [{ role: 'user', content: 'x' }] }),
      ).rejects.toMatchObject({
        kind: 'llm_client_error',
        httpStatus: 400,
      })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('throws on 401 unauthorized', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>().mockResolvedValueOnce(mockResponse(401, 'unauthorized')),
      )

      const provider = new OpenAICompatProvider(validConfig)
      await expect(
        provider.chat({ messages: [{ role: 'user', content: 'x' }] }),
      ).rejects.toMatchObject({ kind: 'llm_client_error', httpStatus: 401 })
    })
  })

  // ----------------------------------------------------------------
  // chat() 网络错误
  // ----------------------------------------------------------------

  describe('chat — network error', () => {
    it('retries once on TypeError, then throws', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new TypeError('fetch failed'))
        .mockRejectedValueOnce(new TypeError('fetch failed'))

      vi.stubGlobal('fetch', fetchMock)

      const provider = new OpenAICompatProvider(validConfig)
      const promise = provider.chat({ messages: [{ role: 'user', content: 'x' }] })
      // 先挂接断言（避免 promise 在 flushTimers 期间 reject 时触发 unhandled rejection）
      const assertion = expect(promise).rejects.toMatchObject({
        kind: 'network',
        retryable: true,
      })
      await flushTimers()
      await assertion
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('retries on TypeError, then succeeds', async () => {
      const fetchMock = vi
        .fn<typeof fetch>()
        .mockRejectedValueOnce(new TypeError('ECONNRESET'))
        .mockResolvedValueOnce(mockResponse(200, openAIResponse('ok')))

      vi.stubGlobal('fetch', fetchMock)

      const provider = new OpenAICompatProvider(validConfig)
      const promise = provider.chat({ messages: [{ role: 'user', content: 'x' }] })
      await flushTimers()
      const result = await promise

      expect(result.content).toBe('ok')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  // ----------------------------------------------------------------
  // chat() 响应解析错误
  // ----------------------------------------------------------------

  describe('chat — invalid response', () => {
    it('throws when response has no choices', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>().mockResolvedValueOnce(mockResponse(200, { foo: 'bar' })),
      )

      const provider = new OpenAICompatProvider(validConfig)
      await expect(
        provider.chat({ messages: [{ role: 'user', content: 'x' }] }),
      ).rejects.toMatchObject({ kind: 'invalid_response' })
    })

    it('throws when choices[0].message.content is not string', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>().mockResolvedValueOnce(
          mockResponse(200, {
            choices: [{ message: { content: 123 }, finish_reason: 'stop' }],
          }),
        ),
      )

      const provider = new OpenAICompatProvider(validConfig)
      await expect(
        provider.chat({ messages: [{ role: 'user', content: 'x' }] }),
      ).rejects.toMatchObject({ kind: 'invalid_response' })
    })

    it('maps finish_reason "length" correctly', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>().mockResolvedValueOnce(
          mockResponse(200, {
            choices: [
              {
                message: { content: 'truncated' },
                finish_reason: 'length',
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1 },
          }),
        ),
      )

      const provider = new OpenAICompatProvider(validConfig)
      const result = await provider.chat({
        messages: [{ role: 'user', content: 'x' }],
      })
      expect(result.finishReason).toBe('length')
    })
  })

  // ----------------------------------------------------------------
  // ping()
  // ----------------------------------------------------------------

  describe('ping', () => {
    it('returns ok:true with latency on successful call', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>().mockResolvedValueOnce(mockResponse(200, openAIResponse('pong'))),
      )

      const provider = new OpenAICompatProvider(validConfig)
      const result = await provider.ping()

      expect(result.ok).toBe(true)
      expect(result.latencyMs).toBeGreaterThanOrEqual(0)
      expect(result.message).toContain('deepseek')
      expect(result.message).toContain('deepseek-v4-flash')
    })

    it('returns ok:false without throwing on 500', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn<typeof fetch>().mockResolvedValue(mockResponse(500, 'server error')),
      )

      const provider = new OpenAICompatProvider(validConfig)
      const result = await provider.ping()

      expect(result.ok).toBe(false)
      expect(result.message).toMatch(/500|unavailable/i)
    })

    it('returns ok:false on network error', async () => {
      vi.stubGlobal('fetch', vi.fn<typeof fetch>().mockRejectedValue(new TypeError('dns failed')))

      const provider = new OpenAICompatProvider(validConfig)
      const result = await provider.ping()

      expect(result.ok).toBe(false)
      expect(result.message).toContain('dns failed')
    })

    it('does NOT retry (single call only)', async () => {
      const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(mockResponse(429, 'rate limit'))

      vi.stubGlobal('fetch', fetchMock)

      const provider = new OpenAICompatProvider(validConfig)
      const result = await provider.ping()

      expect(result.ok).toBe(false)
      // ping 即使遇到 429 也不重试
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })
  })

  // ----------------------------------------------------------------
  // ProviderError 类型守卫
  // ----------------------------------------------------------------

  describe('ProviderError', () => {
    it('is instanceof Error and carries kind/httpStatus', () => {
      const err = new ProviderError('llm_rate_limit', 'test', 429, false)
      expect(err).toBeInstanceOf(Error)
      expect(err.kind).toBe('llm_rate_limit')
      expect(err.httpStatus).toBe(429)
      expect(err.retryable).toBe(false)
      expect(err.name).toBe('ProviderError')
    })
  })
})
