import type { Module, Quiz } from '@/types/domain'

export type SearchEntryType = 'module' | 'concept' | 'quiz'

/** 可由 SearchDialog 用来限制结果范围的筛选条件。 */
export interface SearchFilters {
  type?: SearchEntryType
  types?: readonly SearchEntryType[]
  moduleId?: string
  conceptId?: string
  quizId?: string
}

/**
 * 客户端搜索索引中的一个可展示条目。
 *
 * title/content 都是已去除 HTML 的纯文本；搜索时会对它们再做大小写和空白归一化。
 */
export interface SearchEntry {
  type: SearchEntryType
  moduleId: string
  conceptId?: string
  quizId?: string
  title: string
  content: string
}

export interface SearchHit extends SearchEntry {
  snippet: string
  /** 用于稳定相关性排序；分值越高越相关。 */
  score: number
}

interface IndexedSearchEntry extends SearchEntry {
  normalizedTitle: string
  normalizedContent: string
  normalizedText: string
  index: number
}

/**
 * 客户端统一搜索。production 和 showcase 共用同一实现。
 *
 * 索引只接收当前已经从 storage 读出的 Module[]，不订阅任何 store 或 repository。
 * 调用方在 SearchDialog 打开时读取当前 storage 后 rebuild，即可避免遗漏直接写入路径。
 */
export class ClientSearchIndex {
  private entries: IndexedSearchEntry[] = []

  /** 从当前 Module 快照重建内存索引。重复 id 只保留首次出现的条目。 */
  rebuild(modules: readonly Module[]): void {
    const nextEntries: IndexedSearchEntry[] = []
    const seenModuleIds = new Set<string>()

    for (const moduleData of modules) {
      if (seenModuleIds.has(moduleData.id)) {
        continue
      }
      seenModuleIds.add(moduleData.id)

      nextEntries.push(
        createIndexedEntry(
          {
            type: 'module',
            moduleId: moduleData.id,
            title: moduleData.title,
            content: joinText([
              moduleData.intro,
              moduleData.goal,
              moduleData.feynmanTask.finalPrompt,
              moduleData.feynmanTask.rubric,
              ...moduleData.feynmanTask.steps.flatMap((step) => [
                step.stem,
                step.options,
                step.answer,
                step.explanation,
                step.answerHint,
                step.acceptableAnswers,
                step.misconception,
                step.extendedKnowledge,
              ]),
            ]),
          },
          nextEntries.length,
        ),
      )

      const seenConceptIds = new Set<string>()
      const seenQuizIds = new Set<string>()

      for (const concept of moduleData.concepts) {
        if (seenConceptIds.has(concept.id)) {
          continue
        }
        seenConceptIds.add(concept.id)

        nextEntries.push(
          createIndexedEntry(
            {
              type: 'concept',
              moduleId: moduleData.id,
              conceptId: concept.id,
              title: concept.name,
              content: joinText([concept.definition, concept.keyPoints, concept.knowledgePage]),
            },
            nextEntries.length,
          ),
        )

        for (const quiz of concept.quizSeries.quizzes) {
          addQuizEntry(nextEntries, seenQuizIds, moduleData.id, quiz)
        }
      }

      for (const quiz of moduleData.challengeQuizzes ?? []) {
        addQuizEntry(nextEntries, seenQuizIds, moduleData.id, quiz)
      }
    }

    this.entries = nextEntries
  }

  /**
   * 使用空格分词并按 AND 匹配；中文不依赖分词器，直接使用子串匹配。
   * 结果按相关性分数降序，再按索引构建顺序稳定排序。
   */
  search(query: string, filters?: SearchFilters): SearchHit[] {
    const normalizedQuery = normalizeSearchText(query)
    if (!normalizedQuery) {
      return []
    }

    const terms = normalizedQuery.split(' ')
    const hits: SearchHit[] = []

    for (const entry of this.entries) {
      if (!matchesFilters(entry, filters)) {
        continue
      }

      const score = scoreEntry(entry, terms, normalizedQuery)
      if (score === null) {
        continue
      }

      hits.push({
        type: entry.type,
        moduleId: entry.moduleId,
        ...(entry.conceptId === undefined ? {} : { conceptId: entry.conceptId }),
        ...(entry.quizId === undefined ? {} : { quizId: entry.quizId }),
        title: entry.title,
        content: entry.content,
        snippet: createSnippet(entry, terms),
        score,
      })
    }

    return hits.sort(
      (left, right) =>
        right.score - left.score || leftIndex(left, this.entries) - leftIndex(right, this.entries),
    )
  }
}

function addQuizEntry(
  entries: IndexedSearchEntry[],
  seenQuizIds: Set<string>,
  moduleId: string,
  quiz: Quiz,
): void {
  if (seenQuizIds.has(quiz.id)) {
    return
  }
  seenQuizIds.add(quiz.id)

  entries.push(
    createIndexedEntry(
      {
        type: 'quiz',
        moduleId,
        conceptId: quiz.conceptId,
        quizId: quiz.id,
        title: quiz.stem,
        content: joinText([
          quiz.explanation,
          quiz.options,
          quiz.answer,
          quiz.distractors,
          quiz.background,
          quiz.answerHint,
          quiz.acceptableAnswers,
          quiz.misconception,
          quiz.extendedKnowledge,
        ]),
      },
      entries.length,
    ),
  )
}

function createIndexedEntry(entry: SearchEntry, index: number): IndexedSearchEntry {
  const title = toPlainText(entry.title)
  const content = toPlainText(entry.content)

  return {
    ...entry,
    title,
    content,
    normalizedTitle: normalizeSearchText(title),
    normalizedContent: normalizeSearchText(content),
    normalizedText: normalizeSearchText(joinText([title, content])),
    index,
  }
}

function matchesFilters(entry: SearchEntry, filters: SearchFilters | undefined): boolean {
  if (filters?.type !== undefined && entry.type !== filters.type) {
    return false
  }
  if (filters?.types !== undefined && !filters.types.includes(entry.type)) {
    return false
  }
  if (filters?.moduleId !== undefined && entry.moduleId !== filters.moduleId) {
    return false
  }
  if (filters?.conceptId !== undefined && entry.conceptId !== filters.conceptId) {
    return false
  }
  if (filters?.quizId !== undefined && entry.quizId !== filters.quizId) {
    return false
  }
  return true
}

function scoreEntry(
  entry: IndexedSearchEntry,
  terms: readonly string[],
  normalizedQuery: string,
): number | null {
  if (!terms.every((term) => entry.normalizedText.includes(term))) {
    return null
  }

  let score = 0
  for (const term of terms) {
    if (entry.normalizedTitle.includes(term)) {
      score += 100
    } else if (entry.normalizedContent.includes(term)) {
      score += 20
    }
  }

  if (entry.normalizedTitle.includes(normalizedQuery)) {
    score += 10
  }
  return score
}

function createSnippet(entry: IndexedSearchEntry, terms: readonly string[]): string {
  const source = joinText([entry.title, entry.content])
  const normalizedSource = normalizeSearchText(source)
  const matchIndex = terms
    .map((term) => normalizedSource.indexOf(term))
    .filter((index) => index >= 0)
    .sort((left, right) => left - right)[0]

  if (matchIndex === undefined) {
    return source.slice(0, 60)
  }

  const matchedTerm = terms.find((term) => normalizedSource.indexOf(term) === matchIndex)
  const matchLength = matchedTerm?.length ?? 0
  const start = Math.max(0, matchIndex - 30)
  const end = Math.min(source.length, matchIndex + matchLength + 30)

  return `${start > 0 ? '…' : ''}${source.slice(start, end)}${end < source.length ? '…' : ''}`
}

function leftIndex(hit: SearchHit, entries: readonly IndexedSearchEntry[]): number {
  return (
    entries.find(
      (entry) =>
        entry.type === hit.type &&
        entry.moduleId === hit.moduleId &&
        entry.conceptId === hit.conceptId &&
        entry.quizId === hit.quizId,
    )?.index ?? Number.MAX_SAFE_INTEGER
  )
}

function joinText(values: readonly (string | readonly string[] | null | undefined)[]): string {
  const parts: string[] = []
  for (const value of values) {
    if (typeof value === 'string') {
      parts.push(value)
    } else if (Array.isArray(value)) {
      parts.push(...value)
    }
  }
  return toPlainText(parts.join(' '))
}

function toPlainText(value: string): string {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeSearchText(value: string): string {
  return toPlainText(value).toLowerCase()
}
