/**
 * Prompt 评估编排脚本（M2.5 W2）
 *
 * 用途：在真实 LLM 上跑指定 (provider × model × agent × fixture × N) 组合，
 *      收集 Schema 通过率 / JSON 合规率 / Retry 触发率 / 业务约束达成 / 延迟分位，
 *      输出 Markdown 报告到 reports/prompt-eval/。
 *
 * 用法：
 *   bun --env-file=.env.local run scripts/prompt-eval.ts \
 *     --agent concept \
 *     --provider deepseek \
 *     --model deepseek-chat \
 *     --fixture rag-chunks \
 *     --runs 5 \
 *     --thinking off
 *
 * 环境变量（从 .env.local 自动加载，bun 默认不读，需 --env-file 显式指定）：
 *   OPENAI_COMPAT_API_KEY / DEEPSEEK_API_KEY / GLM_API_KEY
 *     — 缺所选 provider 的 key 自动 skip / 退出
 *   OPENAI_COMPAT_MODEL / DEEPSEEK_MODEL / GLM_MODEL
 *     — 默认模型覆盖（实际模型由 --model 决定，此 env 仅用于 ping 脚本）
 *   OPENAI_COMPAT_BASE_URL / DEEPSEEK_BASE_URL / GLM_BASE_URL
 *     — 可选自定义 baseURL
 *
 * 对应 docs/M2.5-Plan.md §2.W2 / §3 验收 / docs/prompt-evaluation.md §4-§5。
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { AgentOutputError } from '../src/lib/compiler/agents/errors'
import { runAgent } from '../src/lib/compiler/agents/_runner'
import { getSchema, type AgentKind } from '../src/lib/compiler/schemas'
import { createProvider, isSupportedProvider } from '../src/lib/providers'
import type {
  ChatRequest,
  ChatResponse,
  LLMConfig,
  LLMProvider,
  PingResult,
  ProviderKind,
} from '../src/lib/providers'

// =================================================================
// 类型与常量
// =================================================================

interface CliArgs {
  agent: AgentKind
  provider: ProviderKind
  model: string
  fixture: string
  runs: number
  thinking: 'on' | 'off'
}

/** 单次运行结果 */
interface RunResult {
  runIndex: number
  ok: boolean
  attempts: number // 1 = 一次成功，2 = 重试过（成功或失败）
  failureReason?: string
  latencyMs: number
  rawResponse?: string
  enrichedCoverage?: number
}

/** 聚合指标 */
interface Metrics {
  totalRuns: number
  successCount: number
  failureCount: number
  schemaPassRate: number // 成功 / 总数
  retryTriggerRate: number // attempts=2 的运行 / 总数
  latencyP50: number
  latencyP95: number
  latencyMean: number
  failures: { runIndex: number; reason: string }[]
  enrichedCoverageMean?: number
}

const AGENTS: AgentKind[] = [
  'import',
  'chunk',
  'concept',
  'module',
  'mission',
  'quiz',
  'feynman',
  'feedback',
  'feynman-eval',
  'quiz-batch',
  'challenge-batch',
  'knowledge-expander',
]

const FIXTURES_DIR = path.resolve(
  import.meta.dirname,
  '..',
  'src',
  'lib',
  'compiler',
  '__fixtures__',
)
const REPORTS_DIR = path.resolve(import.meta.dirname, '..', 'reports', 'prompt-eval')

// =================================================================
// CLI 解析
// =================================================================

function printUsageAndExit(): never {
  console.error(
    [
      'Usage: bun run scripts/prompt-eval.ts --agent <kind> --provider <p> --model <m> --fixture <f> [--runs N] [--thinking on|off]',
      '',
      `  --agent     ${AGENTS.join(' | ')}`,
      '  --provider  deepseek | glm | openai-compat',
      '  --model     模型 ID，如 glm-5.2 / deepseek-v4-flash',
      '  --fixture   fixture 名（不含扩展）：',
      '                rag-medium | feynman-medium | gitflow-medium',
      '                edge/very-short | edge/code-heavy | edge/messy-format',
      '                rag-chunks （预切分 chunks，专门给 concept agent）',
      '  --runs      单组合重复次数，默认 5',
      '  --thinking  on | off，默认 off（关闭 GLM thinking）',
    ].join('\n'),
  )
  process.exit(2)
}

function parseArgs(argv: string[]): CliArgs {
  const out: Partial<CliArgs> = { runs: 5, thinking: 'off' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? ''
    const next = argv[i + 1]
    switch (a) {
      case '--agent':
        out.agent = next as AgentKind
        i++
        break
      case '--provider':
        out.provider = next as ProviderKind
        i++
        break
      case '--model':
        out.model = next
        i++
        break
      case '--fixture':
        out.fixture = next
        i++
        break
      case '--runs':
        out.runs = next ? parseInt(next, 10) : 5
        i++
        break
      case '--thinking':
        out.thinking = next === 'on' ? 'on' : 'off'
        i++
        break
      case '--help':
      case '-h':
        printUsageAndExit()
        break
      default:
        console.error(`未知参数：${a}`)
        printUsageAndExit()
    }
  }
  if (!out.agent || !AGENTS.includes(out.agent)) {
    console.error(`--agent 缺失或非法（合法值：${AGENTS.join(', ')}）`)
    printUsageAndExit()
  }
  if (!out.provider || !isSupportedProvider(out.provider)) {
    console.error('--provider 缺失或非法（合法值：deepseek | glm | openai-compat）')
    printUsageAndExit()
  }
  if (!out.model) {
    console.error('--model 缺失')
    printUsageAndExit()
  }
  if (!out.fixture) {
    console.error('--fixture 缺失')
    printUsageAndExit()
  }
  if (!Number.isInteger(out.runs) || out.runs! < 1) {
    console.error('--runs 必须是 ≥ 1 的整数')
    process.exit(2)
  }
  return out as CliArgs
}

// =================================================================
// 环境与 provider 构造
// =================================================================

function loadEnvFile(): void {
  // bun 默认读 process.env；本地 .env.local 需手工加载
  try {
    // 优先用 bun 自带的 .env 加载（dev dependency 不引 dotenv）
    // 若 process.env 已有 API key，跳过文件加载
  } catch {
    // noop
  }
}

function buildLLMConfig(args: CliArgs): LLMConfig {
  const env = process.env
  let apiKey: string | undefined
  let baseURL: string | undefined
  if (args.provider === 'deepseek') {
    apiKey = env.DEEPSEEK_API_KEY
    baseURL = env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com'
  } else if (args.provider === 'openai-compat') {
    apiKey = env.OPENAI_COMPAT_API_KEY
    baseURL = env.OPENAI_COMPAT_BASE_URL ?? ''
    if (!baseURL) {
      console.error(`[env] OPENAI_COMPAT_BASE_URL 未设置，OpenAI 兼容供应商必须提供 baseURL。`)
      process.exit(3)
    }
  } else {
    apiKey = env.GLM_API_KEY
    baseURL = env.GLM_BASE_URL ?? 'https://open.bigmodel.cn/api/coding/paas/v4'
  }
  if (!apiKey) {
    console.error(
      `[env] 未找到 ${args.provider.toUpperCase()}_API_KEY，请在 .env.local 配置（脚本不会读取 .env.local 内容，只检查存在性）。`,
    )
    process.exit(3)
  }
  return {
    provider: args.provider,
    apiKey,
    baseURL,
    model: args.model,
  }
}

// =================================================================
// MetricsProvider — 装饰器，记录 chat() 调用次数与累计延迟
// =================================================================

class MetricsProvider implements LLMProvider {
  chatCallCount = 0
  totalChatLatencyMs = 0

  constructor(private readonly inner: LLMProvider) {}

  async chat(req: ChatRequest): Promise<ChatResponse> {
    this.chatCallCount++
    const start = Date.now()
    try {
      const r = await this.inner.chat(req)
      this.totalChatLatencyMs += Date.now() - start
      return r
    } catch (e) {
      this.totalChatLatencyMs += Date.now() - start
      throw e
    }
  }

  async *chatStream(req: ChatRequest): AsyncIterable<ChatResponse> {
    // eval 不使用流式，直接转发
    yield* this.inner.chatStream(req)
  }

  async ping(): Promise<PingResult> {
    return this.inner.ping()
  }
}

// =================================================================
// Fixture 加载
// =================================================================

async function readFixtureText(name: string): Promise<string> {
  const fs = await import('node:fs/promises')
  // 若 name 含 /（如 edge/very-short），按子路径处理；否则拼 .md
  const p = name.endsWith('.md')
    ? path.join(FIXTURES_DIR, name)
    : name.includes('/')
      ? path.join(FIXTURES_DIR, `${name}.md`)
      : path.join(FIXTURES_DIR, `${name}.md`)
  return fs.readFile(p, 'utf-8')
}

async function readFixtureJson<T>(name: string): Promise<T> {
  const fs = await import('node:fs/promises')
  const p = path.join(FIXTURES_DIR, `${name}.json`)
  const raw = await fs.readFile(p, 'utf-8')
  return JSON.parse(raw) as T
}

// =================================================================
// 每个 Agent 的输入构造
//
// 设计原则：
//   - 上游 Agent（import / chunk / concept）直接用 fixture 数据
//   - 下游 Agent（module / mission / quiz / feynman / feedback / feynman-eval）
//     使用内联的"参考输入"（canned），保证脚本可独立运行任一 Agent
// =================================================================

interface ConceptCanned {
  id: string
  name: string
  definition: string
  type: 'fact' | 'procedure' | 'theory'
  keyPoints: string[]
  parentChunkId: string
}

interface ChunkCanned {
  id: string
  text: string
  heading: string
}

const CANNED_CONCEPTS: ConceptCanned[] = [
  {
    id: 'concept-1',
    name: 'RAG 索引阶段',
    definition: '把文档切片向量化入库的过程',
    type: 'procedure',
    keyPoints: ['200-800 字符切片', 'embedding 模型选择', '向量数据库存储'],
    parentChunkId: 'chunk-2',
  },
  {
    id: 'concept-2',
    name: '混合检索',
    definition: 'BM25 与向量检索分数融合',
    type: 'theory',
    keyPoints: ['稀疏+密集融合', '缓解精确匹配短板'],
    parentChunkId: 'chunk-3',
  },
  {
    id: 'concept-3',
    name: 'RAG 评估三维度',
    definition: '检索/生成/端到端独立评估',
    type: 'fact',
    keyPoints: ['recall@k 最关键', 'faithfulness 衡量忠实度', '反模式：只看终答'],
    parentChunkId: 'chunk-5',
  },
]

const CANNED_MODULE = {
  id: 'module-1',
  sourceId: 'source-1',
  title: 'RAG 入门',
  intro: '完成本模块后，你能解释 RAG 的索引/检索/生成三阶段',
  goal: '解释 RAG 是什么、为什么需要它、三阶段如何协作',
  concepts: CANNED_CONCEPTS.map((c, i) => ({ ...c, moduleId: 'module-1', order: i + 1 })),
  order: 1,
}

const CANNED_QUIZ_PLACEHOLDER = {
  id: 'concept-1:slot-1',
  conceptId: 'concept-1',
  ladderLevel: 1,
  expressionLevel: 1,
  interactionType: 'choice' as const,
}

const CANNED_QUIZ = {
  id: 'concept-1:slot-1',
  conceptId: 'concept-1',
  ladderLevel: 1,
  expressionLevel: 1,
  interactionType: 'choice' as const,
  stem: 'RAG 的索引阶段主要产出什么？',
  options: ['可被快速检索的向量', '原始 Markdown 文本', 'LLM 的训练数据', '查询字符串'],
  answer: '可被快速检索的向量',
  explanation:
    '索引阶段把文档切片并向量化，结果是存入向量数据库的高维向量；后续检索就基于这些向量做近邻搜索。',
  distractors: ['原始 Markdown 文本', 'LLM 的训练数据', '查询字符串'],
}

const CANNED_FEYNMAN_STEPS = [
  {
    order: 1,
    type: 'choice' as const,
    stem: '解释 RAG 的第一句话应该是什么？',
    options: ['A', 'B', 'C', 'D'],
    answer: 'A',
    explanation: 'x',
  },
  {
    order: 2,
    type: 'choice' as const,
    stem: '接下来解释什么方向？',
    options: ['A', 'B', 'C', 'D'],
    answer: 'B',
    explanation: 'x',
  },
  {
    order: 3,
    type: 'choice' as const,
    stem: '举例？',
    options: ['A', 'B', 'C', 'D'],
    answer: 'C',
    explanation: 'x',
  },
  {
    order: 4,
    type: 'choice' as const,
    stem: '哪个完整解释最好？',
    options: ['优', '良', '一般', '错'],
    answer: '优',
    explanation: 'x',
  },
  {
    order: 5,
    type: 'fill_blank' as const,
    stem: '请补全：RAG 的核心是 ___',
    options: null,
    answer: '检索+生成',
    explanation: 'x',
  },
  {
    order: 6,
    type: 'fill_blank' as const,
    stem: '（占位）',
    options: null,
    answer: '',
    explanation: '',
  },
]

/** 根据 agent + fixture 构造 PromptVariables */
async function buildAgentInput(
  agent: AgentKind,
  fixture: string,
): Promise<Record<string, unknown>> {
  switch (agent) {
    case 'import': {
      const rawMarkdown = await readFixtureText(fixture)
      return { rawMarkdown }
    }
    case 'chunk': {
      const normalizedText = await readFixtureText(fixture)
      return { normalizedText }
    }
    case 'concept': {
      // 优先用 rag-chunks.json；其他 fixture 退化为整篇 md 当单个 chunk
      let chunks: ChunkCanned[]
      if (fixture === 'rag-chunks') {
        const data = await readFixtureJson<{ chunks: ChunkCanned[] }>('rag-chunks')
        chunks = data.chunks
      } else {
        const text = await readFixtureText(fixture)
        chunks = [{ id: 'chunk-1', text, heading: fixture }]
      }
      return { chunks, themeHint: '' }
    }
    case 'module': {
      return { concepts: CANNED_CONCEPTS, themeHint: 'RAG 入门' }
    }
    case 'mission': {
      return { module: CANNED_MODULE, concepts: CANNED_MODULE.concepts }
    }
    case 'quiz-batch': {
      return {
        placeholders: [
          { id: 'concept-1:slot-1', ladderLevel: 1, interactionType: 'choice', expressionLevel: 1 },
        ],
        concept: {
          id: 'concept-1',
          name: 'RAG',
          definition: '检索增强生成',
          keyPoints: ['检索', '生成'],
        },
        moduleContext: { title: '理解 RAG' },
        total: 1,
        conceptName: 'RAG',
        conceptId: 'concept-1',
      }
    }
    case 'challenge-batch': {
      return {
        concepts: CANNED_MODULE.concepts.map((c) => ({
          id: c.id,
          name: c.name,
          definition: c.definition,
          keyPoints: c.keyPoints,
        })),
        moduleContext: CANNED_MODULE,
        total: 3,
        conceptCount: CANNED_MODULE.concepts.length,
      }
    }
    case 'knowledge-expander': {
      return {
        topic: '检索增强生成',
        constraints: '面向有编程基础的学习者',
      }
    }
    case 'quiz': {
      return {
        placeholder: CANNED_QUIZ_PLACEHOLDER,
        concept: CANNED_CONCEPTS[0],
        moduleContext: CANNED_MODULE,
        originalQuiz: null,
        ladderLevel: 1,
        expressionLevel: 1,
        interactionType: 'choice',
      }
    }
    case 'feynman': {
      return { module: CANNED_MODULE, concepts: CANNED_MODULE.concepts }
    }
    case 'feedback': {
      return {
        quiz: CANNED_QUIZ,
        userAnswer: '可被快速检索的向量',
        attemptInfo: { attemptVersion: 0 },
      }
    }
    case 'feynman-eval': {
      return {
        finalPrompt: '请用自己的话完整解释 RAG 是什么、为什么需要、三阶段如何协作',
        rubric: ['RAG 是检索+生成的结合', '解决了 LLM 知识截止/幻觉问题', '三阶段：索引/检索/生成'],
        point: 'RAG 是检索+生成的结合',
        userInput: 'RAG 就是先检索再生成，让 LLM 能基于外部资料回答。',
      }
    }
    default: {
      const exhaustive: never = agent
      throw new Error(`Unsupported agent: ${exhaustive as string}`)
    }
  }
}

// void 一下未使用的常量（CANNED_FEYNMAN_STEPS 预留给 V2 集成测试）
void CANNED_FEYNMAN_STEPS

function extractQuizzes(output: unknown): Array<Record<string, unknown>> {
  if (!output || typeof output !== 'object') return []
  const record = output as Record<string, unknown>
  if (Array.isArray(record.quizzes)) return record.quizzes as Array<Record<string, unknown>>
  if (record.quiz && typeof record.quiz === 'object')
    return [record.quiz as Record<string, unknown>]
  return []
}

function computeEnrichedCoverage(output: unknown): number | undefined {
  const quizzes = extractQuizzes(output)
  if (quizzes.length === 0) return undefined
  const enrichedCount = quizzes.filter((quiz) => {
    const background = quiz.background
    const explanation = quiz.explanation
    const extendedKnowledge = quiz.extendedKnowledge
    return (
      typeof background === 'string' &&
      background.length >= 20 &&
      typeof explanation === 'string' &&
      explanation.length >= 80 &&
      typeof extendedKnowledge === 'string' &&
      extendedKnowledge.length >= 20
    )
  }).length
  return enrichedCount / quizzes.length
}

// =================================================================
// 运行循环
// =================================================================

async function runOnce(args: CliArgs, runIndex: number): Promise<RunResult> {
  const baseConfig = buildLLMConfig(args)
  const rawProvider = createProvider(baseConfig)
  const metricsProvider = new MetricsProvider(rawProvider)

  const schema = getSchema(args.agent)
  const input = await buildAgentInput(args.agent, args.fixture)
  const disableThinking = args.thinking === 'off'

  const start = Date.now()
  try {
    const { data: output } = await runAgent(args.agent, input, metricsProvider, schema, {
      disableThinking,
    })
    return {
      runIndex,
      ok: true,
      attempts: metricsProvider.chatCallCount,
      latencyMs: Date.now() - start,
      enrichedCoverage: computeEnrichedCoverage(output),
    }
  } catch (e) {
    const reason =
      e instanceof AgentOutputError
        ? `${e.kind}/${e.reason}`
        : e instanceof Error
          ? `${e.name}: ${e.message}`
          : String(e)
    return {
      runIndex,
      ok: false,
      attempts: metricsProvider.chatCallCount,
      failureReason: reason,
      latencyMs: Date.now() - start,
    }
  }
}

// =================================================================
// 聚合
// =================================================================

function percentile(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.min(sortedAsc.length - 1, Math.ceil((p / 100) * sortedAsc.length) - 1)
  return sortedAsc[idx] ?? 0
}

function aggregate(results: RunResult[]): Metrics {
  const total = results.length
  const success = results.filter((r) => r.ok).length
  const retryTriggered = results.filter((r) => r.attempts >= 2).length
  const enrichedCoverages = results
    .map((r) => r.enrichedCoverage)
    .filter((v): v is number => typeof v === 'number')
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b)
  const sum = latencies.reduce((a, b) => a + b, 0)
  return {
    totalRuns: total,
    successCount: success,
    failureCount: total - success,
    schemaPassRate: total > 0 ? success / total : 0,
    retryTriggerRate: total > 0 ? retryTriggered / total : 0,
    latencyP50: percentile(latencies, 50),
    latencyP95: percentile(latencies, 95),
    latencyMean: total > 0 ? Math.round(sum / total) : 0,
    failures: results
      .filter((r) => !r.ok)
      .map((r) => ({ runIndex: r.runIndex, reason: r.failureReason ?? 'unknown' })),
    enrichedCoverageMean:
      enrichedCoverages.length > 0
        ? enrichedCoverages.reduce((sum, value) => sum + value, 0) / enrichedCoverages.length
        : undefined,
  }
}

// =================================================================
// 报告输出
// =================================================================

function formatMarkdownReport(args: CliArgs, metrics: Metrics, results: RunResult[]): string {
  const now = new Date().toISOString()
  const lines: string[] = []
  lines.push(`# Prompt Eval 报告 — ${args.provider}/${args.model} · ${args.agent}`)
  lines.push('')
  lines.push(`> 生成时间：${now}`)
  lines.push(`> M2.5 W2 自动产出（scripts/prompt-eval.ts）`)
  lines.push('')
  lines.push('## 配置')
  lines.push('')
  lines.push(`- Agent: \`${args.agent}\``)
  lines.push(`- Provider: \`${args.provider}\``)
  lines.push(`- Model: \`${args.model}\``)
  lines.push(`- Fixture: \`${args.fixture}\``)
  lines.push(`- Runs: ${args.runs}`)
  lines.push(`- Thinking: ${args.thinking}`)
  lines.push('')
  lines.push('## 指标')
  lines.push('')
  lines.push('| 指标 | 值 | 目标（M2.5 §3 基线） |')
  lines.push('|------|----|--------------------|')
  lines.push(`| Schema 通过率 | ${(metrics.schemaPassRate * 100).toFixed(1)}% | ≥ 80% |`)
  lines.push(`| Retry 触发率 | ${(metrics.retryTriggerRate * 100).toFixed(1)}% | ≤ 30% |`)
  lines.push(`| 成功 / 失败 | ${metrics.successCount} / ${metrics.failureCount} | — |`)
  lines.push(`| 延迟 P50 | ${metrics.latencyP50}ms | — |`)
  lines.push(`| 延迟 P95 | ${metrics.latencyP95}ms | — |`)
  lines.push(`| 延迟 Mean | ${metrics.latencyMean}ms | — |`)
  if (typeof metrics.enrichedCoverageMean === 'number') {
    lines.push(
      `| Enriched 字段覆盖率 | ${(metrics.enrichedCoverageMean * 100).toFixed(1)}% | L2/L3 背景覆盖 ≥ 80%；解析 ≥ 80 字；含 extendedKnowledge |`,
    )
  }
  lines.push('')
  if (metrics.failures.length > 0) {
    lines.push('## 失败详情')
    lines.push('')
    lines.push('| run | reason |')
    lines.push('|-----|--------|')
    for (const f of metrics.failures) {
      const r = (f.reason ?? '').replace(/\|/g, '\\|').slice(0, 200)
      lines.push(`| ${f.runIndex} | ${r} |`)
    }
    lines.push('')
  }
  lines.push('## 每次运行')
  lines.push('')
  lines.push('| run | ok | attempts | latencyMs | enrichedCoverage |')
  lines.push('|-----|-----|---------|-----------|------------------|')
  for (const r of results) {
    const enriched =
      typeof r.enrichedCoverage === 'number' ? `${(r.enrichedCoverage * 100).toFixed(1)}%` : '—'
    lines.push(
      `| ${r.runIndex} | ${r.ok ? 'OK' : 'FAIL'} | ${r.attempts} | ${r.latencyMs} | ${enriched} |`,
    )
  }
  lines.push('')
  return lines.join('\n')
}

async function writeReport(args: CliArgs, content: string): Promise<string> {
  await mkdir(REPORTS_DIR, { recursive: true })
  const date = new Date().toISOString().slice(0, 10)
  // 把 fixture 名里的 /（如 edge/very-short）替换为 -，避免被当成目录分隔符
  const safeFixture = args.fixture.replace(/[\\/]/g, '-')
  const safe = `${date}-${args.provider}-${args.model}-${args.agent}-${safeFixture}.md`
  const fp = path.join(REPORTS_DIR, safe)
  await writeFile(fp, content, 'utf-8')
  return fp
}

// =================================================================
// 主入口
// =================================================================

async function main(): Promise<void> {
  loadEnvFile()
  const args = parseArgs(process.argv.slice(2))

  console.log('=== Prompt Eval ===')
  console.log(
    `agent=${args.agent} provider=${args.provider} model=${args.model} fixture=${args.fixture} runs=${args.runs} thinking=${args.thinking}`,
  )

  // 预读 fixture 做存在性校验，提前 fail
  try {
    await buildAgentInput(args.agent, args.fixture)
  } catch (e) {
    console.error(
      `[fixture] 加载 fixture "${args.fixture}" 失败：${e instanceof Error ? e.message : String(e)}`,
    )
    process.exit(4)
  }

  const results: RunResult[] = []
  for (let i = 0; i < args.runs; i++) {
    process.stdout.write(`  [run ${i + 1}/${args.runs}] ...`)
    const r = await runOnce(args, i + 1)
    results.push(r)
    const status = r.ok ? 'OK' : 'FAIL'
    process.stdout.write(` ${status} (${r.attempts} attempts, ${r.latencyMs}ms)\n`)
  }

  const metrics = aggregate(results)
  const report = formatMarkdownReport(args, metrics, results)
  const reportPath = await writeReport(args, report)

  console.log('')
  console.log(`Schema pass rate:    ${(metrics.schemaPassRate * 100).toFixed(1)}%`)
  console.log(`Retry trigger rate:  ${(metrics.retryTriggerRate * 100).toFixed(1)}%`)
  console.log(`Latency P50 / P95:   ${metrics.latencyP50}ms / ${metrics.latencyP95}ms`)
  console.log(`Report written to:   ${reportPath}`)
  process.exit(metrics.failureCount > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error('Eval script crashed:', e)
  process.exit(2)
})
