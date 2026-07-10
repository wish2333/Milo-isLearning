# AI Learning Compiler 技术方案

> **Technical Specification V1.0 — MVP**
> 版本：1.0 | 状态：Draft | 日期：2026-07-06
> 上游文档：[`Product-Specification.md`](./Product-Specification.md) V1.0（设计宪法）、[`PRD.md`](./PRD.md) V1.0（功能需求）
> 本文档定义 HOW：MVP 如何被工程化实现。

---

## 0. 文档说明

### 0.1 文档位置

```
Product-Specification.md       定义 WHY 与设计宪法
       │
       ▼
PRD.md                         定义 WHAT：MVP 交付哪些功能
       │
       ▼
Technical-Specification.md     定义 HOW：架构、模块、接口、实施   ← 本文档
       │
       ▼
UI 设计稿 / Prompt 工程文档 / 排期与任务拆解
```

冲突优先级：**规格书 > PRD > 本技术方案**。技术方案若与上游冲突，上游为准；上游未覆盖的实现细节，以本文档为最终依据。

### 0.2 关键决策（已在撰写前与产品方确认）

| 决策点 | 选定方案 | 理由 |
|--------|---------|------|
| LLM 调用架构 | Next.js API Routes 代理 | 规避浏览器 CORS、API Key 不进 bundle；仍是 Vercel Functions 上的"零自建后端" |
| LLM 供应商 | DeepSeek + GLMCodingPlan 双供应商 | 用户可在设置中切换；Provider 层抽象协议差异 |
| MVP 范围 | 纳入 FR-05 Module Challenge + FR-08 Progress Persistence | 完整闭环对北极星指标（Module 完成率 ≥ 40%）至关重要 |
| Fill Blank 语义判断 | 统一走 Feedback Agent | 无需独立 embedding，逻辑统一，P95 ≤ 1.5s 已覆盖 |
| 前端组件 / 状态 / 样式 | shadcn/ui + Tailwind + Zustand | 社区主流、TS 友好、定制性强，符合"低认知负荷"细腻交互需求 |
| 编译并行 | Promise.all 并发 fetch（上限 6） | 简单直接；并发瓶颈在 LLM 服务端，浏览器线程模型非瓶颈 |
| 数据存储 | LocalStorage + 单 Module 限制（当前 + 最近 3 历史） | 符合 PRD 范围；4.5MB 预警；超过自动淘汰最旧 |

### 0.3 读者

- **前端 / 全栈工程师**：用于架构落地、模块开发、接口对接
- **AI / Prompt 工程师**：用于 Provider 接入、Prompt 集成、Schema 校验
- **QA**：用于测试范围、可靠性指标验证
- **DevOps**：用于部署、环境变量、监控

---

## 1. 系统架构总览

### 1.1 C4 Context 视图

```
                ┌────────────────────────────────────────┐
                │              学习者（User）              │
                │       浏览器中粘贴 Markdown 学习          │
                └──────────────────┬─────────────────────┘
                                   │ HTTPS
                                   ▼
┌──────────────────────────────────────────────────────────────┐
│            Vercel 部署单元（Next.js 15 App）                  │
│                                                              │
│  ┌────────────────────────┐    ┌──────────────────────────┐ │
│  │  客户端（Browser）      │    │  Edge / Node Runtime     │ │
│  │  ────────────────      │    │  ────────────────────    │ │
│  │  • React UI            │◀──▶│  • /api/compile (stream) │ │
│  │  • Zustand stores      │    │  • /api/feedback         │ │
│  │  • LocalStorage 持久化 │    │  • /api/feynman-eval     │ │
│  │  • LLM Key (LS)        │    │  • Provider Adapter      │ │
│  │                        │───┼─▶ Key 通过 Header 传入    │ │
│  └────────────────────────┘    └────────────┬─────────────┘ │
│                                              │               │
└──────────────────────────────────────────────┼───────────────┘
                                               │ HTTPS（服务端转发）
                       ┌───────────────────────┴────────────────┐
                       ▼                                         ▼
            ┌──────────────────────┐               ┌──────────────────────┐
            │   DeepSeek API       │               │   智谱 GLM API       │
            │   (OpenAI 兼容)      │               │   (兼容 + 专属格式)   │
            └──────────────────────┘               └──────────────────────┘
```

### 1.2 部署模型

- **静态资源**：Next.js 静态导出（CSS/JS/字体/图标），由 Vercel Edge CDN 分发
- **动态端点**：`/api/*` 跑在 Vercel Functions（Node.js 20 runtime）
- **无数据库**：所有持久化在浏览器 LocalStorage
- **无服务端的会话状态**：每次 API 调用是无状态的，Key + Provider 偏好由客户端 Header 携带

### 1.3 高层模块划分

```
src/
├── app/                          # Next.js App Router
│   ├── (marketing)/              # 首页、文档等非应用页
│   ├── learn/                    # 学习应用主体
│   │   ├── import/page.tsx       # 导入页
│   │   ├── compiling/page.tsx    # 编译中页（流式进度）
│   │   ├── overview/page.tsx     # 课程概览页
│   │   ├── module/[id]/page.tsx  # Module 学习主体（含状态机路由）
│   │   └── done/page.tsx         # 完成页
│   ├── settings/page.tsx         # LLM 配置、清空数据
│   └── api/
│       ├── compile/route.ts      # SSE 流式编译端点
│       ├── feedback/route.ts     # 运行时 Feedback Agent
│       ├── feynman-eval/route.ts # 费曼 Step 6 评分
│       └── regenerate/route.ts   # 答错重试时生成新题
│
├── lib/
│   ├── providers/                # LLM Provider 抽象层
│   │   ├── types.ts              # LLMProvider interface
│   │   ├── deepseek.ts           # DeepSeek Provider
│   │   ├── glm.ts                # GLM Provider
│   │   ├── openai-compat.ts      # OpenAI 兼容协议通用实现
│   │   └── index.ts              # 工厂：根据用户偏好返回 Provider
│   │
│   ├── compiler/                 # Knowledge Compiler Pipeline
│   │   ├── pipeline.ts           # 编排（7 个 Agent 串联）
│   │   ├── agents/
│   │   │   ├── import.ts
│   │   │   ├── chunk.ts
│   │   │   ├── concept.ts
│   │   │   ├── module.ts
│   │   │   ├── mission.ts
│   │   │   ├── quiz.ts
│   │   │   └── feynman.ts
│   │   ├── schemas/              # Zod Schema（每个 Agent 输出校验）
│   │   ├── prompts/              # Prompt 模板（与 PRD §7 对齐）
│   │   └── progress.ts           # 进度事件发射器
│   │
│   ├── runtime/                  # 学习运行时
│   │   ├── quiz-engine.ts        # 单题作答流程编排
│   │   ├── feedback.ts           # Feedback Agent 客户端
│   │   ├── mastery.ts            # Mastery 计算（纯函数）
│   │   ├── retry-policy.ts       # 答错重试策略
│   │   └── fill-blank.ts         # Fill Blank 标准化匹配（精确部分）
│   │
│   ├── state/                    # Zustand stores
│   │   ├── settings-store.ts     # LLM 配置、Provider 选择
│   │   ├── module-store.ts       # 当前 Module 数据
│   │   ├── progress-store.ts     # 学习进度（持久化）
│   │   └── attempts-store.ts     # AttemptRecord 集合
│   │
│   ├── persistence/              # 持久化层
│   │   ├── repository.ts         # Repository 接口
│   │   ├── local-storage.ts      # LocalStorage 实现
│   │   ├── keys.ts               # Key 命名常量（PRD §8）
│   │   └── quota.ts              # 4.5MB 预警 + 历史淘汰
│   │
│   ├── telemetry/                # 埋点（PRD §11.4）
│   │   └── events.ts
│   │
│   └── utils/                    # 通用工具
│       ├── id.ts                 # nanoid 封装
│       ├── retry.ts              # 通用重试（指数退避）
│       ├── errors.ts             # 错误类型分层
│       └── normalize.ts          # 文本标准化（Fill Blank 用）
│
├── components/                   # UI 组件
│   ├── ui/                       # shadcn/ui 生成的基础组件
│   ├── quiz/                     # Quiz 交互组件
│   │   ├── ChoiceQuiz.tsx
│   │   ├── SortingQuiz.tsx
│   │   ├── FillBlankQuiz.tsx
│   │   └── FeedbackPanel.tsx
│   ├── feynman/                  # 费曼序列组件
│   ├── progress/                 # 进度条、掌握度卡片
│   └── layout/                   # 应用框架
│
└── types/                        # 共享类型（与 PRD §8 对齐）
    ├── domain.ts                 # 领域模型（Module/Concept/Quiz/...）
    ├── api.ts                    # API 请求/响应类型
    └── events.ts                 # 埋点事件类型
```

---

## 2. 技术栈

### 2.1 核心依赖

| 层 | 选型 | 版本 | 用途 |
|----|------|------|------|
| 框架 | Next.js | 15+ (App Router) | 应用框架 + API Routes |
| UI 库 | React | 19+ | 视图渲染 |
| 语言 | TypeScript | 5.5+ strict | 类型安全（禁用 `as any` / `@ts-ignore`） |
| 样式 | Tailwind CSS | 3.4+ | 实用工具样式 |
| 组件 | shadcn/ui | 最新 | 基于 Radix UI 的可定制组件 |
| 状态 | Zustand | 5+ | 全局状态（含 persist middleware） |
| 校验 | Zod | 3+ | 运行时 Schema 校验（Agent 输出） |
| 表单 | react-hook-form | 7+ | Fill Blank 输入控制 |
| 工具 | nanoid | 5+ | ID 生成 |
| 错误 | zod-error | 最新 | Zod 错误友好化 |

### 2.2 不引入的依赖（及理由）

- **Redux / Redux Toolkit**：Zustand 已满足，引入 Redux 增加样板代码
- **axios**：使用原生 `fetch`（Next.js 对 fetch 有缓存语义）
- **swr / react-query**：所有数据来自 LocalStorage 或编译时一次拉取，无服务端查询场景
- **moment / dayjs**：使用原生 `Intl.DateTimeFormat`
- **emotion / styled-components**：Tailwind 已覆盖，避免 CSS-in-JS 运行时开销
- ** lodash **：按需引入或原生实现

### 2.3 LLM Provider SDK 策略

不直接引入 `openai` 或 `@zhipuai/sdk` 包，**自行实现 Provider 层**。原因：

1. DeepSeek 完全兼容 OpenAI 协议，可直接 `fetch` 调用
2. 智谱有专属 SDK，但核心聊天接口也提供 OpenAI 兼容端点
3. 自实现避免依赖膨胀、版本锁定，便于在 API Route 内统一定义重试 / 超时 / 限流

---

## 3. LLM Provider 抽象层

### 3.1 接口定义

```typescript
// lib/providers/types.ts

export type ProviderKind = 'deepseek' | 'glm'

export interface LLMConfig {
  provider: ProviderKind
  apiKey: string
  baseURL?: string  // 可覆盖默认
  model: string     // 具体模型名，如 'deepseek-v4-flash' / 'glm-5.2'
  temperature?: number
  maxTokens?: number
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ChatRequest {
  messages: ChatMessage[]
  temperature?: number
  maxTokens?: number
  /** 要求结构化输出时的 JSON Schema（Provider 适配层处理） */
  jsonSchema?: Record<string, unknown>
  /** 是否流式（编译进度用） */
  stream?: boolean
}

export interface ChatResponse {
  content: string
  finishReason: 'stop' | 'length' | 'content_filter'
  usage: { promptTokens: number; completionTokens: number }
}

export interface LLMProvider {
  /** 主调用入口 */
  chat(req: ChatRequest): Promise<ChatResponse>
  /** 流式调用（AsyncIterable，逐 token） */
  chatStream(req: ChatRequest): AsyncIterable<ChatResponse>
  /** 健康检查（设置页用） */
  ping(): Promise<{ ok: boolean; latencyMs: number; message?: string }>
}
```

### 3.2 Provider 实现

**OpenAI 兼容协议通用实现**（DeepSeek 复用）：

```typescript
// lib/providers/openai-compat.ts

export class OpenAICompatProvider implements LLMProvider {
  constructor(private config: LLMConfig) {}

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const body = {
      model: this.config.model,
      messages: req.messages,
      temperature: req.temperature ?? this.config.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? this.config.maxTokens,
      ...(req.jsonSchema
        ? {
            response_format: { type: 'json_object' },
            schema: req.jsonSchema,
          }
        : {}),
    }
    // fetch 实现 + 重试 + 超时（见 §3.4）
  }

  async *chatStream(req: ChatRequest): AsyncIterable<ChatResponse> {
    // SSE 解析
  }

  async ping(): Promise<{ ok: boolean; latencyMs: number; message?: string }> {
    // 简短 hello 调用
  }
}
```

**DeepSeek Provider**：

```typescript
// lib/providers/deepseek.ts
export const deepseekDefaults = {
  baseURL: 'https://api.deepseek.com',
  model: 'deepseek-v4-flash',
  temperature: 0.7,
}
export const DeepSeekProvider = (c: LLMConfig) =>
  new OpenAICompatProvider({ ...deepseekDefaults, ...c })
```

> DeepSeek baseURL **不带 `/v1`**（与 OpenAI 兼容协议差异）。旧模型 ID `deepseek-chat` / `deepseek-reasoner` 2026-07-24 退役，改用 `deepseek-v4-flash` / `deepseek-v4-pro`。

**GLM Coding Plan Provider**（智谱，本仓库默认走 Coding Plan 端点）：

```typescript
// lib/providers/glm.ts
export const glmDefaults = {
  baseURL: 'https://open.bigmodel.cn/api/coding/paas/v4',
  model: 'glm-5.2',
  temperature: 0.7,
}
export const GLMProvider = (c: LLMConfig) =>
  new OpenAICompatProvider({ ...glmDefaults, ...c })
```

> Coding Plan 与公开端点的区别仅在 baseURL 路径（`/api/coding/paas/v4` vs `/api/paas/v4`），同一份 API Key 通过不同 baseURL 路由到不同计费来源。ProviderKind 仍为 `'glm'`，是否使用 Coding Plan 由 `LLMConfig.baseURL` 决定。若未来发现协议差异（如 tool calling 格式），在 `glm.ts` 中覆盖方法即可，不污染通用实现。

### 3.3 工厂

```typescript
// lib/providers/index.ts
export function createProvider(config: LLMConfig): LLMProvider {
  switch (config.provider) {
    case 'deepseek': return DeepSeekProvider(config)
    case 'glm':      return GLMProvider(config)
    default:
      throw new Error(`Unsupported provider: ${config.provider}`)
  }
}
```

### 3.4 重试与超时

通用策略（在 `OpenAICompatProvider` 内）：

| 错误类型 | 重试 | 退避 |
|---------|------|------|
| 429（限流） | 2 次 | 指数：1s → 2s → 4s |
| 5xx（服务端） | 2 次 | 指数：500ms → 1s → 2s |
| 网络超时（30s） | 1 次 | 1s |
| 4xx（除 429） | 0 次 | 立即抛出 |
| JSON Schema 校验失败 | 1 次 | 0ms，重新请求并附加 schema 提示 |

> JSON Schema 校验失败重试时，在原 messages 后追加 system 消息：「上一次响应未通过校验：{错误}。请严格遵守 Schema。」PRD NFR-R4 要求。

---

## 4. Knowledge Compiler Pipeline

### 4.1 流水线编排

7 个 Agent 按 PRD §7 与 Spec §3.1 串联。Quiz Agent 在每个 Concept 内并行。

```typescript
// lib/compiler/pipeline.ts

export interface CompileProgressEvent {
  stage:
    | 'import'    // 25%
    | 'chunk'     // 40%
    | 'concept'   // 55%
    | 'module'    // 65%
    | 'mission'   // 70%（占位符生成完成，开始并行生成 Quiz）
    | 'quiz'      // 80%（含 progress: 0..1）
    | 'feynman'   // 100%
    | 'error'
  progress: number  // 0..1
  message: string
  error?: { stage: string; reason: string; retryable: boolean }
}

export async function* compile(
  source: KnowledgeSource,
  provider: LLMProvider,
): AsyncIterable<CompileProgressEvent> {
  // 1. Import
  yield { stage: 'import', progress: 0.10, message: '标准化输入文本…' }
  const normalized = await runAgent('import', source.content, provider, importSchema)
  yield { stage: 'import', progress: 0.25, message: '输入标准化完成' }

  // 2. Chunk
  yield { stage: 'chunk', progress: 0.30, message: '语义切分知识块…' }
  const chunks = await runAgent('chunk', normalized, provider, chunkSchema)
  yield { stage: 'chunk', progress: 0.40, message: `切分为 ${chunks.length} 个知识块` }

  // 3. Concept
  yield { stage: 'concept', progress: 0.45, message: '提取原子概念…' }
  const concepts = await runAgent('concept', chunks, provider, conceptSchema)
  yield { stage: 'concept', progress: 0.55, message: `提取 ${concepts.length} 个概念` }

  // 4. Module（聚类）
  yield { stage: 'module', progress: 0.58, message: '构建学习模块…' }
  const moduleSkeleton = await runAgent('module', concepts, provider, moduleSchema)
  yield { stage: 'module', progress: 0.65, message: '模块结构生成' }

  // 5. Mission（占位符）
  yield { stage: 'mission', progress: 0.68, message: '编排练习序列…' }
  const placeholders = await runAgent('mission', moduleSkeleton, provider, missionSchema)
  yield { stage: 'mission', progress: 0.70, message: `共 ${countQuizzes(placeholders)} 道练习待生成` }

  // 6. Quiz（并行）
  yield { stage: 'quiz', progress: 0.70, message: '并行生成练习题…' }
  const quizzes = await generateQuizzesParallel(
    placeholders,
    provider,
    (done, total) => {
      // 通过 closure 向外发进度（下面会包装为 AsyncIterable）
      emitQuizProgress(done, total)
    },
  )
  yield { stage: 'quiz', progress: 0.80, message: '练习题生成完成' }

  // 7. Feynman
  yield { stage: 'feynman', progress: 0.85, message: '设计费曼任务…' }
  const feynmanTask = await runAgent('feynman', moduleSkeleton, provider, feynmanSchema)

  const module = assemble(moduleSkeleton, quizzes, feynmanTask)
  yield { stage: 'feynman', progress: 1.00, message: '编译完成', }
  return module
}
```

### 4.2 Quiz 并行生成

```typescript
// lib/compiler/agents/quiz.ts

const MAX_CONCURRENCY = 6  // 经验值；过高压 LLM 限流，过低拖时长

export async function generateQuizzesParallel(
  placeholders: QuizPlaceholder[],
  provider: LLMProvider,
  onProgress: (done: number, total: number) => void,
): Promise<Quiz[][]> {
  const results = new Array(placeholders.length)
  let done = 0

  // 简单的分批并发
  for (let i = 0; i < placeholders.length; i += MAX_CONCURRENCY) {
    const batch = placeholders.slice(i, i + MAX_CONCURRENCY)
    const batchResults = await Promise.all(
      batch.map(async (placeholder, j) => {
        try {
          return await runAgent('quiz', placeholder, provider, quizSchema)
        } finally {
          done += 1
          onProgress(done, placeholders.length)
        }
      }),
    )
    batchResults.forEach((r, j) => { results[i + j] = r })
  }
  return results
}
```

### 4.3 Agent 调用通用模板

```typescript
// lib/compiler/agents/_runner.ts

export async function runAgent<T>(
  kind: AgentKind,         // 'import' | 'chunk' | ...
  input: unknown,
  provider: LLMProvider,
  schema: ZodSchema<T>,
): Promise<T> {
  const messages = buildPrompt(kind, input)
  for (let attempt = 0; attempt <= 1; attempt++) {
    const response = await provider.chat({
      messages,
      temperature: 0.7,
      jsonSchema: schemaToJSON(schema),
    })
    const raw = safeParseJSON(response.content)
    if (!raw.ok) {
      if (attempt === 0) {
        messages.push({
          role: 'system',
          content: `上一次响应不是合法 JSON：${raw.error}。请严格返回 JSON。`,
        })
        continue
      }
      throw new AgentOutputError(kind, 'invalid_json', response.content)
    }
    const parsed = schema.safeParse(raw.value)
    if (parsed.success) return parsed.data
    if (attempt === 0) {
      messages.push({
        role: 'system',
        content: `上一次响应未通过 Schema 校验：${formatZodError(parsed.error)}。请修正。`,
      })
      continue
    }
    throw new AgentOutputError(kind, 'schema_violation', JSON.stringify(parsed.error.issues))
  }
  // 不可达
  throw new Error('unreachable')
}
```

### 4.4 Prompt 模板组织

```
lib/compiler/prompts/
├── import.md
├── chunk.md
├── concept.md
├── module.md
├── mission.md
├── quiz.md
├── feynman.md
└── _shared/
    ├── json-output-rules.md
    ├── ladder-level-explanation.md
    └── expression-level-explanation.md
```

每个 `.md` 文件即为该 Agent 的 Prompt 模板，**支持 `{变量}` 占位符**。编译时通过简单字符串替换注入输入。

理由：

- Prompt 与代码解耦，AI 工程师可独立迭代
- 便于 A/B 测试不同 Prompt 版本（按文件名后缀管理，如 `quiz.v2.md`）
- 版本控制天然支持

### 4.5 编译进度反馈（API 端点）

```typescript
// app/api/compile/route.ts

export async function POST(req: Request): Promise<Response> {
  const { source, llmConfig } = await req.json()
  const provider = createProvider(llmConfig)

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder()
      try {
        for await (const event of compile(source, provider)) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(event)}\n\n`),
          )
        }
      } catch (e) {
        const errorEvent: CompileProgressEvent = {
          stage: 'error',
          progress: 0,
          message: '',
          error: {
            stage: e instanceof AgentOutputError ? e.kind : 'unknown',
            reason: e.message,
            retryable: !(e instanceof AgentOutputError),
          },
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorEvent)}\n\n`))
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
```

客户端通过 `EventSource` 或 `fetch` + ReadableStream 消费。

---

## 5. Learning Runtime（学习运行时）

### 5.1 Module 学习状态机

PRD §5.1 主流程对应一个有限状态机。MVP 使用显式状态机而非状态分散在 UI。

```typescript
// lib/state/progress-store.ts

export type ModuleStage =
  | { kind: 'module_intro' }
  | { kind: 'concept'; conceptIndex: number; quizIndex: number }
  | { kind: 'challenge'; quizIndex: number }
  | { kind: 'feynman_intro' }
  | { kind: 'feynman_step'; stepOrder: 1 | 2 | 3 | 4 | 5 }
  | { kind: 'feynman_final' }
  | { kind: 'done' }

export interface ProgressState {
  moduleId: string
  stage: ModuleStage
  updatedAt: number
}
```

**转移规则**（关键路径）：

| 当前 | 触发 | 下一个 |
|------|------|--------|
| `module_intro` | 用户点击"开始" | `concept(0, 0)` |
| `concept(i, q)` | Quiz `next_action=advance` 且非末题 | `concept(i, q+1)` |
| `concept(i, 末题)` | advance | `concept(i+1, 0)` 或 `challenge(0)`（若 i 是最后 Concept） |
| `challenge(q)` | advance 且非末题 | `challenge(q+1)` |
| `challenge(末题)` | advance | `feynman_intro` |
| `feynman_intro` | 用户点击"开始费曼" | `feynman_step(1)` |
| `feynman_step(k)` | advance（k=1..4 时错答也 advance） | `feynman_step(k+1)`（k<5）或 `feynman_final`（k=5） |
| `feynman_final` | 提交最终输出 | `done` |

> 答错 retry 不进入状态机转移，而是替换当前 `quiz` 引用（详见 §5.3）。

### 5.2 单题作答流程

```typescript
// lib/runtime/quiz-engine.ts

export interface QuizAttemptResult {
  score: number
  gaps: string[]
  nextAction: 'advance' | 'retry'
  feedbackText: string
  /** retry 时，新生成的同类型 Quiz */
  replacementQuiz?: Quiz
  /** 该 quiz 的连续答错次数（用于 3 次强制 advance） */
  consecutiveFailures: number
}

export async function gradeAttempt(
  quiz: Quiz,
  userAnswer: string,
  attemptHistory: AttemptRecord[],
  provider: LLMProvider,
): Promise<QuizAttemptResult> {
  // 1. 调用 Feedback Agent（/api/feedback）
  const feedback = await callFeedback({ quiz, userAnswer }, provider)

  // 2. Fill Blank 的精确匹配兜底（NFR-P2：Feedback Agent P95 ≤ 1.5s）
  //    如果 Feedback 判错但用户答案标准化后命中，覆盖为 advance
  //    （双策略 PRD §10.5：任一通过即判正确）

  // 3. 计算连续失败次数
  const recent = takeLast(attemptHistory, quiz.id, 3)
  const consecutiveFailures = feedback.nextAction === 'retry'
    ? recent.recentConsecutiveFailures + 1
    : 0

  // 4. 触发 3 次失败强制 advance（FR-04 约束）
  let nextAction = feedback.nextAction
  if (consecutiveFailures >= 3) {
    nextAction = 'advance_force'
  }

  // 5. retry 时拉取新题（/api/regenerate）
  let replacementQuiz: Quiz | undefined
  if (nextAction === 'retry') {
    replacementQuiz = await callRegenerate(
      { conceptId: quiz.conceptId, ladderLevel: quiz.ladderLevel,
        interactionType: quiz.interactionType, expressionLevel: quiz.expressionLevel,
        originalDistractors: quiz.distractors },
      provider,
    )
  }

  return { ...feedback, nextAction, replacementQuiz, consecutiveFailures }
}
```

### 5.3 答错重试的状态语义

答错时不改变 `ProgressState`（仍在同一 `quizIndex`），但 `quiz` 数据本身被替换：

- `AttemptRecord` 中记录 `originalQuizId`（始终指向最初的 Quiz）+ `attemptVersion`（第几次重试）
- `module-store` 中当前 `Quiz` 引用替换为 `replacementQuiz`
- Mastery 计算用 `originalQuizId` 聚合，统计"首次答对率"（FR-07）

```typescript
interface AttemptRecord {
  id: string
  quizId: string           // 当前实际作答的 quiz（可能是 replacement）
  originalQuizId: string   // 概念位置上的"槽位" id（用于 Mastery 计算）
  attemptVersion: number   // 0=首次，1=第一次重试，…
  userAnswer: string
  score: number
  gaps: string[]
  nextAction: 'advance' | 'retry'
  timestamp: number
}
```

### 5.4 Mastery 计算（纯函数）

```typescript
// lib/runtime/mastery.ts

export function computeMastery(
  module: Module,
  attempts: AttemptRecord[],
  feynmanAttempt?: FeynmanAttempt,
): Mastery {
  const conceptMastery = module.concepts.map(concept => {
    const slotAttempts = attempts.filter(a => a.originalQuizId.startsWith(concept.id))
    // 每道槽位取首次尝试
    const slots = uniq(slotAttempts.map(a => a.originalQuizId))
    const firstAttempts = slots.map(slot =>
      slotAttempts.find(a => a.originalQuizId === slot && a.attemptVersion === 0),
    )
    const correctFirst = firstAttempts.filter(a => a && a.score >= 80).length
    return {
      conceptId: concept.id,
      mastery: slots.length === 0 ? 0 : Math.round((correctFirst / slots.length) * 100),
    }
  })

  const totalQuizzes = countAllQuizzes(module) + module.feynmanTask.steps.length
  const completedQuizzes = uniq(attempts.map(a => a.originalQuizId)).length
    + (feynmanAttempt?.stepResults.length ?? 0)
  const moduleCompletion = Math.round((completedQuizzes / totalQuizzes) * 100)

  return {
    moduleId: module.id,
    moduleCompletion: Math.min(100, moduleCompletion),
    conceptMastery,
    feynmanCompleted: !!feynmanAttempt?.finalScore,
    feynmanScore: feynmanAttempt?.finalScore,
  }
}
```

> 注：实现细节（如槽位 id 命名 `{conceptId}:{slotIndex}`）在编译期固定，运行时不重排。

### 5.5 Feynman Step 6 评分流程

调用 `/api/feynman-eval`：

```typescript
// app/api/feynman-eval/route.ts

export async function POST(req: Request) {
  const { finalPrompt, rubric, userOutput, llmConfig } = await req.json()
  const provider = createProvider(llmConfig)
  const result = await runFeynmanEval(provider, { finalPrompt, rubric, userOutput })
  return Response.json(result)
}

async function runFeynmanEval(
  provider: LLMProvider,
  input: { finalPrompt: string; rubric: string[]; userOutput: string },
): Promise<FeynmanEvalResult> {
  const messages = buildFeynmanEvalPrompt(input)
  const response = await provider.chat({ messages, temperature: 0.2, jsonSchema: feynmanEvalSchema })
  const parsed = feynmanEvalSchema.parse(JSON.parse(response.content))
  return parsed
}
```

评分宽容策略（PRD §7.9）：在 Prompt 中明确「触及关键点的核心含义即视为 hit，不要求字面一致」。

---

## 6. State Management（Zustand）

### 6.1 Store 划分

| Store | 职责 | 持久化 |
|-------|------|--------|
| `settings-store` | LLM Provider 选择、API Key、模型名 | 是（LocalStorage） |
| `module-store` | 当前编译产物 Module + 当前阶段路由 | 是（与 progress 合并） |
| `progress-store` | `ProgressState`（学习状态机） | 是 |
| `attempts-store` | `AttemptRecord[]`（按 moduleId 组织） | 是 |
| `mastery-store` | 衍生数据，由 `computeMastery` 计算；仅缓存 | 否（每次启动重算） |
| `compile-store` | 编译过程临时状态（事件流、错误） | 否 |

### 6.2 Settings Store 示例

```typescript
// lib/state/settings-store.ts

interface SettingsState {
  llmConfig: LLMConfig | null
  setLLMConfig: (c: LLMConfig) => void
  clear: () => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      llmConfig: null,
      setLLMConfig: (c) => set({ llmConfig: c }),
      clear: () => set({ llmConfig: null }),
    }),
    {
      name: 'alc:settings',
      // API Key 持久化到 LocalStorage 是 PRD NFR-S2 明确允许的
      // （用户自带 Key，不上传服务端；服务端不存储）
    },
  ),
)
```

### 6.3 编译产物与历史的淘汰

```typescript
// lib/persistence/quota.ts

const MAX_HISTORY = 3  // 当前 1 + 历史 3 = 最多 4 个 Module
const WARN_BYTES = 4.5 * 1024 * 1024

export function enforceQuota(): { warned: boolean; evicted: string[] } {
  const modules = listAllModules()
  const evicted: string[] = []
  while (modules.length > MAX_HISTORY) {
    const oldest = modules.shift()!
    deleteModule(oldest.id)
    evicted.push(oldest.id)
  }
  const totalBytes = estimateTotalBytes()
  return { warned: totalBytes > WARN_BYTES, evicted }
}

function estimateTotalBytes(): number {
  let total = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)!
    const value = localStorage.getItem(key)!
    total += key.length + value.length
  }
  return total * 2  // UTF-16 在大多数浏览器中每字符占 2 字节
}
```

---

## 7. 数据流（时序图）

### 7.1 编译流程

```
浏览器                      /api/compile          LLM Provider
  │                            │                       │
  │  POST source + llmConfig  │                       │
  │──────────────────────────▶│                       │
  │                            │                       │
  │  SSE: stage=import p=0.10 │                       │
  │◀───────────────────────────│                       │
  │                            │  chat (import)        │
  │                            │──────────────────────▶│
  │                            │◀──────────────────────│
  │  SSE: stage=import p=0.25  │                       │
  │◀───────────────────────────│                       │
  │                            │  …… 依次 chunk/concept/module/mission ……
  │  SSE: stage=quiz p=0.70..0.80                     │
  │◀───────────────────────────│  (并发 6 路 chat)     │
  │                            │──────────────────────▶│
  │                            │──────────────────────▶│
  │                            │──────────────────────▶│
  │                            │◀──────────────────────│ × 6
  │  SSE: stage=feynman p=0.85 │                       │
  │◀───────────────────────────│                       │
  │  SSE: stage=feynman p=1.00 │                       │
  │◀───────────────────────────│                       │
  │  连接关闭                   │                       │
  │◀───────────────────────────│                       │
  │                            │                       │
  │  写 LocalStorage           │                       │
```

### 7.2 答题流程（含 retry）

```
浏览器                      /api/feedback         /api/regenerate
  │                            │                       │
  │  POST {quiz, userAnswer}   │                       │
  │──────────────────────────▶│                       │
  │                            │  chat (feedback)      │
  │  返回 {score, gaps, action}│◀───── LLM ────────────│
  │◀──────────────────────────│                       │
  │                            │                       │
  │  若 retry：POST 占位符     │                       │
  │──────────────────────────────────────────────────▶│
  │                                                  │  chat (quiz)
  │  返回新 Quiz                                     │◀── LLM ──
  │◀─────────────────────────────────────────────────│
  │                                                  │
  │  替换 module-store 中当前 Quiz                    │
  │  重渲染                                            │
```

---

## 8. 错误处理与可靠性

### 8.1 错误分层

```typescript
// lib/utils/errors.ts

export class AppError extends Error {
  constructor(
    public readonly kind:
      | 'config_missing'      // 未配置 LLM Key
      | 'compile_failed'      // 编译失败
      | 'agent_output'        // Agent 输出不合法
      | 'llm_rate_limit'      // 429
      | 'llm_unavailable'     // 5xx
      | 'quota_exceeded'      // LocalStorage 满
      | 'network'             // 网络错误
      | 'unknown',
    message: string,
    public readonly retryable: boolean = false,
    public readonly userAction?: string,  // 给用户的可操作建议
  ) { super(message) }
}

export class AgentOutputError extends AppError {
  constructor(
    public readonly agentKind: AgentKind,
    subKind: 'invalid_json' | 'schema_violation',
    raw: string,
  ) {
    super('agent_output', `Agent ${agentKind} 输出不合法（${subKind}）`, true,
          '该步骤可重试；若反复失败请检查 LLM 模型是否支持 JSON 输出。')
  }
}
```

### 8.2 用户可见的错误提示

所有错误经 `errorToUserMessage(err)` 转换：

| 错误 | 提示 | 操作 |
|------|------|------|
| `config_missing` | 「请先在设置中配置 LLM API Key」 | 跳转设置页 |
| `compile_failed` (network) | 「网络不稳定，编译已中断」 | 「重试」按钮 |
| `agent_output` (重试 1 次后) | 「AI 输出不符合规范，已自动重试一次仍失败。请更换模型或稍后再试」 | 「更换模型」「稍后重试」 |
| `llm_rate_limit` | 「LLM 服务繁忙，请稍后再试」 | 自动倒计时 5s 重试 |
| `quota_exceeded` | 「本地存储已满（{used}MB/{limit}MB）。建议清理历史 Module」 | 「管理存储」 |

### 8.3 进度防丢失

- 每次作答后立即写 LocalStorage（NFR-R3）：在 `attempts-store` 的 `addAttempt` action 内同步触发持久化
- 编译成功后立即持久化 Module（即使后续 Feynman 评分失败，Module 数据已落地）
- Progress Store 用 Zustand `persist` middleware 自动同步

---

## 9. Prompt 工程架构

### 9.1 Prompt 与代码的边界

```
Prompt 模板（.md 文件，AI 工程师维护）
        │
        ▼
buildPrompt(kind, input) —— 字符串替换 + 拼接 shared 片段
        │
        ▼
Zod Schema（前端工程师维护） —— 校验输出结构
        │
        ▼
runAgent(kind, input, provider, schema) —— 调用 + 重试 + 校验
```

### 9.2 Prompt 共享片段

`_shared/json-output-rules.md`：

```
你的响应必须是合法 JSON，遵循以下规则：
1. 不要在 JSON 外添加任何文字（无 ```json 代码块、无注释）
2. 字符串字段必须转义引号
3. 数组字段若为空，使用 []
4. 不要输出未在 Schema 中定义的字段
```

### 9.3 Prompt 版本管理

- 每个 Prompt 文件用 git 管理
- 单次实验性修改在副本（如 `quiz.experimental.md`）中进行
- 通过环境变量 `PROMPT_VERSION` 选择版本（开发期）；生产固定主版本

### 9.4 Schema 校验示例（Concept Agent）

```typescript
// lib/compiler/schemas/concept.ts

export const conceptSchema = z.object({
  concepts: z.array(z.object({
    name: z.string().min(1).max(20),
    definition: z.string().min(1).max(30),
    type: z.enum(['fact', 'procedure', 'theory']),
    keyPoints: z.array(z.string().min(1).max(15)).min(2).max(4),
    parentChunkId: z.string(),
  })).min(2).max(5),
})

export type ConceptAgentOutput = z.infer<typeof conceptSchema>
```

> 字段长度约束直接对应 PRD §7.3 的"definition ≤ 30 字 / keyPoints 每条 ≤ 15 字"等规则。

---

## 10. 性能优化

### 10.1 编译时长（NFR-P1: P95 ≤ 60s）

| 措施 | 预期收益 |
|------|---------|
| Quiz 并行（上限 6） | 单 Concept 内 8-15 题，串行约 20-40s → 并行约 5-10s |
| 选择响应快的模型（DeepSeek-v4-flash / glm-5-turbo 用于非关键步骤） | 单次 chat 从 3-5s 降至 1-2s |
| 模型分层：Chunk / Concept / Module 用快速模型，Quiz / Feynman 用更强模型 | 兼顾成本与质量 |
| Prompt 精炼（避免冗长 system 消息） | 减少 prompt tokens |
| JSON Schema 约束（避免重试） | 重试一次等于 +1 次 LLM 调用 |

### 10.2 Feedback 响应（NFR-P2: P95 ≤ 1.5s）

- 使用 `glm-5-turbo` 或 `deepseek-v4-flash` 而非大模型
- 简化 Feedback Prompt（只判断对错 + 简短反馈）
- Fill Blank 精确匹配兜底：若标准化后命中，跳过 LLM 调用（直接返回 100 分）

```typescript
// lib/runtime/fill-blank.ts

export function tryExactMatch(userAnswer: string, correctAnswer: string): boolean {
  return normalize(userAnswer) === normalize(correctAnswer)
}

function normalize(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)) // 全角→半角
    .replace(/[^\w\u4e00-\u9fa5]/g, '')  // 去标点
}
```

### 10.3 首屏加载（NFR-P4: FCP ≤ 1.5s）

- Next.js 自动代码分割
- shadcn/ui 按需引入（不引入整包）
- 学习主体路由 `learn/module/[id]` 单独 bundle，首页保持极轻
- 字体子集化，仅加载中文常用 3500 字 + 英文

### 10.4 单题交互响应（NFR-P5: ≤ 100ms）

- 答案提交后立即 UI 反馈（loading 态），不等 LLM 响应
- LLM 响应到达后再切换为最终反馈态

---

## 11. 安全与隐私

### 11.1 API Key 流转

```
设置页输入 Key
      │
      ▼
存 LocalStorage（alc:settings）
      │
      ▼ (用户触发编译 / 答题)
通过 fetch Header 携带：X-LLM-Provider: deepseek
                        X-LLM-Key: <key>     ← 仅 HTTPS，不进 URL
                         X-LLM-Model: deepseek-v4-flash
      │
      ▼
Vercel Function 读取 Header，转发到 LLM API（不在 Function 内缓存）
      │
      ▼
LLM 调用结束，Function 返回结果（不含 Key）
```

**安全审计要点**：

- Key 不进任何 console.log / 错误上报
- Function 不持久化 Key（无文件 / 无环境变量 / 无 KV）
- Vercel Access Logs 默认不记录 request body（确认 Vercel 政策）
- 设置页提供"显示 / 隐藏 Key"开关
- 教育用户：浏览器 LocalStorage 可被同源 JS 读取，勿在公共电脑长期保存

### 11.2 用户数据

- 用户输入的 Markdown 仅发送给 LLM API，不存服务端
- 编译产物 / Attempt / Mastery 全部存浏览器 LocalStorage
- 不引入任何第三方分析（GA / Sentry 默认不上报内容字段）

---

## 12. 部署与运维

### 12.1 Vercel 配置

```json
// vercel.json
{
  "functions": {
    "app/api/compile/route.ts": {
      "maxDuration": 60
    },
    "app/api/feedback/route.ts": {
      "maxDuration": 10
    },
    "app/api/feynman-eval/route.ts": {
      "maxDuration": 15
    }
  }
}
```

> Vercel Hobby Plan Functions 上限 60s（与 NFR-P1 P95 ≤ 60s 对齐）。Pro Plan 可放宽到 300s。

### 12.2 环境变量

```bash
# 应用层
NEXT_PUBLIC_APP_VERSION=1.0.0

# 默认 Provider 配置（可选；不设则要求用户首次访问时配置）
DEFAULT_LLM_PROVIDER=deepseek
DEFAULT_LLM_MODEL=deepseek-v4-flash

# 埋点（可选，MVP 用 console，未来接入 PostHog / Mixpanel）
TELEMETRY_BACKEND=console
```

### 12.3 监控

- MVP 不接外部 APM
- 通过埋点事件（PRD §11.4）在客户端 console 打印，开发期排查
- 上线后通过用户反馈 + console 复现问题

---

## 13. 测试策略

### 13.1 单元测试（Vitest）

覆盖范围：

- `computeMastery`：边界值（空 attempts / 全对 / 全错 / 部分重试）
- `enforceQuota`：超限淘汰策略
- `normalize`（Fill Blank）：全半角、大小写、标点
- 状态机转移函数：所有合法转移 + 非法转移拒绝
- `errorToUserMessage`：所有错误类型映射
- Quiz 数据结构校验（用 Zod schema 跑样本）

### 13.2 Agent 单测（M2 里程碑）

每个 Agent 准备 3-5 个**固定输入**（如 RAG 讲义片段），断言：

1. 输出通过 Zod Schema 校验
2. 输出符合 PRD 约束（Concept 数 ∈ [2,5]，Quiz 数 ∈ [8,15]，等）
3. 评分题（Feynman Eval）对固定范文的评分稳定性（多次运行方差 ≤ 5）

LLM 调用录制（mock）保证测试可重复。

### 13.3 集成测试

- 编译 → 学习循环 → Feynman → 完成 全流程，用一个 1000 字测试 Markdown
- 答错重试机制：模拟 3 次连续答错，验证强制 advance
- 进度持久化：刷新页面后恢复到同一 `ProgressState`

### 13.4 E2E 测试（Playwright）

- 主流程：粘贴 Markdown → 编译（mock LLM）→ 走完 Module → 看到完成页
- 关键交互：Choice / Sorting / Fill Blank 三种题型的作答反馈
- 响应式：桌面 / 平板 / 手机三档断点视觉校验

### 13.5 不在 MVP 范围

- 性能压测（手动抽样验证 P50/P95 即可）
- 安全渗透测试（无敏感数据 + 无服务端状态，攻击面极小）

---

## 14. 与 PRD 的映射表

| PRD 章节 | 本技术方案章节 | 实现要点 |
|---------|--------------|---------|
| FR-01 知识导入 | §1.3 路由 `learn/import` + §6.1 settings | 粘贴 / 上传 + 字数校验 |
| FR-02 Knowledge Compiler | §4 编译流水线 | 7 Agent 串联 + 并行 Quiz + SSE 进度 |
| FR-03 Quiz 交互 | §1.3 `components/quiz/` | Choice / Sorting / Fill Blank 三组件 |
| FR-04 反馈与重试 | §5.2 单题作答流程 + §5.3 状态语义 | 3 次强制 advance + replacementQuiz |
| FR-05 Module Challenge | §5.1 状态机 `challenge` 分支 | MVP 纳入 |
| FR-06 Module Feynman | §5.5 Feynman 评分流程 + `components/feynman/` | 6 步序列 + Rubric |
| FR-07 掌握度追踪 | §5.4 Mastery 纯函数 | 每次作答后重算 |
| FR-08 进度持久化 | §6.3 + §8.3 | Zustand persist + 每次作答同步写 |
| NFR-P1 编译 ≤ 60s | §10.1 | 并行 + 模型分层 + Schema 防 retry |
| NFR-P2 Feedback ≤ 1.5s | §10.2 | 快速模型 + 精确匹配兜底 |
| NFR-S1 数据 LocalStorage | §6 + §11.2 | 不上传服务端 |
| NFR-S2 Key 管理 | §11.1 | Header 传递，Function 不缓存 |
| §7 AI Agent 规格 | §9 Prompt 工程 | Prompt 模板 + Zod Schema |
| §8 数据模型 | `types/domain.ts` | 直接照搬 PRD 接口 |
| §11.4 埋点 | §1.3 `lib/telemetry` | 13 个事件 |

---

## 15. 风险与缓解

| 风险 | 等级 | 缓解 |
|------|------|------|
| DeepSeek / GLM 并发限流（编译期 6 路并发） | 高 | 监控 429；指数退避；动态降低并发到 3 |
| Vercel Functions 60s 上限与 NFR-P1 P95 边界贴合 | 中 | 编译总时长预留 10% buffer；失败时提示用户重试 |
| Quiz Agent 并发中部分失败导致 Concept 残缺 | 中 | 单题失败重试 2 次；仍失败则跳过该槽位并在 Module 中标记，运行时 Feedback Agent 检测到缺失时容错 |
| Fill Blank 标准化匹配遗漏某些表达 | 中 | 完整匹配兜底失败 → 走 Feedback Agent 语义判断 |
| 用户 Key 配置错误导致全流程阻塞 | 中 | 设置页 `provider.ping()` 健康检查；错误提示明确指向设置 |
| LocalStorage 在隐私模式下不可用 | 低 | 检测 `localStorage` 可用性；不可用时降级为内存存储并提示用户 |
| 模型 JSON 输出不稳定 | 中 | Schema 校验 + 重试 + Prompt 强化（_shared/json-output-rules） |

---

## 16. 实施计划与里程碑映射

> 与 PRD §14 里程碑对齐。本节给出技术层面的交付物。

| 里程碑 | 周次 | 技术交付物 |
|--------|------|-----------|
| **M1: 技术方案 + UI 高保真** | W1-2 | 本文档定稿 / 项目脚手架 / `types/domain.ts` / Provider 抽象层 + DeepSeek/GLM 接入并通过 ping 测试 |
| **M2: Prompt 工程闭环** | W2-3 | 7 Agent Prompt 模板 / Zod Schema / 单 Agent 单测（含 mock LLM） |
| **M3: Knowledge Compiler 闭环** | W3-5 | `/api/compile` SSE 端点 / 编译流水线 / 错误处理 / 输入 Markdown → 输出合法 Module JSON 通过集成测试 |
| **M4: 学习循环闭环** | W5-7 | Quiz 三组件 / Feedback 端点 / retry 机制 / 状态机 / Mastery 计算 |
| **M5: Feynman 闭环** | W7-8 | `/api/feynman-eval` / 6 步序列 UI / Rubric 评分卡 |
| **M6: Module Challenge + 完成页 + 持久化** | W8 | Challenge 阶段 / Progress Persistence 完整测试 / 完成页 Mastery 卡片 |
| **M7: 内测 + 优化** | W9 | 性能调优（P95 达标）/ 错误提示打磨 / 20 人内测反馈收集 |
| **M8: 公测发布** | W10 | Vercel 部署 / 埋点验证 / 北极星指标（Module 完成率）监测 |

---

## 17. 附录

### 17.1 修订记录

| 版本 | 日期 | 修订 | 作者 |
|------|------|------|------|
| 1.0 | 2026-07-06 | 初稿，对齐 PRD V1.0 + 7 项关键决策 | — |

### 17.2 开放问题（实施期需澄清）

1. **DeepSeek / GLM 的具体模型名**：已确认（2026-07-07）。DeepSeek：`deepseek-v4-flash` / `deepseek-v4-pro`（旧 ID `deepseek-chat` 2026-07-24 退役）。GLM（Coding Plan 端点）：编译用 `glm-5.2`，Feedback 用 `glm-5-turbo`。M2 末用固定测试集验证 Schema 通过率。
2. **Prompt 模板的中文 / 英文选择**：Prompt 用中文还是英文对模型输出质量影响大，M2 期间 A/B 测试
3. **Feynman Step 6 用户输出的字数下限处理**：M5 期间决定是否在 < 100 字时阻断提交（PRD §15.3 建议非阻断）
4. **Module 历史淘汰策略的用户感知**：用户回到已被淘汰的 Module 链接时如何提示（M6 决策）

---

> **文档结束**
>
> 本技术方案定义了 AI Learning Compiler V1 MVP 的工程化实现路径。后续实施应：
> 1. 严格遵守规格书五条产品原则与第九章心理学基础
> 2. 不偏离 PRD 已确认的范围与验收标准
> 3. 实施中如遇本文档未覆盖的关键决策，应记录到 §17.2 开放问题并提交评审
