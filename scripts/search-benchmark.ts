import { cpus } from 'node:os'

import { ClientSearchIndex } from '../src/lib/runtime/search-client'
import type { Concept, Module, Quiz } from '../src/types/domain'

const MODULE_COUNTS = [10, 50, 100, 500] as const
const CONCEPTS_PER_MODULE = 3
const QUIZZES_PER_CONCEPT = 2
const CHALLENGE_QUIZZES_PER_MODULE = 1
const REBUILD_RUNS = 3
const SEARCH_RUNS = 5
const SEARCH_QUERY = '批量主题'

interface MemorySnapshot {
  rss: number
  heapUsed: number
}

interface BenchmarkResult {
  modules: number
  indexEntries: number
  rebuildMs: number
  searchFirstResultMs: number
  resultCount: number
  firstResult: {
    type: string
    moduleId: string
  } | null
  memory: {
    rssBeforeMiB: number | null
    rssAfterMiB: number | null
    rssDeltaMiB: number | null
    heapUsedBeforeMiB: number | null
    heapUsedAfterMiB: number | null
    heapUsedDeltaMiB: number | null
  }
}

interface BenchmarkReport {
  generatedAt: string
  runtime: {
    name: string
    version: string
    platform: string
    arch: string
    cpuCount: number | null
  }
  config: {
    conceptsPerModule: number
    quizzesPerConcept: number
    challengeQuizzesPerModule: number
    rebuildRuns: number
    searchRuns: number
    searchQuery: string
    searchFirstResultLatencyDefinition: string
  }
  results: BenchmarkResult[]
}

function createQuiz(id: string, conceptId: string): Quiz {
  return {
    id,
    conceptId,
    ladderLevel: 1,
    expressionLevel: 1,
    interactionType: 'choice',
    stem: `合成题目 ${id}`,
    options: ['A', 'B', 'C', 'D'],
    answer: 'A',
    explanation: `合成解析 ${id}`,
    distractors: ['B', 'C', 'D'],
  }
}

function createConcept(moduleId: string, conceptIndex: number): Concept {
  const id = `benchmark-${moduleId}-concept-${conceptIndex}`
  const quizzes = Array.from({ length: QUIZZES_PER_CONCEPT }, (_, quizIndex) =>
    createQuiz(`${id}-quiz-${quizIndex}`, id),
  )

  return {
    id,
    moduleId,
    name: `合成概念 ${moduleId}-${conceptIndex}`,
    definition: `合成定义 ${moduleId}-${conceptIndex}`,
    type: 'fact',
    keyPoints: [`合成要点 ${moduleId}-${conceptIndex}`],
    quizSeries: { conceptId: id, quizzes },
    order: conceptIndex + 1,
  }
}

function createModule(index: number): Module {
  const id = `benchmark-module-${index}`
  const concepts = Array.from({ length: CONCEPTS_PER_MODULE }, (_, conceptIndex) =>
    createConcept(id, conceptIndex),
  )
  const challengeQuizzes = Array.from({ length: CHALLENGE_QUIZZES_PER_MODULE }, (_, quizIndex) =>
    createQuiz(`${id}-challenge-${quizIndex}`, concepts[0].id),
  )

  return {
    id,
    sourceId: `${id}-source`,
    title: `合成模块 ${index}`,
    intro: `这是用于规模测试的批量主题模块 ${index}`,
    goal: `验证客户端索引在 ${index} 号模块上的表现`,
    concepts,
    challengeQuizzes,
    feynmanTask: {
      moduleId: id,
      steps: [],
      finalPrompt: `请讲解合成模块 ${index}`,
      rubric: [],
    },
    order: index + 1,
  }
}

function createModules(count: number): Module[] {
  return Array.from({ length: count }, (_, index) => createModule(index + 1))
}

function readMemory(): MemorySnapshot | null {
  try {
    const usage = process.memoryUsage()
    return { rss: usage.rss, heapUsed: usage.heapUsed }
  } catch {
    return null
  }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function toMiB(bytes: number | undefined): number | null {
  return bytes === undefined ? null : Number((bytes / 1024 / 1024).toFixed(2))
}

function deltaMiB(after: number | undefined, before: number | undefined): number | null {
  return after === undefined || before === undefined
    ? null
    : Number(((after - before) / 1024 / 1024).toFixed(2))
}

function benchmarkSize(moduleCount: number): BenchmarkResult {
  const modules = createModules(moduleCount)
  const index = new ClientSearchIndex()

  index.rebuild(modules)
  const memoryBefore = readMemory()
  const rebuildTimes: number[] = []
  for (let run = 0; run < REBUILD_RUNS; run += 1) {
    const startedAt = performance.now()
    index.rebuild(modules)
    rebuildTimes.push(performance.now() - startedAt)
  }
  const memoryAfter = readMemory()

  index.search(SEARCH_QUERY)
  const searchTimes: number[] = []
  let hits = index.search(SEARCH_QUERY)
  for (let run = 0; run < SEARCH_RUNS; run += 1) {
    const startedAt = performance.now()
    hits = index.search(SEARCH_QUERY)
    searchTimes.push(performance.now() - startedAt)
  }

  const firstHit = hits[0]
  return {
    modules: moduleCount,
    indexEntries:
      moduleCount *
      (1 + CONCEPTS_PER_MODULE * (1 + QUIZZES_PER_CONCEPT) + CHALLENGE_QUIZZES_PER_MODULE),
    rebuildMs: Number(median(rebuildTimes).toFixed(3)),
    searchFirstResultMs: Number(median(searchTimes).toFixed(3)),
    resultCount: hits.length,
    firstResult:
      firstHit === undefined ? null : { type: firstHit.type, moduleId: firstHit.moduleId },
    memory: {
      rssBeforeMiB: memoryBefore === null ? null : toMiB(memoryBefore.rss),
      rssAfterMiB: memoryAfter === null ? null : toMiB(memoryAfter.rss),
      rssDeltaMiB:
        memoryBefore === null || memoryAfter === null
          ? null
          : deltaMiB(memoryAfter.rss, memoryBefore.rss),
      heapUsedBeforeMiB: memoryBefore === null ? null : toMiB(memoryBefore.heapUsed),
      heapUsedAfterMiB: memoryAfter === null ? null : toMiB(memoryAfter.heapUsed),
      heapUsedDeltaMiB:
        memoryBefore === null || memoryAfter === null
          ? null
          : deltaMiB(memoryAfter.heapUsed, memoryBefore.heapUsed),
    },
  }
}

function createReport(): BenchmarkReport {
  const bunVersion = process.versions.bun
  let cpuCount: number | null = null
  try {
    cpuCount = cpus().length
  } catch {
    // Some restricted runtimes may not expose CPU information.
  }

  return {
    generatedAt: new Date().toISOString(),
    runtime: {
      name: bunVersion === undefined ? 'node' : 'bun',
      version: bunVersion ?? process.version,
      platform: process.platform,
      arch: process.arch,
      cpuCount,
    },
    config: {
      conceptsPerModule: CONCEPTS_PER_MODULE,
      quizzesPerConcept: QUIZZES_PER_CONCEPT,
      challengeQuizzesPerModule: CHALLENGE_QUIZZES_PER_MODULE,
      rebuildRuns: REBUILD_RUNS,
      searchRuns: SEARCH_RUNS,
      searchQuery: SEARCH_QUERY,
      searchFirstResultLatencyDefinition:
        'ClientSearchIndex.search() 同步完成排序并返回 hits 数组所需的时间；当前 API 无增量/流式首项回调。',
    },
    results: MODULE_COUNTS.map(benchmarkSize),
  }
}

function formatMemory(value: number | null): string {
  return value === null ? 'n/a' : `${value.toFixed(2)} MiB`
}

function renderMarkdown(report: BenchmarkReport): string {
  const rows = report.results
    .map(
      (result) =>
        `| ${result.modules} | ${result.indexEntries} | ${result.rebuildMs.toFixed(3)} | ${result.searchFirstResultMs.toFixed(3)} | ${result.resultCount} | ${formatMemory(result.memory.heapUsedDeltaMiB)} | ${formatMemory(result.memory.rssDeltaMiB)} |`,
    )
    .join('\n')

  return [
    '# ClientSearchIndex benchmark',
    '',
    `Runtime: ${report.runtime.name} ${report.runtime.version} / ${report.runtime.platform}-${report.runtime.arch} / CPU ${report.runtime.cpuCount ?? 'n/a'}`,
    `Query: \`${report.config.searchQuery}\`; rebuild runs: ${report.config.rebuildRuns}; search runs: ${report.config.searchRuns}`,
    `首结果延迟口径：${report.config.searchFirstResultLatencyDefinition}`,
    '',
    '| Modules | Index entries | Rebuild median (ms) | Search first-result median (ms) | Results | Heap delta | RSS delta |',
    '| ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
    rows,
    '',
    'JSON:',
    '```json',
    JSON.stringify(report, null, 2),
    '```',
    '',
  ].join('\n')
}

process.stdout.write(renderMarkdown(createReport()))
