/**
 * Knowledge Compiler Pipeline 编排实现（M3 W2/W3/W4）
 *
 * 对应 docs/M3-Plan.md §W2-W4。
 *
 * 设计要点：
 *   - compileMarkdown 是 async generator，按 stage 顺序吐出 CompileEvent
 *   - 错误用 yield error + return 而非 throw（让 SSE 流端保持打开）
 *   - 输入校验在 generator 内 yield error + return
 *   - Quiz 阶段用 quiz-batch 模式（每 concept 一次 LLM 调用生成全部题目），
 *     每 concept 完成后 yield progress，既控制请求次数又保证 SSE 流间隔 < 30s
 *   - 失败 slot 降级（直接跳过 push，不写 null 进 quizSeries.quizzes）
 *
 * 与 M2.5 衔接：
 *   - runAgent(kind, input, provider, schema, options) — Agent 执行器
 *   - createProvider(config) — Provider 工厂
 *   - assembleConcept/Quiz/FeynmanTask/Module — Schema→domain 映射
 *   - Import 用 lightweightModel，其他 6 Agent 用 compileModel
 */
import type { Concept, FeynmanTask, Module, Quiz } from '@/types/domain'
import type {
  ChunkAgentOutput,
  ConceptAgentOutput,
  FeynmanAgentOutput,
  ImportAgentOutput,
  MissionAgentOutput,
  ModuleAgentOutput,
  QuizBatchAgentOutput,
} from '@/lib/compiler/schemas'
import type { LLMProvider } from '@/lib/providers'

import { createProvider } from '@/lib/providers'
import { runAgent } from '@/lib/compiler/agents/_runner'
import {
  assembleConcept,
  assembleFeynmanTask,
  assembleModule,
  assembleQuiz,
} from '@/lib/compiler/agents/mappers'
import {
  chunkSchema,
  conceptSchema,
  feynmanSchema,
  importSchema,
  missionSchema,
  moduleSchema,
  quizBatchSchema,
  quizItemSchema,
} from '@/lib/compiler/schemas'

import { ProviderError } from '@/lib/providers'
import { AgentOutputError, safeParseJSON } from '@/lib/compiler/agents/errors'
import {
  INPUT_MAX_LENGTH,
  INPUT_MIN_LENGTH,
  QUIZ_FAILURE_THRESHOLD,
  QUIZ_PERCENT_END,
  QUIZ_PERCENT_START,
  STAGE_PERCENT,
  type CompileConfig,
  type CompileErrorPayload,
  type CompileEvent,
  type CompileStage,
} from './types'
import { makeError, makeInputError, makeQuizBatchError, translateError } from './errors'

// =================================================================
// 主入口：异步生成器
// =================================================================

/**
 * 编译 Markdown → Module 的异步生成器。
 *
 * 调用方用 `for await (const event of compileMarkdown(md, cfg))` 流式消费。
 * 最后一个事件是 `complete`（携带完整 Module）或 `error`（携带错误载荷）。
 *
 * 错误处理总原则：不抛异常（除非内部 bug），用 yield error + return。
 * 让 SSE 流端保持打开，前端能拿到完整错误上下文 + 修改建议。
 *
 * @param rawMarkdown 用户输入的 Markdown 文本
 * @param config      调用方传入的 LLM 配置
 */
export async function* compileMarkdown(
  rawMarkdown: string,
  config: CompileConfig,
): AsyncIterable<CompileEvent> {
  // ===== 输入校验（yield error + return，不 throw）=====
  const inputError = validateInput(rawMarkdown)
  if (inputError) {
    yield { kind: 'error', error: inputError }
    return
  }

  // ===== Provider 准备 =====
  // Import 用 lightweightModel（轻量场景，无需旗舰）
  // 其他 6 Agent 用 compileModel（编译主体）
  const lightweightProvider = createProvider({
    ...config.llm,
    model: config.lightweightModel,
  })
  const compileProvider = createProvider({
    ...config.llm,
    model: config.compileModel,
  })
  // enableThinking → disableThinking 取反转换
  // 默认 enableThinking=false → disableThinking=true（关闭 thinking，对齐 M2.5）
  const disableThinking = !config.enableThinking

  // ===== Stage 1: Import（25%）=====
  const importOut = yield* runStage('import', async () => {
    const out = await runAgent('import', { rawMarkdown }, lightweightProvider, importSchema, {
      disableThinking,
    })
    return out as ImportAgentOutput
  })
  if (!importOut) return // stage 内已 yield error

  const normalizedText = importOut.normalizedText

  // ===== Stage 2: Chunk（40%）=====
  const chunkOut = yield* runStage('chunk', async () => {
    const out = await runAgent('chunk', { normalizedText }, compileProvider, chunkSchema, {
      disableThinking,
    })
    return out as ChunkAgentOutput
  })
  if (!chunkOut) return

  const chunks = chunkOut.chunks

  // ===== Stage 3: Concept（55%）=====
  const conceptOut = yield* runStage('concept', async () => {
    const out = await runAgent(
      'concept',
      { chunks, themeHint: '' },
      compileProvider,
      conceptSchema,
      { disableThinking },
    )
    return out as ConceptAgentOutput
  })
  if (!conceptOut) return

  const conceptsRaw = conceptOut.concepts

  // ===== Stage 4: Module（65%）=====

  const moduleOut = yield* runStage('module', async () => {
    const out = await runAgent(
      'module',
      { concepts: conceptsRaw, themeHint: '' },
      compileProvider,
      moduleSchema,
      { disableThinking },
    )
    return out as ModuleAgentOutput
  })
  if (!moduleOut) return

  // 按 module.conceptOrder 顺序组装 concepts（含空 quizSeries，W3 填充）
  const moduleId = moduleOut.module.id
  const conceptOrder = moduleOut.module.conceptOrder
  const conceptsById = new Map<string, ConceptAgentOutput['concepts'][number]>(
    conceptsRaw.map((c) => [c.id, c]),
  )
  const assembledConcepts: Concept[] = []
  for (let i = 0; i < conceptOrder.length; i++) {
    const conceptId = conceptOrder[i]
    if (!conceptId) continue // 类型收窄；conceptOrder 数组已校验非空
    const raw = conceptsById.get(conceptId)
    if (!raw) {
      // conceptOrder 引用了不存在的 concept id（schema 层应该已拦截）
      yield {
        kind: 'error',
        error: makeError(
          'module',
          'agent_output_invalid',
          {},
          new Error(`conceptOrder 引用未知 concept: ${conceptId}`),
        ),
      }
      return
    }
    assembledConcepts.push(assembleConcept(raw, moduleId, i + 1))
  }

  // 构造 stub FeynmanTask（W4 替换）
  const stubFeynmanTask: FeynmanTask = {
    moduleId,
    steps: [],
    finalPrompt: '',
    rubric: [],
  }

  // sourceId 用时间戳构造（M3 不持久化到 LocalStorage，sourceId 仅用于结构完整性）
  const sourceId = `source-${Date.now()}`
  const partialModule: Module = assembleModule(moduleOut.module, {
    sourceId,
    concepts: assembledConcepts,
    feynmanTask: stubFeynmanTask,
  })

  yield {
    kind: 'progress',
    stage: 'module',
    percent: STAGE_PERCENT.module,
    message: `已识别 ${assembledConcepts.length} 个概念`,
  }

  // ===== Stage 5: Mission（70%）=====
  const missionOut = yield* runStage('mission', async () => {
    const out = await runAgent(
      'mission',
      { module: partialModule, concepts: assembledConcepts },
      compileProvider,
      missionSchema,
      { disableThinking },
    )
    return out as MissionAgentOutput
  })
  if (!missionOut) return

  // ===== Stage 6: Quiz（80%-95%，quiz-batch 按 concept 分组）=====
  // runQuizStage 返回 boolean：true=成功（含降级），false=已熔断
  // 熔断时已 yield error，主流程 return
  const quizOk = yield* runQuizStage({
    seriesByConcept: missionOut.seriesByConcept,
    concepts: assembledConcepts,
    moduleContext: partialModule,
    provider: compileProvider,
    disableThinking,
  })
  if (!quizOk) return

  // ===== Stage 7: Feynman（100%）=====
  const feynmanOut = yield* runStage('feynman', async () => {
    const out = await runAgent(
      'feynman',
      { module: partialModule, concepts: assembledConcepts },
      compileProvider,
      feynmanSchema,
      { disableThinking },
    )
    return out as FeynmanAgentOutput
  })
  if (!feynmanOut) return

  // 替换 stub FeynmanTask
  partialModule.feynmanTask = assembleFeynmanTask(feynmanOut.feynmanTask)

  yield {
    kind: 'progress',
    stage: 'feynman',
    percent: STAGE_PERCENT.feynman,
    message: '编译完成',
  }

  yield { kind: 'complete', module: partialModule }
}

// =================================================================
// 重试工具
// =================================================================

/** 瞬时错误最大重试次数（M3 W8 添加，处理网络波动 / 偶发 429） */
const MAX_RETRIES = 3

/** 重试退避基数 ms：1s, 2s, 4s */
const RETRY_BASE_DELAY_MS = 1000

/**
 * 判断异常是否为瞬时错误（值得重试）。
 *
 * 瞬时错误：网络超时/DNS/连接拒绝 (network)、5xx (llm_unavailable)、429 (llm_rate_limit)
 * 非瞬时：AgentOutputError（schema 内部重试已用尽）、4xx 非 429（llm_client_error）、invalid_response
 */
function isTransientError(e: unknown): boolean {
  if (e instanceof ProviderError) {
    return e.kind === 'network' || e.kind === 'llm_unavailable' || e.kind === 'llm_rate_limit'
  }
  return false
}

/**
 * 指数退避延迟：1s, 2s, 4s, ...
 */
function backoffDelay(attempt: number): number {
  return RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
}

// =================================================================
// Stage 执行包装：yield stage_enter + 执行 + yield progress + 错误处理
// =================================================================

/**
 * 单 stage 执行包装（用于非 Quiz 的顺序 stage）。
 *
 * 流程：
 *   1. yield stage_enter
 *   2. 执行 fn()，瞬时错误自动重试（最多 MAX_RETRIES 次，指数退避）
 *   3. 成功 → yield progress（STAGE_PERCENT[stage]）+ 返回结果
 *   4. 失败（非瞬时 或 重试用尽）→ yield error + 返回 undefined
 *
 * 注意：由于 TypeScript 不能在 generator 内用 yield + return value 同时表达，
 * 这里用 yield* 把内层 generator 的事件流透出，返回值通过 yield* 表达式取得。
 *
 * @returns 成功时返回 stage 输出；失败时返回 undefined（调用方判空后 return）
 */
async function* runStage<T>(
  stage: Exclude<CompileStage, 'quiz'>,
  fn: () => Promise<T>,
): AsyncGenerator<CompileEvent, T | undefined> {
  yield { kind: 'stage_enter', stage }

  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await fn()
      const percent = STAGE_PERCENT[stage]
      yield { kind: 'progress', stage, percent }
      return result
    } catch (e: unknown) {
      lastError = e
      if (!isTransientError(e) || attempt >= MAX_RETRIES) break
      const delay = backoffDelay(attempt)
      console.warn(`[retry] ${stage} 瞬时错误，${delay}ms 后第 ${attempt + 1} 次重试...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  yield { kind: 'error', error: translateError(stage, lastError!) }
  return undefined
}

// =================================================================
// Quiz Stage：quiz-batch 按 concept 分组 + 熔断 + 降级
// =================================================================

/**
 * Quiz stage 输入参数。
 */
interface QuizStageInput {
  /** Mission Agent 输出的 seriesByConcept */
  seriesByConcept: MissionAgentOutput['seriesByConcept']
  /** 已组装的 concepts（用于查 concept 上下文 + 写入 quizSeries） */
  concepts: Concept[]
  /** 部分 Module（作为 Quiz Agent 的 moduleContext） */
  moduleContext: Module
  /** Provider（已配置 compileModel） */
  provider: LLMProvider
  /** 是否禁用 thinking */
  disableThinking: boolean
}

/**
 * 单个 slot 的扁平化表示。
 *
 * `placeholder.id` 编码了 conceptId 和 slotIndex（如 'concept-1:slot-3'），
 * 我们额外保存拆分后的 conceptId / slotIndex 便于查表。
 */
interface QuizSlot {
  conceptId: string
  slotIndex: number
  placeholder: MissionAgentOutput['seriesByConcept'][string][number]
}

/**
 * 单个 slot 的执行结果。
 */
type QuizSlotResult =
  { slot: QuizSlot; ok: true; quiz: Quiz } | { slot: QuizSlot; ok: false; error: unknown }

/**
 * 统计 seriesByConcept 中的 placeholder 总数。
 */
function countPlaceholders(seriesByConcept: MissionAgentOutput['seriesByConcept']): number {
  let count = 0
  for (const placeholders of Object.values(seriesByConcept)) {
    count += placeholders.length
  }
  return count
}

/**
 * 尝试从 AgentOutputError 的原始输出中修复部分有效的 quiz。
 *
 * 当 runAgent 严格校验失败（schema_violation）后，用 lenient 方式解析原始 JSON，
 * 逐个 quiz 用 quizItemSchema 校验，保留通过的部分结果。
 *
 * 设计意图: 某个 concept 的 LLM 输出中偶发 1-2 道题不达标（如 options[0] !== answer
 * 或 used=true 不足），不应让整个 concept 的 10 道题全部报废。
 *
 * @returns 经过严格校验的 Quiz 数组（可能为空），或 null 表示无法解析
 */
function salvageQuizBatch(raw: string, placeholders: unknown[]): Quiz[] | null {
  const parsed = safeParseJSON(raw)
  if (!parsed.ok) return null

  const data = parsed.value as Record<string, unknown>
  if (!data || typeof data !== 'object' || !Array.isArray(data.quizzes)) return null

  const validPlaceholderIds = new Set<string>(
    (placeholders as Array<{ id: string }>).map((p) => p.id),
  )

  const validQuizzes: Quiz[] = []
  for (const item of data.quizzes) {
    const result = quizItemSchema.safeParse(item)
    if (result.success) {
      try {
        const quiz = assembleQuiz(result.data)
        if (quiz && validPlaceholderIds.has(quiz.id)) {
          validQuizzes.push(quiz)
        }
      } catch {
        // assembleQuiz 解析失败则跳过
      }
    }
  }

  return validQuizzes.length > 0 ? validQuizzes : null
}

/**
 * 执行 Quiz stage（按 concept 分批，每 concept 一次 prompt）。
 *
 * 流程：
 *   1. yield stage_enter
 *   2. 遍历 seriesByConcept 的每项（按 concept 分组），
 *      每组一次 runAgent('quiz-batch', ...) 生成全部题目
 *   3. 每 concept 完成后 yield progress（动态 80% → 95%）
 *   4. 全部完成后计算失败率：
 *      - > QUIZ_FAILURE_THRESHOLD → yield error + return（熔断）
 *      - ≤ 阈值 → 降级（失败 slot 跳过 push，不写 null）
 *
 * 失败 slot 降级语义：
 *   - quizSeries.quizzes 是 Quiz[]（domain 类型，不允许 null）
 *   - 失败 slot 直接不 push 进 quizzes 数组
 *   - M4 运行时通过比对 placeholder 期望数 vs quizzes 实际数检测 gap
 */
async function* runQuizStage(input: QuizStageInput): AsyncGenerator<CompileEvent, boolean> {
  yield { kind: 'stage_enter', stage: 'quiz' }

  // 统计总数的工具函数
  const totalSlots = countPlaceholders(input.seriesByConcept)
  if (totalSlots === 0) {
    yield {
      kind: 'error',
      error: makeError(
        'quiz',
        'agent_output_invalid',
        {},
        new Error('Mission 未产出任何 placeholder'),
      ),
    }
    return false
  }

  yield {
    kind: 'progress',
    stage: 'quiz',
    percent: QUIZ_PERCENT_START,
    message: `准备按 concept 并行生成 ${totalSlots} 道 Quiz`,
  }

  // conceptId → Concept 索引（O(1) 查找）
  const conceptMap = new Map<string, Concept>(input.concepts.map((c) => [c.id, c]))

  const allResults: QuizSlotResult[] = []
  let completedCount = 0

  // 按 concept 分组，每 concept 一次 batch 请求
  for (const [conceptId, placeholders] of Object.entries(input.seriesByConcept)) {
    const concept = conceptMap.get(conceptId)
    if (!concept) {
      // 兜底：concept 不存在时跳过
      for (let idx = 0; idx < placeholders.length; idx++) {
        const p = placeholders[idx]
        if (p) {
          allResults.push({
            slot: { conceptId, slotIndex: idx, placeholder: p },
            ok: false,
            error: new Error(`未找到 concept: ${conceptId}`),
          })
        }
      }
      completedCount += placeholders.length
      continue
    }

    let batchOk = false
    let batchError: unknown
    let batchQuizzes: Quiz[] = []

    for (let retry = 0; retry <= MAX_RETRIES; retry++) {
      try {
        const out = await runAgent(
          'quiz-batch',
          {
            placeholders: placeholders,
            concept: conceptRawForQuiz(concept),
            moduleContext: input.moduleContext,
            total: placeholders.length,
            conceptName: concept.name,
            conceptId,
          },
          input.provider,
          quizBatchSchema,
          { disableThinking: input.disableThinking },
        )
        const batchOut = out as QuizBatchAgentOutput
        batchQuizzes = batchOut.quizzes.map((q) => assembleQuiz(q))
        batchOk = true
        break
      } catch (e: unknown) {
        batchError = e
        if (e instanceof AgentOutputError) {
          console.error(
            `[quiz-batch] ${concept.name}: ${e.message} (attempt ${retry + 1}/${MAX_RETRIES + 1})`,
          )
          // 尝试从原始输出中修复部分有效的 quiz
          const salvaged = salvageQuizBatch(e.raw, placeholders)
          if (salvaged !== null) {
            batchQuizzes = salvaged
            batchOk = true
            const placeholdersArr = placeholders as Array<{ id: string }>
            console.warn(
              `[quiz-batch] ${concept.name}: 已修复 ${salvaged.length}/${placeholdersArr.length} 道题（部分容错）`,
            )
            break
          }
        }
        if (!isTransientError(e) || retry >= MAX_RETRIES) break
        const delay = backoffDelay(retry)
        console.warn(
          `[quiz-batch] ${concept.name} 瞬时错误，${delay}ms 后第 ${retry + 1} 次重试...`,
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
      }
    }

    if (batchOk) {
      // 按 placeholder.id 匹配返回的 quiz
      const quizById = new Map<string, Quiz>(batchQuizzes.map((q) => [q.id, q]))
      for (let idx = 0; idx < placeholders.length; idx++) {
        const p = placeholders[idx]
        if (!p) continue
        const quiz = quizById.get(p.id)
        if (quiz) {
          allResults.push({ slot: { conceptId, slotIndex: idx, placeholder: p }, ok: true, quiz })
        } else {
          allResults.push({
            slot: { conceptId, slotIndex: idx, placeholder: p },
            ok: false,
            error: new Error(`Batch 未生成与 placeholder "${p.id}" 对应的 quiz`),
          })
        }
      }
    } else {
      for (let idx = 0; idx < placeholders.length; idx++) {
        const p = placeholders[idx]
        if (p) {
          allResults.push({
            slot: { conceptId, slotIndex: idx, placeholder: p },
            ok: false,
            error: batchError,
          })
        }
      }
    }

    completedCount += placeholders.length

    const pct =
      QUIZ_PERCENT_START +
      Math.round((completedCount / totalSlots) * (QUIZ_PERCENT_END - QUIZ_PERCENT_START))
    yield {
      kind: 'progress',
      stage: 'quiz',
      percent: pct,
      message: `已完成 ${completedCount}/${totalSlots} 题（概念 "${concept.name}": ${batchOk ? placeholders.length : 0} 道）`,
    }
  }

  // 熔断检查
  const failureCount = allResults.filter((r) => !r.ok).length
  const failureRate = failureCount / totalSlots
  if (failureRate > QUIZ_FAILURE_THRESHOLD) {
    const firstError = allResults.find((r) => !r.ok)?.error
    yield {
      kind: 'error',
      error: makeQuizBatchError(failureCount, totalSlots, firstError),
    }
    return false
  }

  // 降级：成功 slot 写入对应 concept 的 quizSeries.quizzes；失败 slot 跳过
  for (const result of allResults) {
    if (!result.ok) continue
    const concept = conceptMap.get(result.slot.conceptId)
    if (!concept) continue
    concept.quizSeries.quizzes.push(result.quiz)
  }

  // quizSeries 按 slotIndex 升序排列（让前端按 placeholder 顺序渲染）
  for (const concept of input.concepts) {
    concept.quizSeries.quizzes.sort((a, b) => {
      const idxA = parseSlotIndex(a.id)
      const idxB = parseSlotIndex(b.id)
      return idxA - idxB
    })
  }

  return true
}

/**
 * 从 quiz.id（'concept-N:slot-M'）解析 slot 索引 M。
 */
function parseSlotIndex(quizId: string): number {
  const parts = quizId.split(':slot-')
  const last = parts[parts.length - 1]
  if (!last) return 0
  const n = parseInt(last, 10)
  return Number.isNaN(n) ? 0 : n
}

/**
 * 把 domain.Concept 转成 Quiz Agent 期望的输入对象。
 *
 * Quiz Agent 的 prompt 期望 concept 字段含 id/name/definition/type/keyPoints，
 * 不需要 moduleId/order/quizSeries。这里挑取关键字段。
 */
function conceptRawForQuiz(concept: Concept): Omit<Concept, 'moduleId' | 'order' | 'quizSeries'> {
  return {
    id: concept.id,
    name: concept.name,
    definition: concept.definition,
    type: concept.type,
    keyPoints: concept.keyPoints,
  }
}

// =================================================================
// 输入校验
// =================================================================

/**
 * 输入校验。
 *
 * @returns CompileErrorPayload 表示校验失败；null 表示通过
 *
 * 注：非 UTF-8 编码检测在 M3 阶段简化为"信任客户端"，由浏览器/前端确保 UTF-8。
 * M3 阶段不引入 iconv 等依赖。`input_invalid_encoding` 错误码保留供未来使用。
 */
function validateInput(raw: string): CompileErrorPayload | null {
  const len = raw.length
  if (len < INPUT_MIN_LENGTH) {
    return makeInputError('input_too_short', len)
  }
  if (len > INPUT_MAX_LENGTH) {
    return makeInputError('input_too_long', len)
  }
  return null
}

// =================================================================
// 消费 helper：把流转换为 Promise<Module>
// =================================================================

/**
 * 把 CompileEvent 流消费成单个 Module。
 *
 * 用于非流式调用场景（如 smoke 脚本）：
 *   ```ts
 *   const stream = compileMarkdown(md, cfg)
 *   const module = await consumeStream(stream)
 *   ```
 *
 * 行为：
 *   - 遇到 `complete` 事件 → resolve Module
 *   - 遇到 `error` 事件 → reject（错误载荷附在 error.cause）
 *   - 流自然结束无 complete/error → reject（pipeline bug 兜底）
 */
export async function consumeStream(stream: AsyncIterable<CompileEvent>): Promise<Module> {
  let lastError: CompileErrorPayload | undefined
  for await (const event of stream) {
    if (event.kind === 'complete') {
      return event.module
    }
    if (event.kind === 'error') {
      lastError = event.error
    }
  }
  if (lastError) {
    const err = new Error(lastError.message)
    err.cause = lastError
    throw err
  }
  throw new Error('Pipeline 流提前结束：未收到 complete 或 error 事件')
}
