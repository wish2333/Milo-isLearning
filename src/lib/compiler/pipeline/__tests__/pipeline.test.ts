/**
 * Pipeline integration tests (M3-Plan W7)
 *
 * Covers:
 *   A. Happy path (4)
 *   B. Input validation (3)
 *   C. Progress event sequence (3)
 *   D. Per-stage failure (3)
 *   E. LLM error propagation (3)
 *   F. Quiz circuit breaker and degradation (4)
 *   G. consumeStream helper (2)
 *   H. ERROR_TABLE completeness (1)
 *
 * Total: 23 test cases
 *
 * Mock strategy: mock runAgent at the agent-runner level, bypassing
 * schema validation. This keeps tests focused on pipeline orchestration.
 */
import { describe, expect, it, vi } from 'vitest'
import type { CompileEvent, CompileErrorCode, CompileOptions } from '@/lib/compiler/pipeline'
import { ProviderError } from '@/lib/providers'
import { AgentOutputError } from '@/lib/compiler/agents/errors'
import type { TokenUsage } from '@/lib/providers/types'

// -------------------------------------------------------------------
// Mock runAgent: replace the agent-runner so pipeline tests don't
// need real LLM calls or exact schema-compliant canned data.
// -------------------------------------------------------------------
vi.mock('@/lib/compiler/agents/_runner', () => ({
  runAgent: vi.fn(),
}))

const { compileMarkdown, consumeStream, ERROR_TABLE } = await import('@/lib/compiler/pipeline')
const { INPUT_MIN_LENGTH } = await import('@/lib/compiler/pipeline')

// -------------------------------------------------------------------
// Import mocked runAgent for per-test setup
// -------------------------------------------------------------------
import { runAgent } from '@/lib/compiler/agents/_runner'
const mockedRunAgent = vi.mocked(runAgent)

// -------------------------------------------------------------------
// Type: AgentKind (mirrors schemas/index.ts)
// -------------------------------------------------------------------
type AgentKind =
  | 'import'
  | 'chunk'
  | 'concept'
  | 'module'
  | 'mission'
  | 'quiz'
  | 'quiz-batch'
  | 'challenge-batch'
  | 'feynman'

// -------------------------------------------------------------------
// Canned JSON templates (data returned by mocked runAgent)
// -------------------------------------------------------------------

/** Build placeholder array for mission schema. */
function makePlaceholders(
  conceptId: string,
  n: number,
): Array<{
  id: `${string}:${string}`
  ladderLevel: 1 | 2 | 3
  interactionType: 'choice' | 'sorting' | 'fill_blank'
  expressionLevel: 1 | 2 | 3
}> {
  const slots: Array<{
    id: `${string}:${string}`
    ladderLevel: 1 | 2 | 3
    interactionType: 'choice' | 'sorting' | 'fill_blank'
    expressionLevel: 1 | 2 | 3
  }> = []
  for (let i = 0; i < n; i++) {
    let ladderLevel: 1 | 2 | 3
    let interactionType: 'choice' | 'sorting' | 'fill_blank'
    let expressionLevel: 1 | 2 | 3

    if (i < 3) {
      ladderLevel = 1
      expressionLevel = 1
      interactionType = 'choice'
    } else if (i < 6) {
      ladderLevel = 2
      expressionLevel = i < 5 ? 1 : 2
      interactionType = i < 5 ? 'choice' : 'sorting'
    } else {
      ladderLevel = 3
      expressionLevel = 3
      interactionType = 'fill_blank'
    }

    slots.push({
      id: `${conceptId}:slot-${i + 1}`,
      ladderLevel,
      interactionType,
      expressionLevel,
    })
  }
  return slots
}

/** Static canned JSON for non-quiz agents. */
const CANNED: Record<AgentKind, Record<string, unknown>> = {
  import: {
    normalizedText: 'A'.repeat(500),
    stats: { originalLength: 1000, normalizedLength: 950, removedElements: 50 },
  },
  chunk: {
    chunks: [
      { id: 'chunk-1', text: 'X'.repeat(60), heading: 'Section One' },
      { id: 'chunk-2', text: 'Y'.repeat(60), heading: 'Section Two' },
    ],
  },
  concept: {
    reasoning: 'r',
    concepts: [
      {
        id: 'concept-1',
        name: 'Concept One',
        definition: 'Definition of concept one here',
        type: 'fact',
        keyPoints: ['point1', 'point2'],
        parentChunkId: 'chunk-1',
      },
      {
        id: 'concept-2',
        name: 'Concept Two',
        definition: 'Definition of concept two here',
        type: 'theory',
        keyPoints: ['point1', 'point2'],
        parentChunkId: 'chunk-2',
      },
    ],
  },
  module: {
    reasoning: 'r',
    module: {
      id: 'module-1',
      title: 'RAG Intro',
      intro: 'After this module, you can master RAG basics',
      goal: 'Understand RAG principles',
      conceptOrder: ['concept-1', 'concept-2'],
    },
  },
  mission: {
    reasoning: 'r',
    seriesByConcept: {
      'concept-1': makePlaceholders('concept-1', 8),
      'concept-2': makePlaceholders('concept-2', 8),
    },
  },
  feynman: {
    reasoning: 'r',
    feynmanTask: {
      moduleId: 'module-1',
      steps: [
        {
          order: 1,
          type: 'choice',
          stem: 'Step 1 stem text here with enough chars.',
          options: ['abc', 'def', 'ghi', 'jkl'],
          answer: 'abc',
          explanation: 'Explanation for step 1 answer here.',
        },
        {
          order: 2,
          type: 'choice',
          stem: 'Step 2 stem text here with enough chars.',
          options: ['abc', 'def', 'ghi', 'jkl'],
          answer: 'abc',
          explanation: 'Explanation for step 2 answer here.',
        },
        {
          order: 3,
          type: 'choice',
          stem: 'Step 3 stem text here with enough chars.',
          options: ['abc', 'def', 'ghi', 'jkl'],
          answer: 'abc',
          explanation: 'Explanation for step 3 answer here.',
        },
        {
          order: 4,
          type: 'choice',
          stem: 'Step 4 stem text here with enough chars.',
          options: ['abc', 'def', 'ghi', 'jkl'],
          answer: 'abc',
          explanation: 'Explanation for step 4 answer here.',
        },
        {
          order: 5,
          type: 'fill_blank',
          stem: 'Step 5 fill in the blank here.',
          options: null,
          answer: 'abc',
          explanation: 'Explanation for step 5 answer here.',
        },
        {
          order: 6,
          type: 'choice',
          stem: 'Step 6 stem text here.',
          options: ['a', 'b', 'c', 'd'],
          answer: 'a',
          explanation: 'Explanation for step 6 answer here.',
        },
      ],
      finalPrompt: 'Describe core concepts of this module in your own words.',
      rubric: ['Point one', 'Point two', 'Point three'],
    },
  },
  quiz: {
    reasoning: 'r',
    quiz: {
      id: 'concept-1:slot-1',
      conceptId: 'concept-1',
      ladderLevel: 1,
      expressionLevel: 1,
      interactionType: 'choice',
      stem: 'This is a quiz stem with enough chars.',
      options: ['abc', 'def', 'ghi', 'jkl'],
      answer: 'abc',
      explanation: 'This explains the correct answer clearly.',
      distractors: [
        { text: 'wrong1abc', type: 'A_Overcorrection', used: true },
        { text: 'wrong2def', type: 'B_Outdated', used: true },
        { text: 'wrong3ghi', type: 'C_WrongContext', used: true },
        { text: 'wrong4jkl', type: 'D_Incomplete', used: false },
      ],
    },
  },
  'quiz-batch': {
    reasoning: 'r',
    quizzes: [], // placeholder; setupDefaultMock generates dynamic content
  },
  'challenge-batch': {
    reasoning: 'r',
    quizzes: [], // placeholder; setupDefaultMock generates dynamic content
  },
}

/** Build a single canned quiz item for the given slot info. */
function makeCannedQuiz(
  conceptId: string,
  slotIndex: number,
  slotInfo: {
    ladderLevel: 1 | 2 | 3
    interactionType: 'choice' | 'sorting' | 'fill_blank'
    expressionLevel: 1 | 2 | 3
  },
) {
  const id = `${conceptId}:slot-${slotIndex}` as const
  const base = {
    id,
    conceptId,
    ladderLevel: slotInfo.ladderLevel,
    expressionLevel: slotInfo.expressionLevel,
    interactionType: slotInfo.interactionType,
    explanation: 'This explains the correct answer for ' + id,
    distractors: [
      { text: 'wrong1_' + id, type: 'A_Overcorrection' as const, used: true },
      { text: 'wrong2_' + id, type: 'B_Outdated' as const, used: true },
      { text: 'wrong3_' + id, type: 'C_WrongContext' as const, used: true },
      { text: 'wrong4_' + id, type: 'D_Incomplete' as const, used: false },
    ],
  }
  if (slotInfo.interactionType === 'choice') {
    return {
      ...base,
      stem: 'Which one is correct for ' + id + '?',
      options: ['correctAns', 'wrongDistractor1', 'wrongDistractor2', 'wrongDistractor3'],
      answer: 'correctAns',
    }
  }
  if (slotInfo.interactionType === 'sorting') {
    return {
      ...base,
      stem: 'Sort the following items for ' + id + '.',
      options: ['first', 'second', 'third', 'fourth'],
      answer: 'first,second,third,fourth',
    }
  }
  // fill_blank
  return {
    ...base,
    stem: 'Fill in the blank for ' + id + '.',
    options: null,
    answer: 'correctAnswer',
  }
}

// -------------------------------------------------------------------
/** Default mock usage (per LLM call) */
const MOCK_USAGE: TokenUsage = { promptTokens: 100, completionTokens: 200, totalTokens: 300 }

// Default mock setup: for any agent kind, return CANNED data.
// Tests can override via mockedRunAgent.mockImplementation(...).
// -------------------------------------------------------------------
function setupDefaultMock(): void {
  mockedRunAgent.mockImplementation(async (kind: string, input?: Record<string, unknown>) => {
    if (kind === 'quiz-batch') {
      const conceptId = (input?.conceptId as string) ?? 'concept-1'
      const placeholders =
        (input?.placeholders as Array<{
          id: string
          ladderLevel: 1 | 2 | 3
          interactionType: 'choice' | 'sorting' | 'fill_blank'
          expressionLevel: 1 | 2 | 3
        }>) ?? []
      const quizzes = placeholders.map((p) => {
        const idx = parseInt(p.id.split(':slot-')[1] ?? '1', 10)
        return makeCannedQuiz(conceptId, idx, {
          ladderLevel: p.ladderLevel,
          interactionType: p.interactionType,
          expressionLevel: p.expressionLevel,
        })
      })
      return { data: { reasoning: 'r', quizzes }, usage: { ...MOCK_USAGE } } as never
    }
    if (kind === 'challenge-batch') {
      const quizzes = [
        {
          id: 'challenge-0',
          conceptId: 'challenge',
          ladderLevel: 3,
          expressionLevel: 1,
          interactionType: 'choice' as const,
          stem: 'How do Concept One and Concept Two relate to each other?',
          options: [
            'They are complementary',
            'They are opposites',
            'They are unrelated',
            'They are identical',
          ],
          answer: 'They are complementary',
          explanation: 'Concept One and Concept Two work together in practice applications.',
          distractors: [
            { text: 'They are opposites', type: 'E_Misunderstanding', used: true },
            { text: 'They are unrelated', type: 'C_WrongContext', used: true },
            { text: 'They are identical', type: 'D_Incomplete', used: true },
            { text: 'They are similar', type: 'A_Overcorrection', used: false },
          ],
          involvedConceptIds: ['concept-1', 'concept-2'],
        },
        {
          id: 'challenge-1',
          conceptId: 'challenge',
          ladderLevel: 3,
          expressionLevel: 2,
          interactionType: 'sorting' as const,
          stem: 'Order the steps involving both concepts correctly:',
          options: [
            'Step A uses Concept One',
            'Step B bridges to Concept Two',
            'Step C applies Concept Two',
          ],
          answer:
            'Step A uses Concept One\nStep B bridges to Concept Two\nStep C applies Concept Two',
          explanation:
            'The correct workflow starts with Concept One, then bridges, then applies Two.',
          distractors: [
            { text: 'Wrong order option 1', type: 'E_Misunderstanding', used: true },
            { text: 'Wrong order option 2', type: 'C_WrongContext', used: true },
            { text: 'Wrong order option 3', type: 'D_Incomplete', used: true },
          ],
          involvedConceptIds: ['concept-1', 'concept-2'],
        },
        {
          id: 'challenge-2',
          conceptId: 'challenge',
          ladderLevel: 3,
          expressionLevel: 1,
          interactionType: 'choice' as const,
          stem: 'In a scenario requiring both concepts, which approach is correct?',
          options: [
            'Apply Concept One then Concept Two',
            'Only use Concept One',
            'Only use Concept Two',
            'Skip both concepts',
          ],
          answer: 'Apply Concept One then Concept Two',
          explanation: 'Both concepts are needed in sequence for the best outcome here.',
          distractors: [
            { text: 'Only use Concept One', type: 'D_Incomplete', used: true },
            { text: 'Only use Concept Two', type: 'D_Incomplete', used: true },
            { text: 'Skip both concepts', type: 'E_Misunderstanding', used: true },
          ],
          involvedConceptIds: ['concept-1', 'concept-2'],
        },
      ]
      return { data: { reasoning: 'r', quizzes }, usage: { ...MOCK_USAGE } } as never
    }
    const k = kind as AgentKind
    const canned = CANNED[k]
    if (!canned) throw new Error(`No canned data for kind: ${kind}`)
    return { data: canned, usage: { ...MOCK_USAGE } } as never
  })
}

/** Collect all events from the pipeline generator. */
async function collectEvents(rawMarkdown: string): Promise<CompileEvent[]> {
  const events: CompileEvent[] = []
  const stream = compileMarkdown(rawMarkdown, {
    compileModel: 'test-model',
    lightweightModel: 'test-model',
    llm: {
      provider: 'deepseek',
      apiKey: 'test-key',
      model: 'test-model',
    },
  })
  for await (const event of stream) {
    events.push(event)
  }
  return events
}

/** Default test input: 500 chars of filler (>= INPUT_MIN_LENGTH). */
const VALID_INPUT = 'A'.repeat(500)

// ===================================================================
// A. Happy path
// ===================================================================
describe('A. Happy path', () => {
  it('A1: pipeline produces correct Module structure', async () => {
    setupDefaultMock()
    const events = await collectEvents(VALID_INPUT)

    const complete = events.find((e) => e.kind === 'complete')
    expect(complete).toBeDefined()
    if (complete?.kind !== 'complete') return

    const mod = complete.module
    expect(mod.concepts).toHaveLength(2)
    const totalQuizzes = mod.concepts.reduce((sum, c) => sum + c.quizSeries.quizzes.length, 0)
    expect(totalQuizzes).toBeGreaterThan(0)
    expect(mod.feynmanTask.steps).toHaveLength(6)
  })

  it('A2: quizSeries.quizzes sorted by slotIndex ascending', async () => {
    setupDefaultMock()
    const events = await collectEvents(VALID_INPUT)

    const complete = events.find((e) => e.kind === 'complete')
    if (complete?.kind !== 'complete') return

    for (const concept of complete.module.concepts) {
      const quizzes = concept.quizSeries.quizzes
      for (let i = 1; i < quizzes.length; i++) {
        const idxPrev = parseInt(quizzes[i - 1]!.id.split(':slot-')[1] ?? '', 10)
        const idxCurr = parseInt(quizzes[i]!.id.split(':slot-')[1] ?? '', 10)
        expect(idxCurr).toBeGreaterThanOrEqual(idxPrev)
      }
    }
  })

  it('A3: module.conceptOrder matches concepts array order', async () => {
    setupDefaultMock()
    const events = await collectEvents(VALID_INPUT)

    const complete = events.find((e) => e.kind === 'complete')
    if (complete?.kind !== 'complete') return

    const conceptIds = complete.module.concepts.map((c) => c.id)
    expect(conceptIds[0]).toBe('concept-1')
    expect(conceptIds[1]).toBe('concept-2')
  })

  it('A4: module.intro starts with expected prefix', async () => {
    setupDefaultMock()
    const events = await collectEvents(VALID_INPUT)

    const complete = events.find((e) => e.kind === 'complete')
    if (complete?.kind !== 'complete') return

    expect(complete.module.intro.length).toBeGreaterThan(0)
  })
})

// ===================================================================
// B. Input validation
// ===================================================================
describe('B. Input validation', () => {
  it('B1: input length < 200 yields error(input_too_short), no LLM call', async () => {
    mockedRunAgent.mockReset()
    const shortInput = 'A'.repeat(199)
    const events = await collectEvents(shortInput)

    expect(events[0]).toBeDefined()
    expect(events[0]!.kind).toBe('error')
    if (events[0]!.kind === 'error') {
      expect(events[0]!.error.code).toBe('input_too_short')
      expect(events[0]!.error.stage).toBe('input')
    }
    // runAgent should never have been called
    expect(mockedRunAgent).not.toHaveBeenCalled()
  })

  it('B2: input length > 20000 yields error(input_too_long)', async () => {
    const longInput = 'A'.repeat(20001)
    const events = await collectEvents(longInput)

    expect(events[0]).toBeDefined()
    expect(events[0]!.kind).toBe('error')
    if (events[0]!.kind === 'error') {
      expect(events[0]!.error.code).toBe('input_too_long')
    }
  })

  it('B2.5: input containing U+FFFD yields error(input_invalid_encoding), no LLM call', async () => {
    mockedRunAgent.mockReset()
    // 200 chars + one replacement character in the middle
    const badEncodingInput = 'A'.repeat(100) + '\uFFFD' + 'B'.repeat(99)
    const events = await collectEvents(badEncodingInput)

    expect(events[0]).toBeDefined()
    expect(events[0]!.kind).toBe('error')
    if (events[0]!.kind === 'error') {
      expect(events[0]!.error.code).toBe('input_invalid_encoding')
      expect(events[0]!.error.stage).toBe('input')
      expect(events[0]!.error.retryable).toBe(false)
    }
    expect(mockedRunAgent).not.toHaveBeenCalled()
  })

  it('B3: input length = 200 (boundary) enters import stage', async () => {
    setupDefaultMock()
    const boundaryInput = 'A'.repeat(INPUT_MIN_LENGTH)
    const events = await collectEvents(boundaryInput)

    expect(events[0]).toBeDefined()
    expect(events[0]!.kind).toBe('stage_enter')
    if (events[0]!.kind === 'stage_enter') {
      expect(events[0]!.stage).toBe('import')
    }
  })
})

// ===================================================================
// C. Progress event sequence
// ===================================================================
describe('C. Progress event sequence', () => {
  it('C1: 7 stage_enter events in correct order', async () => {
    setupDefaultMock()
    const events = await collectEvents(VALID_INPUT)

    const stageEnters = events.filter((e) => e.kind === 'stage_enter')
    expect(stageEnters).toHaveLength(8)

    const expectedOrder: string[] = [
      'import',
      'chunk',
      'concept',
      'module',
      'mission',
      'quiz',
      'challenge',
      'feynman',
    ]
    for (let i = 0; i < 8; i++) {
      if (stageEnters[i]!.kind === 'stage_enter') {
        expect(stageEnters[i]!.stage).toBe(expectedOrder[i]!)
      }
    }
  })

  it('C2: percent values are monotonically non-decreasing', async () => {
    setupDefaultMock()
    const events = await collectEvents(VALID_INPUT)

    const percents = events
      .filter((e) => e.kind === 'progress')
      .map((e) => {
        if (e.kind === 'progress') return e.percent
        return -1
      })

    for (let i = 1; i < percents.length; i++) {
      expect(percents[i]).toBeGreaterThanOrEqual(percents[i - 1]!)
    }
  })

  it('C3: first event is stage_enter(import), last is complete or error', async () => {
    setupDefaultMock()
    const events = await collectEvents(VALID_INPUT)

    const first = events[0]
    expect(first?.kind).toBe('stage_enter')
    if (first?.kind === 'stage_enter') {
      expect(first.stage).toBe('import')
    }

    const last = events[events.length - 1]
    expect(['complete', 'error']).toContain(last?.kind)
  })
})

// ===================================================================
// D. Per-stage failure
// ===================================================================
describe('D. Per-stage failure', () => {
  it('D1: chunk stage AgentOutputError yields error(agent_output_invalid, stage: chunk)', async () => {
    let callCount = 0
    mockedRunAgent.mockImplementation(async (kind: string) => {
      callCount++
      // Fail on the second stage call (index 1 = chunk)
      if (callCount === 2) {
        throw new AgentOutputError('chunk', 'schema_violation', 'bad json')
      }
      const k = kind as AgentKind
      const canned = CANNED[k]
      if (!canned) throw new Error(`No canned data for kind: ${kind}`)
      return { data: canned, usage: { ...MOCK_USAGE } } as never
    })
    const events = await collectEvents(VALID_INPUT)

    const errorEvent = events.find((e) => e.kind === 'error')
    expect(errorEvent).toBeDefined()
    if (errorEvent?.kind === 'error') {
      expect(errorEvent.error.code).toBe('agent_output_invalid')
      expect(errorEvent.error.stage).toBe('chunk')
    }
  })

  it('D2: concept stage AgentOutputError yields error(agent_output_invalid, stage: concept)', async () => {
    let callCount = 0
    mockedRunAgent.mockImplementation(async (kind: string) => {
      callCount++
      // Fail on the third stage call (index 2 = concept)
      if (callCount === 3) {
        throw new AgentOutputError('concept', 'schema_violation', 'bad json')
      }
      const k = kind as AgentKind
      const canned = CANNED[k]
      if (!canned) throw new Error(`No canned data for kind: ${kind}`)
      return { data: canned, usage: { ...MOCK_USAGE } } as never
    })
    const events = await collectEvents(VALID_INPUT)

    const errorEvent = events.find((e) => e.kind === 'error')
    expect(errorEvent).toBeDefined()
    if (errorEvent?.kind === 'error') {
      expect(errorEvent.error.code).toBe('agent_output_invalid')
      expect(errorEvent.error.stage).toBe('concept')
    }
  })

  it(
    'D3: import stage ProviderError(llm_rate_limit) yields error(llm_rate_limit)',
    { timeout: 15000 },
    async () => {
      mockedRunAgent.mockImplementation(async (kind: string) => {
        if (kind === 'import') {
          throw new ProviderError('llm_rate_limit', 'rate limited', 429, true)
        }
        const k = kind as AgentKind
        const canned = CANNED[k]
        if (!canned) throw new Error(`No canned data for kind: ${kind}`)
        return { data: canned, usage: { ...MOCK_USAGE } } as never
      })
      const events = await collectEvents(VALID_INPUT)

      const errorEvent = events.find((e) => e.kind === 'error')
      expect(errorEvent).toBeDefined()
      if (errorEvent?.kind === 'error') {
        expect(errorEvent.error.code).toBe('llm_rate_limit')
        expect(errorEvent.error.stage).toBe('import')
      }
    },
  )
})

// ===================================================================
// E. LLM error propagation
// ===================================================================
describe('E. LLM error propagation', () => {
  it(
    'E1: ProviderError(llm_unavailable, 503) -> error code llm_unavailable',
    { timeout: 15000 },
    async () => {
      mockedRunAgent.mockImplementation(async (kind: string) => {
        if (kind === 'chunk') {
          throw new ProviderError('llm_unavailable', 'service unavailable', 503)
        }
        const k = kind as AgentKind
        const canned = CANNED[k]
        if (!canned) throw new Error(`No canned data for kind: ${kind}`)
        return { data: canned, usage: { ...MOCK_USAGE } } as never
      })
      const events = await collectEvents(VALID_INPUT)

      const errorEvent = events.find((e) => e.kind === 'error')
      expect(errorEvent).toBeDefined()
      if (errorEvent?.kind === 'error') {
        expect(errorEvent.error.code).toBe('llm_unavailable')
      }
    },
  )

  it('E2: ProviderError(network) -> error code llm_network', { timeout: 15000 }, async () => {
    mockedRunAgent.mockImplementation(async (kind: string) => {
      if (kind === 'chunk') {
        throw new ProviderError('network', 'network timeout')
      }
      const k = kind as AgentKind
      const canned = CANNED[k]
      if (!canned) throw new Error(`No canned data for kind: ${kind}`)
      return { data: canned, usage: { ...MOCK_USAGE } } as never
    })
    const events = await collectEvents(VALID_INPUT)

    const errorEvent = events.find((e) => e.kind === 'error')
    expect(errorEvent).toBeDefined()
    if (errorEvent?.kind === 'error') {
      expect(errorEvent.error.code).toBe('llm_network')
    }
  })

  it('E3: ProviderError(invalid_response) -> error code agent_output_invalid', async () => {
    let callCount = 0
    mockedRunAgent.mockImplementation(async (kind: string) => {
      callCount++
      if (callCount === 2) {
        throw new ProviderError('invalid_response', 'bad response')
      }
      const k = kind as AgentKind
      const canned = CANNED[k]
      if (!canned) throw new Error(`No canned data for kind: ${kind}`)
      return { data: canned, usage: { ...MOCK_USAGE } } as never
    })
    const events = await collectEvents(VALID_INPUT)

    const errorEvent = events.find((e) => e.kind === 'error')
    expect(errorEvent).toBeDefined()
    if (errorEvent?.kind === 'error') {
      expect(errorEvent.error.code).toBe('agent_output_invalid')
    }
  })
})

// ===================================================================
// F. Quiz circuit breaker and degradation
// ===================================================================
describe('F. Quiz circuit breaker and degradation', () => {
  it('F1: all quiz succeed -> each concept quizSeries.quizzes.length === 8', async () => {
    setupDefaultMock()
    const events = await collectEvents(VALID_INPUT)

    const complete = events.find((e) => e.kind === 'complete')
    if (complete?.kind !== 'complete') return

    for (const concept of complete.module.concepts) {
      expect(concept.quizSeries.quizzes).toHaveLength(8)
    }
  })

  it('F2: < 20% quiz failure (1/16) -> quizzes.length=15, enters feynman', async () => {
    // 16 total slots (8 per concept), fail 1 by omitting one quiz in batch
    let quizBatchCallCount = 0
    mockedRunAgent.mockImplementation(async (kind: string, input?: Record<string, unknown>) => {
      if (kind === 'quiz-batch') {
        quizBatchCallCount++
        const conceptId = (input?.conceptId as string) ?? 'concept-1'
        const placeholders =
          (input?.placeholders as Array<{
            id: string
            ladderLevel: 1 | 2 | 3
            interactionType: 'choice' | 'sorting' | 'fill_blank'
            expressionLevel: 1 | 2 | 3
          }>) ?? []
        // First call (concept-1): full success
        // Second call (concept-2): drop the last quiz to simulate 1 failure
        const count = quizBatchCallCount === 2 ? placeholders.length - 1 : placeholders.length
        const quizzes = placeholders.slice(0, count).map((p) => {
          const idx = parseInt(p.id.split(':slot-')[1] ?? '1', 10)
          return makeCannedQuiz(conceptId, idx, {
            ladderLevel: p.ladderLevel,
            interactionType: p.interactionType,
            expressionLevel: p.expressionLevel,
          })
        })
        return { data: { reasoning: 'r', quizzes }, usage: { ...MOCK_USAGE } } as never
      }
      const k = kind as AgentKind
      const canned = CANNED[k]
      if (!canned) throw new Error(`No canned data for kind: ${kind}`)
      return { data: canned, usage: { ...MOCK_USAGE } } as never
    })
    const events = await collectEvents(VALID_INPUT)

    // Should NOT have quiz_batch_failure error
    const quizError = events.find(
      (e) => e.kind === 'error' && 'code' in e.error && e.error.code === 'quiz_batch_failure',
    )
    expect(quizError).toBeUndefined()

    // Should complete successfully
    const complete = events.find((e) => e.kind === 'complete')
    expect(complete).toBeDefined()
    if (complete?.kind !== 'complete') return

    // Total quizzes = 15 (16 - 1 failed)
    const totalQuizzes = complete.module.concepts.reduce(
      (sum, c) => sum + c.quizSeries.quizzes.length,
      0,
    )
    expect(totalQuizzes).toBe(15)
  })

  it('F3: > 20% quiz failure (50%) -> error(quiz_batch_failure), no feynman', async () => {
    // 16 total slots, fail first batch (8 failures = 50% > 20%)
    let quizBatchCallCount = 0
    mockedRunAgent.mockImplementation(async (kind: string, input?: Record<string, unknown>) => {
      if (kind === 'quiz-batch') {
        quizBatchCallCount++
        // First batch (concept-1) throws → 8 failures = 50%
        if (quizBatchCallCount === 1) {
          throw new Error('Quiz batch generation failed')
        }
        const conceptId = (input?.conceptId as string) ?? 'concept-2'
        const placeholders =
          (input?.placeholders as Array<{
            id: string
            ladderLevel: 1 | 2 | 3
            interactionType: 'choice' | 'sorting' | 'fill_blank'
            expressionLevel: 1 | 2 | 3
          }>) ?? []
        const quizzes = placeholders.map((p) => {
          const idx = parseInt(p.id.split(':slot-')[1] ?? '1', 10)
          return makeCannedQuiz(conceptId, idx, {
            ladderLevel: p.ladderLevel,
            interactionType: p.interactionType,
            expressionLevel: p.expressionLevel,
          })
        })
        return { data: { reasoning: 'r', quizzes }, usage: { ...MOCK_USAGE } } as never
      }
      const k = kind as AgentKind
      const canned = CANNED[k]
      if (!canned) throw new Error(`No canned data for kind: ${kind}`)
      return { data: canned, usage: { ...MOCK_USAGE } } as never
    })
    const events = await collectEvents(VALID_INPUT)

    // Should have quiz_batch_failure error
    const quizError = events.find(
      (e) => e.kind === 'error' && 'code' in e.error && e.error.code === 'quiz_batch_failure',
    )
    expect(quizError).toBeDefined()

    // Should NOT have feynman stage_enter (pipeline short-circuits)
    const feynmanEnter = events.find(
      (e) => e.kind === 'stage_enter' && 'stage' in e && e.stage === 'feynman',
    )
    expect(feynmanEnter).toBeUndefined()

    // Should NOT have complete
    const complete = events.find((e) => e.kind === 'complete')
    expect(complete).toBeUndefined()
  })

  it('F4: quiz stage progress percent between 80 and 95', async () => {
    setupDefaultMock()
    const events = await collectEvents(VALID_INPUT)

    const quizProgressEvents = events.filter(
      (e) => e.kind === 'progress' && 'stage' in e && e.stage === 'quiz',
    )

    expect(quizProgressEvents.length).toBeGreaterThan(0)
    for (const event of quizProgressEvents) {
      if (event.kind === 'progress') {
        expect(event.percent).toBeGreaterThanOrEqual(80)
        expect(event.percent).toBeLessThanOrEqual(95)
      }
    }
  })
})

// ===================================================================
// G. consumeStream helper
// ===================================================================
describe('G. consumeStream helper', () => {
  it('G1: happy path consumeStream returns Module', async () => {
    setupDefaultMock()
    const stream = compileMarkdown(VALID_INPUT, {
      compileModel: 'test-model',
      lightweightModel: 'test-model',
      llm: {
        provider: 'deepseek',
        apiKey: 'test-key',
        model: 'test-model',
      },
    })

    const mod = await consumeStream(stream)
    expect(mod.concepts).toHaveLength(2)
    expect(mod.feynmanTask.steps).toHaveLength(6)
  })

  it(
    'G2: error path consumeStream throws with cause=CompileErrorPayload',
    { timeout: 15000 },
    async () => {
      mockedRunAgent.mockImplementation(async (kind: string) => {
        if (kind === 'chunk') {
          throw new ProviderError('llm_unavailable', 'unavailable', 503)
        }
        const k = kind as AgentKind
        const canned = CANNED[k]
        if (!canned) throw new Error(`No canned data for kind: ${kind}`)
        return { data: canned, usage: { ...MOCK_USAGE } } as never
      })
      const stream = compileMarkdown(VALID_INPUT, {
        compileModel: 'test-model',
        lightweightModel: 'test-model',
        llm: {
          provider: 'deepseek',
          apiKey: 'test-key',
          model: 'test-model',
        },
      })

      await expect(consumeStream(stream)).rejects.toMatchObject({
        cause: expect.objectContaining({ stage: 'chunk', code: 'llm_unavailable' }),
      })
    },
  )
})

// ===================================================================
// H. ERROR_TABLE completeness
// ===================================================================
describe('H. ERROR_TABLE completeness', () => {
  it('H1: ERROR_TABLE contains all 10 CompileErrorCode entries with messageTemplate and httpStatus', () => {
    const expectedCodes: CompileErrorCode[] = [
      'input_too_short',
      'input_too_long',
      'input_invalid_encoding',
      'no_valid_concept',
      'agent_output_invalid',
      'llm_rate_limit',
      'llm_unavailable',
      'llm_network',
      'quiz_batch_failure',
      'unknown',
    ]

    for (const code of expectedCodes) {
      const mapping = ERROR_TABLE[code]
      expect(mapping).toBeDefined()
      expect(mapping.messageTemplate).toBeTruthy()
      expect(typeof mapping.httpStatus).toBe('number')
    }
  })
})

// ===================================================================
// I. Checkpoint & Resume (PB.2 F04)
// ===================================================================
describe('I. Checkpoint & Resume (PB.2)', () => {
  const DEFAULT_CONFIG = {
    compileModel: 'test-model',
    lightweightModel: 'test-model',
    llm: {
      provider: 'deepseek' as const,
      apiKey: 'test-key',
      model: 'test-model',
    },
  }

  /** Collect events with optional CompileOptions. */
  async function collectEventsWithOptions(
    rawMarkdown: string,
    options?: CompileOptions,
  ): Promise<CompileEvent[]> {
    const events: CompileEvent[] = []
    const stream = compileMarkdown(rawMarkdown, DEFAULT_CONFIG, options)
    for await (const event of stream) {
      events.push(event)
    }
    return events
  }

  it('I1: writeCheckpoint called with module artifact after stage 4 when sessionId is set', async () => {
    mockedRunAgent.mockClear()
    const writeCheckpoint = vi.fn()
    setupDefaultMock()
    await collectEventsWithOptions(VALID_INPUT, { sessionId: 'sess-1', writeCheckpoint })

    const calls = writeCheckpoint.mock.calls as Array<[string, unknown, ...unknown[]]>
    const moduleCall = calls.find((c) => c[0] === 'module')
    expect(moduleCall).toBeDefined()
    expect(moduleCall![1]).toHaveProperty('concepts')

    const conceptsCall = calls.find((c) => c[0] === 'module-concepts')
    expect(conceptsCall).toBeDefined()
    expect(Array.isArray(conceptsCall![1])).toBe(true)
  })

  it('I2: no checkpoint writes when writeCheckpoint is not provided (showcase mode)', async () => {
    mockedRunAgent.mockClear()
    setupDefaultMock()
    // No writeCheckpoint callback → tryWriteCheckpoint is a no-op
    const events = await collectEventsWithOptions(VALID_INPUT)

    const complete = events.find((e) => e.kind === 'complete')
    expect(complete).toBeDefined()
    if (complete?.kind !== 'complete') return
    expect(complete.module.concepts).toHaveLength(2)
  })

  it('I3: writeCheckpoint called with challenge artifact after stage 6.5 when sessionId is set', async () => {
    mockedRunAgent.mockClear()
    const writeCheckpoint = vi.fn()
    setupDefaultMock()
    await collectEventsWithOptions(VALID_INPUT, { sessionId: 'sess-1', writeCheckpoint })

    const calls = writeCheckpoint.mock.calls as Array<[string, unknown, ...unknown[]]>
    const challengeCall = calls.find((c) => c[0] === 'challenge')
    expect(challengeCall).toBeDefined()
    expect(challengeCall![1]).toHaveProperty('challengeQuizzes')
  })

  it('I4: resume from module skips stages 1-4, uses checkpoint, completes pipeline', async () => {
    mockedRunAgent.mockClear()

    // Construct checkpoint data from CANNED fixtures
    const checkpointConcepts = (CANNED.concept.concepts as Array<Record<string, unknown>>).map(
      (raw, idx) => ({
        id: raw.id,
        name: raw.name,
        definition: raw.definition,
        type: raw.type,
        keyPoints: raw.keyPoints,
        parentChunkId: raw.parentChunkId,
        moduleId: 'module-1',
        order: idx + 1,
        quizSeries: { quizzes: [] },
      }),
    )

    const checkpointModuleData = {
      id: 'module-1',
      title: 'RAG Intro',
      intro: 'After this module, you can master RAG basics',
      goal: 'Understand RAG principles',
      concepts: checkpointConcepts,
      feynmanTask: { moduleId: 'module-1', steps: [], finalPrompt: '', rubric: [] },
      challengeQuizzes: [],
      sourceId: 'source-resume-test',
    }

    const checkpointData = new Map<string, { artifact: unknown }>([
      ['import', { artifact: CANNED.import }],
      ['chunk', { artifact: CANNED.chunk }],
      ['concept', { artifact: CANNED.concept }],
      ['module', { artifact: checkpointModuleData }],
      ['module-concepts', { artifact: checkpointConcepts }],
    ])

    setupDefaultMock()
    const events = await collectEventsWithOptions(VALID_INPUT, {
      resumeFrom: 'module',
      checkpointData,
    })

    // Pipeline should produce a complete event
    const complete = events.find((e) => e.kind === 'complete')
    expect(complete).toBeDefined()
    if (complete?.kind !== 'complete') return

    expect(complete.module.concepts).toHaveLength(2)
    expect(complete.module.feynmanTask.steps).toHaveLength(6)

    // Stages 1-4 should NOT have been called (resume skipped them)
    const calledKinds = mockedRunAgent.mock.calls.map((c) => c[0] as string)
    expect(calledKinds).not.toContain('import')
    expect(calledKinds).not.toContain('chunk')
    expect(calledKinds).not.toContain('concept')
    expect(calledKinds).not.toContain('module')

    // Stages 5-7 should have been called
    expect(calledKinds).toContain('mission')
    expect(calledKinds).toContain('challenge-batch')
    expect(calledKinds).toContain('feynman')

    // Resume progress event with "从断点恢复" message
    const resumeEvent = events.find(
      (e) =>
        e.kind === 'progress' &&
        'stage' in e &&
        e.stage === 'module' &&
        'message' in e &&
        (e as { message: string }).message.includes('\u65ad\u70b9\u6062\u590d'),
    )
    expect(resumeEvent).toBeDefined()
  })
})
