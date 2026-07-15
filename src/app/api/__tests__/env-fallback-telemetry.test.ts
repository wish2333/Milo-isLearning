import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// ---------------------------------------------------------------------------
// Mocks — all external deps are stubbed so we test only telemetry wiring
// ---------------------------------------------------------------------------

vi.mock('@/lib/providers/env-fallback', () => ({
  getEnvLLMConfig: vi.fn(),
}))

vi.mock('@/lib/providers', () => ({
  createProvider: vi.fn(() => ({})),
}))

vi.mock('@/lib/compiler/agents/_runner', () => ({
  runAgent: vi.fn().mockResolvedValue({ data: { gaps: [], score: 1, feedbackText: '' } }),
}))

vi.mock('@/lib/compiler/agents/mappers', () => ({
  mapFeedback: vi.fn((d: unknown) => d),
}))

vi.mock('@/lib/compiler/schemas/feedback', () => ({
  feedbackSchema: {},
}))

vi.mock('@/lib/compiler/schemas/feynman-eval', () => ({
  feynmanEvalSchema: {},
}))

vi.mock('@/lib/runtime/app-mode', () => ({
  APP_MODE: 'showcase' as const,
}))

let _isStorageEnabled = false
vi.mock('@/lib/persistence/server/config', () => ({
  get isStorageEnabled() {
    return _isStorageEnabled
  },
}))

vi.mock('@/lib/persistence/server/db-singleton', () => ({
  getDb: vi.fn(() => ({})),
}))

// insertEvents is the function under test in the "called?" sense
const mockInsertEvents = vi.fn()
vi.mock('@/lib/persistence/server/events-repo', () => ({
  insertEvents: (...args: unknown[]) => mockInsertEvents(...args),
}))

// ---------------------------------------------------------------------------
// Imports AFTER mocks
// ---------------------------------------------------------------------------

import { getEnvLLMConfig } from '@/lib/providers/env-fallback'
import { POST as feedbackPOST } from '@/app/api/feedback/route'
import { POST as feynmanEvalPOST } from '@/app/api/feynman-eval/route'

const mockedGetEnvLLMConfig = vi.mocked(getEnvLLMConfig)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: unknown): NextRequest {
  // NextRequest extends Request; construct via NextRequest constructor for type compat
  return new NextRequest('http://localhost/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const ENV_CONFIG = {
  provider: 'deepseek',
  apiKey: 'test-key',
  model: 'deepseek-chat',
  baseURL: 'https://api.deepseek.com',
} as const

const CLIENT_CONFIG = {
  provider: 'glm',
  apiKey: 'client-key',
  model: 'glm-4',
  baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4',
} as const

const MINIMAL_FEEDBACK_BODY = {
  quiz: {
    id: 'q1',
    interactionType: 'choice' as const,
    question: 'What is X?',
    options: ['A', 'B', 'C'],
    correctAnswer: 'A',
  },
  userAnswer: 'A',
}

const MINIMAL_FEYNMAN_BODY = {
  finalPrompt: 'Explain X',
  rubric: ['Covers Y'],
  userOutput: 'X is ...',
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('env fallback telemetry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    _isStorageEnabled = false
    mockedGetEnvLLMConfig.mockReturnValue(null)
  })

  // -------------------------------------------------------------------------
  // feedback route
  // -------------------------------------------------------------------------
  describe('POST /api/feedback', () => {
    it('inserts env_fallback_used event when env fallback is used and storage enabled', async () => {
      mockedGetEnvLLMConfig.mockReturnValue(ENV_CONFIG)
      _isStorageEnabled = true

      const res = await feedbackPOST(makeRequest(MINIMAL_FEEDBACK_BODY))
      expect(res.status).toBe(200)

      expect(mockInsertEvents).toHaveBeenCalledTimes(1)
      const [, eventsArg] = mockInsertEvents.mock.calls[0]!
      expect(Array.isArray(eventsArg)).toBe(true)
      expect(eventsArg).toHaveLength(1)
      expect(eventsArg[0]).toEqual(
        expect.objectContaining({
          name: 'env_fallback_used',
          app_mode: 'showcase',
          props: expect.objectContaining({
            route: 'feedback',
            provider: 'deepseek',
            model: 'deepseek-chat',
          }),
        }),
      )
    })

    it('does NOT insert event when client BYOK config is provided', async () => {
      _isStorageEnabled = true

      const res = await feedbackPOST(
        makeRequest({ ...MINIMAL_FEEDBACK_BODY, llmConfig: CLIENT_CONFIG }),
      )
      expect(res.status).toBe(200)

      expect(mockInsertEvents).not.toHaveBeenCalled()
    })

    it('does NOT insert event when storage is disabled', async () => {
      mockedGetEnvLLMConfig.mockReturnValue(ENV_CONFIG)
      _isStorageEnabled = false

      const res = await feedbackPOST(makeRequest(MINIMAL_FEEDBACK_BODY))
      expect(res.status).toBe(200)

      expect(mockInsertEvents).not.toHaveBeenCalled()
    })

    it('does NOT insert event when env fallback returns null (returns 400)', async () => {
      mockedGetEnvLLMConfig.mockReturnValue(null)
      _isStorageEnabled = true

      const res = await feedbackPOST(makeRequest(MINIMAL_FEEDBACK_BODY))
      expect(res.status).toBe(400)

      expect(mockInsertEvents).not.toHaveBeenCalled()
    })

    it('still returns 200 when insertEvents throws (non-blocking)', async () => {
      mockedGetEnvLLMConfig.mockReturnValue(ENV_CONFIG)
      _isStorageEnabled = true
      mockInsertEvents.mockImplementation(() => {
        throw new Error('DB write failed')
      })

      const res = await feedbackPOST(makeRequest(MINIMAL_FEEDBACK_BODY))
      expect(res.status).toBe(200)
    })
  })

  // -------------------------------------------------------------------------
  // feynman-eval route
  // -------------------------------------------------------------------------
  describe('POST /api/feynman-eval', () => {
    it('inserts env_fallback_used event when env fallback is used and storage enabled', async () => {
      mockedGetEnvLLMConfig.mockReturnValue(ENV_CONFIG)
      _isStorageEnabled = true

      const res = await feynmanEvalPOST(makeRequest(MINIMAL_FEYNMAN_BODY))
      expect(res.status).toBe(200)

      expect(mockInsertEvents).toHaveBeenCalledTimes(1)
      const eventsArg = mockInsertEvents.mock.calls[0]![1] as unknown[]
      expect(eventsArg).toHaveLength(1)
      expect(eventsArg[0]).toEqual(
        expect.objectContaining({
          name: 'env_fallback_used',
          app_mode: 'showcase',
          props: expect.objectContaining({
            route: 'feynman-eval',
            provider: 'deepseek',
            model: 'deepseek-chat',
          }),
        }),
      )
    })

    it('does NOT insert event when client BYOK config is provided', async () => {
      _isStorageEnabled = true

      const res = await feynmanEvalPOST(
        makeRequest({ ...MINIMAL_FEYNMAN_BODY, llmConfig: CLIENT_CONFIG }),
      )
      expect(res.status).toBe(200)

      expect(mockInsertEvents).not.toHaveBeenCalled()
    })

    it('does NOT insert event when storage is disabled', async () => {
      mockedGetEnvLLMConfig.mockReturnValue(ENV_CONFIG)
      _isStorageEnabled = false

      const res = await feynmanEvalPOST(makeRequest(MINIMAL_FEYNMAN_BODY))
      expect(res.status).toBe(200)

      expect(mockInsertEvents).not.toHaveBeenCalled()
    })

    it('does NOT insert event when env fallback returns null (returns 400)', async () => {
      mockedGetEnvLLMConfig.mockReturnValue(null)
      _isStorageEnabled = true

      const res = await feynmanEvalPOST(makeRequest(MINIMAL_FEYNMAN_BODY))
      expect(res.status).toBe(400)

      expect(mockInsertEvents).not.toHaveBeenCalled()
    })

    it('still returns 200 when insertEvents throws (non-blocking)', async () => {
      mockedGetEnvLLMConfig.mockReturnValue(ENV_CONFIG)
      _isStorageEnabled = true
      mockInsertEvents.mockImplementation(() => {
        throw new Error('DB write failed')
      })

      const res = await feynmanEvalPOST(makeRequest(MINIMAL_FEYNMAN_BODY))
      expect(res.status).toBe(200)
    })
  })
})
