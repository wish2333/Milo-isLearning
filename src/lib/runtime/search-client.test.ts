import { describe, expect, it } from 'vitest'

import type { Concept, Module, Quiz } from '@/types/domain'

import { ClientSearchIndex, type SearchEntryType, type SearchHit } from './search-client'

function makeQuiz(id: string, conceptId: string, overrides: Partial<Quiz> = {}): Quiz {
  return {
    id,
    conceptId,
    ladderLevel: 1,
    expressionLevel: 1,
    interactionType: 'choice',
    stem: `题目 ${id}`,
    options: ['A', 'B', 'C', 'D'],
    answer: 'A',
    explanation: `解析 ${id}`,
    distractors: ['B', 'C', 'D'],
    ...overrides,
  }
}

function makeConcept(
  moduleId: string,
  id: string,
  quiz: Quiz,
  overrides: Partial<Concept> = {},
): Concept {
  return {
    id,
    moduleId,
    name: `概念 ${id}`,
    definition: `定义 ${id}`,
    type: 'fact',
    keyPoints: [`要点 ${id}`],
    quizSeries: { conceptId: id, quizzes: [quiz] },
    order: 1,
    ...overrides,
  }
}

function makeModule(id: string, overrides: Partial<Module> = {}): Module {
  const conceptId = `${id}-concept`
  const quiz = makeQuiz(`${id}-quiz`, conceptId)
  return {
    id,
    sourceId: `${id}-source`,
    title: `模块 ${id}`,
    intro: `介绍 ${id}`,
    goal: `目标 ${id}`,
    concepts: [makeConcept(id, conceptId, quiz)],
    feynmanTask: {
      moduleId: id,
      steps: [],
      finalPrompt: '',
      rubric: [],
    },
    order: 1,
    ...overrides,
  }
}

function findHit(hits: SearchHit[], type: SearchEntryType): SearchHit {
  const hit = hits.find((item) => item.type === type)
  expect(hit).toBeDefined()
  return hit as SearchHit
}

describe('ClientSearchIndex', () => {
  it('returns no results for an empty index or blank query', () => {
    const index = new ClientSearchIndex()

    expect(index.search('任何内容')).toEqual([])

    index.rebuild([])

    expect(index.search('   ')).toEqual([])
    expect(index.search('任何内容')).toEqual([])
  })

  it('indexes module title, concept fields, knowledgePage, and quiz fields', () => {
    const moduleData = makeModule('module-1', {
      title: '学习编译器',
      concepts: [
        makeConcept(
          'module-1',
          'concept-1',
          makeQuiz('quiz-1', 'concept-1', {
            stem: '如何理解检索增强',
            explanation: '检索增强可以补充上下文',
          }),
          {
            name: '客户端索引',
            definition: '把知识整理成可以检索的结构',
            keyPoints: ['支持中文子串匹配'],
            knowledgePage: '知识页完整说明，包含检索增强内容',
          },
        ),
      ],
    })
    const index = new ClientSearchIndex()

    index.rebuild([moduleData])

    expect(findHit(index.search('编译器'), 'module').moduleId).toBe('module-1')
    expect(findHit(index.search('客户端索引'), 'concept')).toMatchObject({
      conceptId: 'concept-1',
      moduleId: 'module-1',
    })
    expect(findHit(index.search('中文子串'), 'concept').conceptId).toBe('concept-1')
    expect(findHit(index.search('知识页完整说明'), 'concept').conceptId).toBe('concept-1')
    expect(findHit(index.search('检索增强'), 'quiz').quizId).toBe('quiz-1')
    expect(findHit(index.search('补充上下文'), 'quiz').quizId).toBe('quiz-1')
  })

  it('matches Chinese substrings and treats whitespace/case as normalized', () => {
    const moduleData = makeModule('module-1', { title: 'Machine   Learning' })
    const index = new ClientSearchIndex()

    index.rebuild([moduleData])

    expect(index.search('机器学')).toEqual([])
    expect(index.search('  maCHine    learNING  ')).toHaveLength(1)
    expect(index.search('chine learn')).toHaveLength(1)
  })

  it('requires every whitespace-separated query term to match', () => {
    const moduleData = makeModule('module-1', {
      title: '中文搜索',
      intro: '只包含第一个词',
    })
    const index = new ClientSearchIndex()
    index.rebuild([moduleData])

    expect(index.search('中文 不存在')).toEqual([])
  })

  it('returns plain-text snippets without HTML markup', () => {
    const moduleData = makeModule('module-1', {
      concepts: [
        makeConcept('module-1', 'concept-1', makeQuiz('quiz-1', 'concept-1'), {
          knowledgePage:
            '<p>这是 <strong>重要知识</strong>，不能执行 <script>alert(1)</script>。</p>',
        }),
      ],
    })
    const index = new ClientSearchIndex()
    index.rebuild([moduleData])

    const hit = findHit(index.search('重要知识'), 'concept')

    expect(hit.snippet).toContain('重要知识')
    expect(hit.snippet).not.toContain('<')
    expect(hit.snippet).not.toContain('>')
    expect(hit.snippet).not.toContain('script')
  })

  it('ranks title matches before content-only matches and preserves stable ties', () => {
    const titleMatch = makeModule('module-2', {
      title: '目标主题',
      intro: '其他内容',
    })
    const contentMatch = makeModule('module-1', {
      title: '普通模块',
      intro: '目标主题',
    })
    const index = new ClientSearchIndex()
    index.rebuild([titleMatch, contentMatch])

    const hits = index.search('目标主题').filter((hit) => hit.type === 'module')

    expect(hits.map((hit) => hit.moduleId)).toEqual(['module-2', 'module-1'])
  })

  it('deduplicates repeated module, concept, and quiz ids during rebuild', () => {
    const quiz = makeQuiz('quiz-1', 'concept-1', { stem: '重复内容' })
    const concept = makeConcept('module-1', 'concept-1', quiz, {
      name: '重复概念',
    })
    const moduleData = makeModule('module-1', {
      title: '重复模块',
      concepts: [concept, concept],
      challengeQuizzes: [quiz],
    })
    const index = new ClientSearchIndex()
    index.rebuild([moduleData, moduleData])

    const hits = index.search('重复')

    expect(hits).toHaveLength(3)
    expect(hits.map((hit) => hit.type)).toEqual(['module', 'concept', 'quiz'])
  })

  it('keeps scale results stable for a repeated 100-module snapshot', () => {
    const modules = Array.from({ length: 100 }, (_, index) =>
      makeModule(`module-${index + 1}`, {
        intro: `规模测试内容 ${index + 1}`,
      }),
    )
    const index = new ClientSearchIndex()

    index.rebuild([...modules, modules[0]!, modules[25]!, modules[99]!])
    const firstSearch = index.search('规模测试')

    index.rebuild([...modules, modules[0]!, modules[25]!, modules[99]!])
    const secondSearch = index.search('规模测试')

    expect(firstSearch).toHaveLength(100)
    expect(firstSearch.map((hit) => hit.moduleId)).toEqual(secondSearch.map((hit) => hit.moduleId))
    expect(new Set(firstSearch.map((hit) => hit.moduleId)).size).toBe(100)
  })

  it('supports type and module filters for later SearchDialog integration', () => {
    const index = new ClientSearchIndex()
    index.rebuild([makeModule('module-1'), makeModule('module-2')])

    expect(index.search('模块', { type: 'concept' })).toEqual([])
    expect(index.search('模块', { types: ['module'], moduleId: 'module-2' })).toEqual([
      expect.objectContaining({
        type: 'module',
        moduleId: 'module-2',
      }),
    ])
  })
})
