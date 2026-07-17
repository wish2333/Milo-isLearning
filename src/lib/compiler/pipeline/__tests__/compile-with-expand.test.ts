import { describe, it, expect, vi, beforeEach } from 'vitest'

import { backfillKnowledgePagesById } from '../compile-with-expand'
import type { Concept, Module } from '@/types/domain'
import type {
  ConceptAnchor,
  ExpandedKnowledge,
} from '@/lib/compiler/agents/knowledge-expander-types'
import type { CompileConfig, CompileEvent } from '../types'

// =================================================================
// Test fixtures

function expectAt<T>(arr: T[], idx: number): T {
  expect(arr[idx]).toBeDefined()
  return arr[idx]!
}

function makeConcept(overrides: Partial<Concept> = {}): Concept {
  return {
    id: 'concept-1',
    moduleId: 'mod-1',
    name: 'Test Concept',
    definition: 'A test concept',
    type: 'fact',
    keyPoints: ['kp1', 'kp2'],
    quizSeries: { conceptId: 'concept-1', quizzes: [] },
    order: 1,
    ...overrides,
  }
}

function makeModule(concepts: Concept[]): Module {
  return {
    id: 'mod-1',
    sourceId: 'src-1',
    title: 'Test Module',
    intro: 'Test intro',
    goal: 'Test goal',
    concepts,
    feynmanTask: {
      moduleId: 'mod-1',
      steps: [],
      finalPrompt: '',
      rubric: [],
    },
    order: 1,
  }
}

const anchorA: ConceptAnchor = {
  anchorId: 'anchor-1',
  name: 'Anchor A',
  knowledgePage: 'Knowledge page for anchor-1',
}

const anchorB: ConceptAnchor = {
  anchorId: 'anchor-2',
  name: 'Anchor B',
  knowledgePage: 'Knowledge page for anchor-2',
}

// =================================================================
// backfillKnowledgePagesById

describe('backfillKnowledgePagesById', () => {
  it('matches all concepts to anchors and writes knowledgePage', () => {
    const concepts = [
      makeConcept({ id: 'c1', sourceAnchorId: 'anchor-1' }),
      makeConcept({ id: 'c2', sourceAnchorId: 'anchor-2' }),
    ]
    const testModule = makeModule(concepts)
    const result = backfillKnowledgePagesById(testModule, [anchorA, anchorB])

    expect(result.matchedAnchorIds).toEqual(['anchor-1', 'anchor-2'])
    expect(result.unmatchedAnchors).toEqual([])
    expect(expectAt(result.module.concepts, 0).knowledgePage).toBe('Knowledge page for anchor-1')
    expect(expectAt(result.module.concepts, 1).knowledgePage).toBe('Knowledge page for anchor-2')
  })

  it('skips concepts without sourceAnchorId (normal concepts)', () => {
    const concepts = [
      makeConcept({ id: 'c1' }),
      makeConcept({ id: 'c2', sourceAnchorId: 'anchor-1' }),
    ]
    const testModule = makeModule(concepts)
    const result = backfillKnowledgePagesById(testModule, [anchorA])

    expect(result.matchedAnchorIds).toEqual(['anchor-1'])
    expect(expectAt(result.module.concepts, 0).knowledgePage).toBeUndefined()
    expect(expectAt(result.module.concepts, 1).knowledgePage).toBe('Knowledge page for anchor-1')
  })

  it('returns unmatchedAnchors when anchors have no concept match', () => {
    const concepts = [makeConcept({ id: 'c1', sourceAnchorId: 'anchor-1' })]
    const testModule = makeModule(concepts)
    const result = backfillKnowledgePagesById(testModule, [anchorA, anchorB])

    expect(result.matchedAnchorIds).toEqual(['anchor-1'])
    expect(result.unmatchedAnchors).toEqual([anchorB])
    expect(result.unmatchedAnchors.length).toBe(1)
  })

  it('skips concept when sourceAnchorId exists but anchor not found', () => {
    const concepts = [makeConcept({ id: 'c1', sourceAnchorId: 'anchor-99' })]
    const testModule = makeModule(concepts)
    const result = backfillKnowledgePagesById(testModule, [anchorA])

    expect(result.matchedAnchorIds).toEqual([])
    expect(result.unmatchedAnchors).toEqual([anchorA])
    expect(expectAt(result.module.concepts, 0).knowledgePage).toBeUndefined()
  })

  it('does not mutate the input module or concepts', () => {
    const concepts = [makeConcept({ id: 'c1', sourceAnchorId: 'anchor-1' })]
    const originalConcept = expectAt(concepts, 0)
    const testModule = makeModule(concepts)

    const result = backfillKnowledgePagesById(testModule, [anchorA])

    expect(result.module).not.toBe(testModule)
    expect(result.module.concepts).not.toBe(testModule.concepts)
    expect(expectAt(result.module.concepts, 0)).not.toBe(originalConcept)
    expect(originalConcept.knowledgePage).toBeUndefined()
  })

  it('handles empty concepts', () => {
    const testModule = makeModule([])
    const result = backfillKnowledgePagesById(testModule, [anchorA, anchorB])

    expect(result.matchedAnchorIds).toEqual([])
    expect(result.unmatchedAnchors).toEqual([anchorA, anchorB])
  })

  it('handles empty anchors', () => {
    const concepts = [makeConcept({ id: 'c1', sourceAnchorId: 'anchor-1' })]
    const testModule = makeModule(concepts)
    const result = backfillKnowledgePagesById(testModule, [])

    expect(result.matchedAnchorIds).toEqual([])
    expect(result.unmatchedAnchors).toEqual([])
    expect(expectAt(result.module.concepts, 0).knowledgePage).toBeUndefined()
  })
})

// =================================================================
// compileWithExpand (mock-based)

const mockExpandedKnowledge: ExpandedKnowledge = {
  title: 'Expanded Title',
  intro: 'Expanded intro',
  goal: 'Expanded goal',
  normalizedSource: '# Expanded Markdown\n\nThis is expanded content.',
  conceptAnchors: [anchorA, anchorB],
}

const mockModule: Module = makeModule([
  makeConcept({ id: 'c1', sourceAnchorId: 'anchor-1', knowledgePage: undefined }),
  makeConcept({ id: 'c2', sourceAnchorId: 'anchor-2', knowledgePage: undefined }),
])

const mockConfig: CompileConfig = {
  compileModel: 'test-model',
  lightweightModel: 'test-light',
  llm: { provider: 'deepseek', apiKey: 'test-key', model: 'test-model' },
}

async function* mockCompileMarkdown(
  _md: string,
  _config: CompileConfig,
  _options?: unknown,
): AsyncGenerator<CompileEvent, void, unknown> {
  yield { kind: 'complete', module: mockModule }
}

vi.mock('@/lib/compiler/agents/knowledge-expander', () => ({
  runKnowledgeExpander: vi.fn(),
}))

vi.mock('@/lib/compiler/pipeline/pipeline', () => ({
  compileMarkdown: vi.fn(),
}))

import { runKnowledgeExpander } from '@/lib/compiler/agents/knowledge-expander'
import { compileMarkdown } from '@/lib/compiler/pipeline/pipeline'
import { compileWithExpand } from '../compile-with-expand'

const mockRunKnowledgeExpander = vi.mocked(runKnowledgeExpander)
const mockCompileMarkdownFn = vi.mocked(compileMarkdown)

beforeEach(() => {
  vi.clearAllMocks()
  mockRunKnowledgeExpander.mockResolvedValue({
    data: mockExpandedKnowledge,
    usage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
  })
})

async function collectEvents(
  gen: AsyncGenerator<CompileEvent, void, unknown>,
): Promise<CompileEvent[]> {
  const events: CompileEvent[] = []
  for await (const event of gen) {
    events.push(event)
  }
  return events
}

describe('compileWithExpand', () => {
  it('runs full expand then compile on fresh start', async () => {
    mockCompileMarkdownFn.mockImplementation(mockCompileMarkdown)

    const events = await collectEvents(compileWithExpand('test topic', undefined, mockConfig))

    expect(mockRunKnowledgeExpander).toHaveBeenCalledWith('test topic', undefined, {
      ...mockConfig.llm,
      model: mockConfig.compileModel,
    })

    const stageEnter = events.find((e) => e.kind === 'stage_enter' && e.stage === 'expand')
    expect(stageEnter).toBeDefined()

    const progress = events.find((e) => e.kind === 'progress' && e.stage === 'expand')
    expect(progress).toBeDefined()

    const complete = events.find((e) => e.kind === 'complete')
    expect(complete).toBeDefined()
    if (complete && complete.kind === 'complete') {
      expect(expectAt(complete.module.concepts, 0).knowledgePage).toBe(
        'Knowledge page for anchor-1',
      )
      expect(expectAt(complete.module.concepts, 1).knowledgePage).toBe(
        'Knowledge page for anchor-2',
      )
    }
  })

  it('resumes from checkpoint without re-expanding', async () => {
    mockCompileMarkdownFn.mockImplementation(mockCompileMarkdown)

    const checkpointData = new Map<string, { artifact: unknown }>([
      ['expand', { artifact: mockExpandedKnowledge }],
    ])

    const events = await collectEvents(
      compileWithExpand('test topic', undefined, mockConfig, { checkpointData }),
    )

    expect(mockRunKnowledgeExpander).not.toHaveBeenCalled()

    const stageEnter = events.find((e) => e.kind === 'stage_enter' && e.stage === 'expand')
    expect(stageEnter).toBeUndefined()

    const complete = events.find((e) => e.kind === 'complete')
    expect(complete).toBeDefined()
    if (complete && complete.kind === 'complete') {
      expect(expectAt(complete.module.concepts, 0).knowledgePage).toBe(
        'Knowledge page for anchor-1',
      )
    }
  })

  it('calls writeCheckpoint on fresh expand', async () => {
    mockCompileMarkdownFn.mockImplementation(mockCompileMarkdown)

    const writeCheckpoint = vi.fn()
    const events = await collectEvents(
      compileWithExpand('test topic', undefined, mockConfig, { writeCheckpoint }),
    )

    expect(writeCheckpoint).toHaveBeenCalledWith('expand', mockExpandedKnowledge, {
      promptTokens: 100,
      completionTokens: 200,
      totalTokens: 300,
    })

    const complete = events.find((e) => e.kind === 'complete')
    expect(complete).toBeDefined()
  })

  it('passes options through to compileMarkdown', async () => {
    const capturedOptions: unknown[] = []
    mockCompileMarkdownFn.mockImplementation(async function* (
      _md: string,
      _cfg: CompileConfig,
      opts?: unknown,
    ) {
      capturedOptions.push(opts)
      yield { kind: 'complete', module: mockModule }
    })

    const options = { sessionId: 'sess-1' }
    await collectEvents(
      compileWithExpand('topic', 'constraint', mockConfig, {
        ...options,
        checkpointData: new Map([['expand', { artifact: mockExpandedKnowledge }]]),
      }),
    )

    expect(capturedOptions).toHaveLength(1)
    expect(capturedOptions[0]).toEqual(expect.objectContaining({ sessionId: 'sess-1' }))
  })

  it('yields error and returns when expander throws', async () => {
    mockRunKnowledgeExpander.mockRejectedValue(new Error('LLM unavailable'))

    const events = await collectEvents(compileWithExpand('test topic', undefined, mockConfig))

    const error = events.find((e) => e.kind === 'error')
    expect(error).toBeDefined()
    if (error && error.kind === 'error') {
      expect(error.error.stage).toBe('expand')
      expect(error.error.code).toBe('unknown')
      expect(error.error.cause).toBeDefined()
    }

    expect(mockCompileMarkdownFn).not.toHaveBeenCalled()
  })
})
