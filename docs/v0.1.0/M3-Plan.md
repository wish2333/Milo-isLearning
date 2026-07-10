# M3 工作计划（Knowledge Compiler 闭环）

> **M3 Plan V1.1**
> 状态：Draft | 日期：2026-07-07
> 定位：PRD §14 第三个正式里程碑，承接 [M2.5-Review](./M2.5-Review.md) 交付的工程基建
> 范围：PRD [FR-01 知识导入](./PRD.md#fr-01-知识导入knowledge-import) + [FR-02 Knowledge Compiler](./PRD.md#fr-02-knowledge-compiler知识编译)
> 验收：输入 Markdown → 输出合法 Module JSON
>
> **V1.1 修订**：编译总耗时容忍度从 PRD §6.1 NFR-P1 的 P50 ≤ 30s / P95 ≤ 60s 放宽到 **P50 ≤ 1.5min（90s）/ P95 ≤ 3min（180s）**。依据：M2.5-Review §2 实测 chunk agent 在 glm-5-turbo 上 30s 超时、concept agent 单次 17s，6+ Agent 串行加 Quiz 并发后 60s 目标在 MVP 阶段不现实。M3 作为验证性里程碑先跑通端到端，性能优化推迟到 M7 内测。本修订不影响 PRD（PRD 仍是产品发布目标），仅作为 M3 验证阶段的实际容忍度。

---

## 0. 为什么需要 M3

M2 把 7 个 Agent 的 Prompt + Schema + 单测（含 mock LLM）做完了；M2.5 把真实 LLM 通道、映射层、质量门禁、eval 脚本补齐。**但这些 Agent 是孤岛**——没有串联、没有进度反馈、没有错误兜底、没有 API 入口。

M3 是 Knowledge Compiler 真正"成为产品功能"的里程碑。它把 7 个 Agent 串成一条流水线，暴露为 `POST /api/compile`，让前端能粘贴 Markdown 拿到结构化 Module。

```
M2（mock 闭环）─► M2.5（真实 LLM 验证 + 工程基建）─► M3（编译器串联）─► M4（学习循环 UI）
   已完成          已完成                                    本计划            下一步
```

**M3 是 M4 的硬前置**：M4 学习循环 UI 需要先有一个能产出合法 Module 的后端。M3 不交付前端，但要把 API 契约冻结。

---

## 1. 范围

### 1.1 包含（Must）

| # | 工作项 | 来源 | 交付物 |
|---|--------|------|--------|
| W1 | **pipeline 类型契约与骨架** | Tech Spec §4 / PRD §5.3 | `src/lib/compiler/pipeline.ts` + `pipeline/types.ts`：`CompileEvent` 联合类型、`CompileConfig`、`compileMarkdown()` 异步生成器签名 |
| W2 | **上游串联（Import → Chunk → Concept → Module）** | PRD §5.3 / §7.1-§7.4 | 4 Agent 顺序调用，每阶段产出 progress 事件，失败抛 `CompileError(stage, cause)` |
| W3 | **Mission + Quiz 并行编排** | PRD §5.3 / §7.5-§7.6 | Mission 一次出全部 placeholder；Quiz Agent 对每个 placeholder 并行调用；单 slot 失败降级、批量失败熔断 |
| W4 | **Feynman 串联** | PRD §7.7 | Feynman Agent 输入完整 Module，输出经 `assembleFeynmanTask` 嵌入 |
| W5 | **`/api/compile` SSE 端点** | PRD FR-02 AC6 / Tech Spec §11 | Next.js App Router POST handler，SSE 流式返回 CompileEvent 序列 |
| W6 | **错误处理与用户友好提示** | PRD US-06 / FR-01 AC3-5 / NFR-R2 | 阶段化错误码 + 中文文案 + 修改建议；半成品清理；4xx vs 5xx 分类 |
| W7 | **集成测试** | PRD FR-02 AC1-5 / M2.5 §6 衔接 | mock LLM 单测（CI 友好）+ 真实 LLM smoke 脚本（手动触发）；复用 `__fixtures__/rag-medium.md` |
| W8 | **默认模型表锁定** | M2.5-Review §6 衔接 | 两阶段验证：① SenseNova `deepseek-v4-flash` 全 pipeline 跑通（默认通道）② 官方 DeepSeek `deepseek-v4-pro` 替换编译主体再跑一轮对比。GLM 系列作为兜底降级方案。输出决策报告 |

### 1.2 包含（Should，资源允许时）

| # | 工作项 | 说明 |
|---|--------|------|
| W9 | **断点续编** | 中间产物持久化（内存或 temp），单阶段失败可只重试该阶段而非全流程。MVP 推迟到 V1.1 |
| W10 | **编译耗时监控** | 每阶段 latency 打点，超过 P95 触发 telemetry 事件；MVP 接 console backend（M1 已就位） |
| W11 | **pipeline 通用重试装饰器** | 把 Provider 层的重试模式抽象到 pipeline 级，便于未来加缓存 / 限流 |

### 1.3 不包含（属 M4 或更后）

- **导入页 / 编译中页 UI**（M4）：M3 只交付 API 契约
- **课程概览页 / Module 导言页**（M4）
- **LocalStorage 写入**（M4）：M3 产物在响应体里返回，不主动持久化
- **Quiz 运行时反馈与重试**（M4，FR-04）
- **Module Challenge 生成**（M6，FR-05）：M3 pipeline 不含 Challenge
- **Module Feynman 评分**（M5，FR-06 运行时部分）：M3 只编译出 FeynmanTask 结构，不评分
- **PDF / 网页输入**（V3，PRD §12）
- **多 Module 课程**（V2）

---

## 2. 交付物详情

### W1 pipeline 类型契约与骨架

**新增文件**：
- `src/lib/compiler/pipeline/types.ts` — 类型契约（CompileEvent、CompileConfig、CompileError）
- `src/lib/compiler/pipeline/index.ts` — 对外入口（re-export）
- `src/lib/compiler/pipeline/pipeline.ts` — 编排实现

**核心类型**：

```typescript
// CompileEvent：pipeline 通过异步生成器吐出的事件流
export type CompileEvent =
  | { kind: 'stage_enter'; stage: CompileStage }
  | { kind: 'progress'; stage: CompileStage; percent: number; message?: string }
  | { kind: 'complete'; module: Module }
  | { kind: 'error'; error: CompileErrorPayload }

export type CompileStage =
  | 'import'        // 25%
  | 'chunk'         // 40%
  | 'concept'       // 55%
  | 'module'        // 65%
  | 'mission'       // 70%
  | 'quiz'          // 80-95%（动态：每完成一个 slot 进一格）
  | 'feynman'       // 100%

// CompileConfig：调用方传入的 LLM 配置
export interface CompileConfig {
  /** 编译主体模型（Chunk/Concept/Module/Mission/Quiz/Feynman 用） */
  compileModel: string
  /** 轻量模型（Import 用；Feedback/Feynman-Eval 留到 M4/M5） */
  lightweightModel: string
  /** 用户提供 */
  llm: LLMConfig
  /** 覆盖默认 thinking 开关，默认 false */
  enableThinking?: boolean
}

// 错误载荷：把内部异常翻译成前端可消费的结构
export interface CompileErrorPayload {
  stage: CompileStage | 'input' | 'unknown'
  code: CompileErrorCode
  message: string         // 用户可读中文
  hint?: string           // 修改建议（PRD US-06）
  retryable: boolean
  cause?: unknown         // 原始异常（开发调试用，不入 UI）
}

export type CompileErrorCode =
  | 'input_too_short'         // < 200 字符
  | 'input_too_long'          // > 20000 字符
  | 'input_invalid_encoding'  // 非 UTF-8
  | 'no_valid_concept'        // Concept Agent 提取失败
  | 'agent_output_invalid'    // Schema 校验失败（含重试后）
  | 'llm_rate_limit'          // 透传 ProviderError 429
  | 'llm_unavailable'         // 透传 5xx
  | 'llm_network'             // 透传 timeout / DNS
  | 'quiz_batch_failure'      // 单批 Quiz 失败率 > 20%
  | 'unknown'
```

**入口签名**：

```typescript
export async function* compileMarkdown(
  rawMarkdown: string,
  config: CompileConfig,
): AsyncIterable<CompileEvent>
```

异步生成器而非 Promise：调用方可流式消费 progress 事件，最后一个 `complete` 事件携带完整 Module。错误用 `error` 事件而非抛异常（让 SSE 流端保持打开直到结束）。

**与 M2.5 的衔接**：
- 调 `runAgent(kind, input, provider, schema, { disableThinking })`（M2.5 W3 已暴露 options）
- 调 `mapFeedback` / `assembleConcept` / `assembleQuiz` / `assembleFeynmanTask` / `assembleModule`（M2.5 W5 已就位）
- 复用 `createProvider`（M1）+ `AGENT_CONFIG`（M2）

### W2 上游串联（Import → Chunk → Concept → Module）

**进度事件映射（PRD §5.3）**：

| 阶段 | percent | 输入 | 输出 |
|------|---------|------|------|
| import | 25% | rawMarkdown | `ImportAgentOutput.normalizedText` |
| chunk | 40% | normalizedText | `ChunkAgentOutput.chunks` |
| concept | 55% | chunks | `ConceptAgentOutput.concepts` |
| module | 65% | concepts | `ModuleAgentOutput.module`（部分 Module，无 quizzes / feynmanTask） |

每阶段：
1. `yield { kind: 'stage_enter', stage }`
2. 调 `runAgent(stage, buildInput(prevOutput), provider, schema)`
3. 成功 → `yield { kind: 'progress', stage, percent, message }`
4. 失败 → `yield { kind: 'error', error: translateError(stage, e) }` 并 `return`

**Module 阶段产出"部分 Module"**：调用 `assembleModule()` 但 `concepts: []` + `feynmanTask: stubFeynmanTask`（占位，W4 填充）。每个 Concept 先用 `assembleConcept()` 装好壳，`quizSeries.quizzes` 留空。

### W3 Mission + Quiz 并行编排

**Mission 阶段**：
- 输入：`{ module, concepts }`（Module 阶段产出）
- 输出：`seriesByConcept: Record<conceptId, placeholder[]>`（每个 Concept 8-15 个 placeholder）
- progress 70%

**Quiz 阶段（并行）**：

```typescript
// 伪代码
const allSlots = flattenPlaceholders(missionOutput.seriesByConcept) // 每条 = (conceptId, slotIndex, placeholder)
const quizResults = await Promise.all(
  allSlots.map(async (slot) => {
    try {
      const out = await runAgent('quiz', {
        placeholder: slot.placeholder,
        concept: conceptsById[slot.conceptId],
        moduleContext: partialModule,
        originalQuiz: null, // 编译期无 originalQuiz
        ladderLevel: slot.placeholder.ladderLevel,
        expressionLevel: slot.placeholder.expressionLevel,
        interactionType: slot.placeholder.interactionType,
      }, provider, quizSchema, { disableThinking })
      return { slot, ok: true, quiz: assembleQuiz(out.quiz) }
    } catch (e) {
      return { slot, ok: false, error: e }
    }
  }),
)

// 熔断：失败率 > 20% → 整体编译失败
const failureRate = quizResults.filter(r => !r.ok).length / quizResults.length
if (failureRate > 0.2) {
  yield { kind: 'error', error: { stage: 'quiz', code: 'quiz_batch_failure', ... } }
  return
}

// 失败 slot 降级：该位置保留 placeholder 元数据，quiz 字段为 null（运行时会触发挥鞭重生成）
// 注：M4 的运行时若遇到 quiz=null 的 slot，需调用 Quiz Agent 现场生成
for (const r of quizResults) {
  if (r.ok) slotById[r.slot.id].quiz = r.quiz
  else slotById[r.slot.id].quiz = null  // 降级标记
}

// progress 80-95% 动态推进
yield* quizProgressStream(quizResults)  // 每完成一个 slot 推一档
```

**Quiz 进度估算**：
- 70% → 80% 用 5% 给"启动并行"准备阶段
- 80% → 95% 按 `完成 slot 数 / 总 slot 数` 线性插值
- 95% → 100% 留给 Feynman

**并行度限制**：用 `p-limit` 或手写 `PromisePool`，限 `MAX_CONCURRENT_QUIZ = 5`（避免触发 Provider 层的 429 重试风暴）。

### W4 Feynman 串联

- 输入：完整 Module（含已组装的 concepts + quizzes，但仍无 feynmanTask）
- 调 `runAgent('feynman', { module: fullModule, concepts: fullModule.concepts }, ...)`
- 输出经 `assembleFeynmanTask(out.feynmanTask)` 嵌入 `module.feynmanTask`
- progress 100%，`yield { kind: 'complete', module }`

### W5 `/api/compile` SSE 端点

**新增文件**：`src/app/api/compile/route.ts`

**请求**：
```http
POST /api/compile
Content-Type: application/json

{
  "rawMarkdown": "# RAG 入门\n...",
  "config": {
    "compileModel": "deepseek-v4-flash",
    "lightweightModel": "deepseek-v4-flash",
    "llm": {
      "provider": "sensenova" | "deepseek" | "glm",
      "apiKey": "<user-provided>",
      "model": "deepseek-v4-flash",
      "baseURL": "<optional>"
    },
    "enableThinking": false
  }
}
```

**响应**：`Content-Type: text/event-stream`，按 SSE 协议逐条推送 CompileEvent：

```
event: stage_enter
data: {"stage":"import"}

event: progress
data: {"stage":"import","percent":25,"message":"清洗 Markdown..."}

event: progress
data: {"stage":"chunk","percent":40,"message":"切分知识块（6 块）"}

...

event: complete
data: {"module":{"id":"module-1","title":"...","concepts":[...],"feynmanTask":{...}}}
```

错误时：
```
event: error
data: {"stage":"quiz","code":"quiz_batch_failure","message":"题目生成失败过多，请缩短文本或重试","hint":"建议把 Markdown 拆成多个 1000 字符以内的段落分别编译","retryable":true}
```

**约束**：
- NFR-R2：单 Agent 失败自动重试 2 次（_runner 已做）
- NFR-P1（M3 放宽版）：编译总耗时 P95 ≤ 3min；SSE 流全程不得 30s 无活动（否则前端断流）。30s 是单 stage 静默阈值，与总耗时无关
- NFR-C3：纯前端静态部署，Vercel Edge Runtime 兼容（避免 Node 专有 API）

### W6 错误处理与用户友好提示

**错误码到文案 / 修改建议映射表**：

| code | message | hint | retryable | HTTP 状态 |
|------|---------|------|-----------|----------|
| `input_too_short` | 内容过短，请补充至 200 字以上 | 当前 {n} 字符，至少还需 {200-n} | false | 400 |
| `input_too_long` | 内容超长，请缩减至 20000 字以内 | 当前 {n} 字符，超出 {n-20000}；建议分段编译 | false | 400 |
| `input_invalid_encoding` | 文件编码必须是 UTF-8 | 检查文件保存编码；VS Code 右下角可切换 | false | 400 |
| `no_valid_concept` | 没能从内容中提取到足够概念 | 建议：① 增加段落 ② 标题层级更清晰 ③ 避免纯代码块 | true | 422 |
| `agent_output_invalid` | AI 输出不符合规范，已自动重试仍失败 | 可重新编译；若持续失败请缩短文本 | true | 502 |
| `llm_rate_limit` | LLM 服务限流 | 稍等 1 分钟后重试 | true | 429 |
| `llm_unavailable` | LLM 服务暂时不可用 | 稍后重试；或切换供应商（Settings） | true | 503 |
| `llm_network` | 网络异常 | 检查网络连接；或检查 baseURL 配置 | true | 504 |
| `quiz_batch_failure` | 题目生成失败过多 | 建议：① 缩短文本 ② 简化概念 ③ 切换更强模型（如 deepseek-v4-pro） | true | 502 |
| `unknown` | 编译失败，原因未知 | 请重试；持续失败请把错误码反馈给开发者 | true | 500 |

**半成品清理**：M3 不写 LocalStorage（M4 才接入），但若编译失败，pipeline 内部不得残留任何状态。所有中间变量都是函数局部，generator return 后自然 GC。

### W7 集成测试

**两类测试**：

**A. Mock LLM 单测**（CI 友好，确定性）
- 文件：`src/lib/compiler/pipeline/__tests__/pipeline.test.ts`
- mock 策略：注入 fake LLMProvider，对每个 Agent 返回 canned schema-valid JSON
- 覆盖：
  - happy path：rawMarkdown → 完整 Module（断言 Concept 数、Quiz 数、Feynman 步数）
  - 输入校验：过短 / 过长 / 非 UTF-8
  - 单阶段失败：import_failed / concept_failed / 等
  - quiz 批量失败熔断：mock 30% slot 失败 → 触发 `quiz_batch_failure`
  - progress 事件序列：百分比单调递增、stage 不回退
- 目标：≥ 20 个测试用例，覆盖所有 CompileErrorCode

**B. 真实 LLM smoke 测试**（手动触发，不阻塞 CI）
- 文件：`scripts/m3-smoke.ts`（基于 M2.5 W2 prompt-eval.ts 模板）
- 行为：读 `.env.local`，跑 `compileMarkdown(rag-medium.md, config)`，输出：
  - 完整 Module JSON 到 `reports/m3-smoke/{date}-{provider}-{model}.json`
  - 阶段化耗时报告到 `reports/m3-smoke/{date}-{provider}-{model}.md`
- npm script：`bun run m3-smoke`
- 不进 CI；M3 验收时跑 ≥ 3 次，作为 W8 决策依据

### W8 默认模型表锁定

**目标**：在完整 pipeline 上验证不同模型组合的实际表现，产出决策报告回填 §4.5。

**验证流程（两阶段）**：

**阶段 1 — SenseNova deepseek-v4-flash 全流程跑通（主验证）**
- 通道：`https://token.sensenova.cn/v1` + `deepseek-v4-flash`（M2.5 确立的默认测试通道）
- 全 7 Agent pipeline 使用同一模型（v4-flash 承担编译主体与 Import 双重角色）
- smoke ≥ 5 次，验证 pipeline 能端到端跑出合法 Module JSON
- 收集指标（同下方验证维度表）

**阶段 2 — 官方 DeepSeek deepseek-v4-pro 替换编译主体跑一轮（对比验证）**
- 编译主体 Agent（Chunk / Concept / Module / Mission / Quiz / Feynman）用 `deepseek-v4-pro`
- Import Agent 保持 `deepseek-v4-flash`（轻量场景无需旗舰）
- smoke ≥ 3 次，对比阶段 1 的 P50/P95/成功率/产物质量
- 决策：如果 v4-pro 在编译质量上有明显提升且耗时可接受，在 §4.5 推荐 v4-pro 作为编译主体、v4-flash 作为轻量 Agent

**兜底降级**：若 SenseNova 与 DeepSeek 官方均不可达，回退到 GLM 系列（glm-5.2 编译主体 / glm-5-turbo 轻量）。M2.5 smoke 已验证 GLM 在 import/concept 上通过，但 chunk 在 turbo 超时（M2.5-Review §2.3）。

**验证维度**：

| 指标 | 目标（M3 放宽版） | 验证方式 |
|------|-------------------|---------|
| 编译总耗时 P50 | ≤ 1.5min（90s） | smoke 脚本测时 |
| 编译总耗时 P95 | ≤ 3min（180s） | smoke 跑 5 次取分位 |
| Concept 数 ∈ [2,5] | — | 断言 Module JSON |
| 每 Concept Quiz 数 ∈ [8,15] | — | 断言 Module JSON |
| Ladder 分布 30/30/20-30 | PRD §7.5 | 统计 placeholder.ladderLevel |
| Expression 分布 ≥60/≤20/≤20 | PRD §7.5 | 统计 placeholder.expressionLevel |
| Quiz 并发触发 429 风暴 | 0 次 | smoke 脚本日志 |
| 编译成功率 | ≥ 95% | smoke 跑 10 次统计 |

**报告产出**：`reports/m3-smoke/{date}-decision.md`，回填本计划 §4.5 决策表。

---

## 3. 验收标准

M3 完成的判定（全部 Must 项达标）：

| 验收项 | 目标 | 验证 |
|--------|------|------|
| pipeline 串联可用 | `compileMarkdown(md, cfg)` 能吐完整事件流并产合法 Module | pipeline.test.ts happy path 通过 |
| `/api/compile` 可调 | curl 调用 SSE 端点能拿到完整 Module JSON | curl 单测 / 手动 Postman |
| 阶段化进度反馈 | ≥ 7 个 stage_enter 事件，百分比单调递增 25→100% | pipeline.test.ts 断言事件序列 |
| 输入校验 | < 200 字符返回 input_too_short；> 20000 返回 input_too_long | pipeline.test.ts |
| 错误处理 | 9 种 CompileErrorCode 全覆盖 | pipeline.test.ts × 9 |
| Quiz 并行熔断 | 失败率 > 20% 触发 quiz_batch_failure | pipeline.test.ts |
| 集成测试 | mock 单测 ≥ 20 个，全过 | `bun run test` |
| 真实 LLM smoke | 至少 1 个 (provider × model) 组合跑通出 Module JSON | `bun run m3-smoke` 退出码 0 |
| 默认模型决策 | §4 决策表回填，附 smoke 报告链接 | 本文档 §4 + `reports/m3-smoke/` |
| 类型安全 | tsc --noEmit 0 错 | `bun run typecheck` |
| Lint 通过 | 0 错 0 警告 | `bun run lint` |

### 性能基线（M3 验证阶段容忍度，参考 PRD §6.1 NFR-P1 放宽版）

| 指标 | 目标 | 说明 |
|------|------|------|
| 编译总耗时 P50 | ≤ 1.5min（90s） | smoke 跑 5 次取中位 |
| 编译总耗时 P95 | ≤ 3min（180s） | smoke 跑 5 次取 95 分位 |
| 编译成功率 | ≥ 95% | smoke 跑 10 次 |

> **与 PRD 的差异**：PRD §6.1 NFR-P1 的目标是 P50 ≤ 30s / P95 ≤ 60s，M3 阶段放宽到 1.5min / 3min。M3 是验证性里程碑，先跑通端到端；性能优化（Prompt 瘦身、Quiz 并行度调优、模型降级）推迟到 M7 内测阶段。M8 公测发布前必须回到 PRD 目标。

未达标不阻塞 M3 结项（M3 是验证性里程碑），但触发 Prompt 调优迭代（属 M3 W8 决策内容）或推迟到 M7 内测阶段处理。

---

## 4. 关键设计决策

### 4.1 pipeline 用异步生成器还是 Promise？

**决策**：异步生成器（`AsyncIterable<CompileEvent>`）。

**理由**：
- SSE 端点天然需要流式输出 progress，Promise 模型无法在编译中途回吐中间事件
- 异步生成器是 SSE 的天然抽象，调用方 `for await (... of stream)` 即可
- 错误用 `error` 事件而非抛异常，让流端保持打开直到完整结束（前端能拿到完整错误上下文）

**代价**：调用方略复杂，需要 `for await` 而非 `await`。封装一个 `consumeStream(stream): Promise<Module>` 帮手简化非流式调用场景（如 smoke 脚本）。

### 4.2 Quiz 失败降级还是熔断？

**决策**：双策略。
- 失败率 ≤ 20%：失败 slot 降级为 `quiz: null`（运行时 M4 遇到 null 会现场重生成）
- 失败率 > 20%：整体熔断，抛 `quiz_batch_failure`

**理由**：
- 单个 slot 失败不致命（Quiz Agent 已重试 2 次），运行时可补救
- 大量失败说明输入有问题（如 Markdown 内容太抽象、Concept 提取偏差），继续编译没意义
- 20% 阈值与 PRD §13.1 "编译产物难度失控" 风险阈值对齐

### 4.3 SSE 端点用 Edge Runtime 还是 Node Runtime？

**决策**：Node Runtime（Next.js 默认）。

**理由**：
- Edge Runtime 限制 30s 总执行时间，编译可能跑 3min（M3 放宽版 NFR-P1 P95）；30s 限制在 Edge 上根本无法完成单个 stage，更不用说全流程
- Vercel 免费档 Edge 函数 streaming 不稳定，Node Runtime 更可控
- MVP 不需要 Edge 的低延迟边缘缓存

**代价**：失去 Edge 全球分发；MVP 不需要。

### 4.4 编译产物是否在服务端缓存？

**决策**：不缓存。M3 编译完直接通过 SSE complete 事件返回 Module，前端拿到后写 LocalStorage（M4）。

**理由**：
- NFR-S1：用户数据不上传服务器（除 LLM API 调用）
- 编译产物属于用户私有数据，服务端不留存
- 同一 Markdown 重复编译的概率低，缓存 ROI 不高

**未来**：V2 加服务端缓存时，以 `hash(rawMarkdown + modelVersion)` 为 key，需要用户显式同意。

### 4.5 默认模型表（W8 跑完后回填）

> 本节由 M3 smoke 报告数据驱动填写。验证流程（W8）：阶段 1 用 SenseNova `deepseek-v4-flash` 全 pipeline 跑通；阶段 2 用官方 DeepSeek `deepseek-v4-pro` 替换编译主体对比。GLM 系列作为兜底降级方案。

| 角色 | 初值（M3 阶段 1） | M3 W8 决策（阶段 2 后） | 依据 |
|------|-------------------|------------------------|------|
| 编译主体（6 Agent：Chunk/Concept/Module/Mission/Quiz/Feynman） | `deepseek-v4-flash`（SenseNova） | TBD（候选：deepseek-v4-pro） | `reports/m3-smoke/` |
| 轻量 Agent（Import / Feedback / Feynman-Eval） | `deepseek-v4-flash`（SenseNova） | TBD | `reports/m3-smoke/` |
| 默认 Provider | `sensenova` / `deepseek-v4-flash` | TBD | `reports/m3-smoke/` |
| Provider 优先级 | sensenova > deepseek > glm | TBD | — |

**候选组合（按优先级）**：
1. **SenseNova** `deepseek-v4-flash`（默认测试通道，主验证通道）
2. **DeepSeek 官方** `deepseek-v4-pro`（编译主体）+ `deepseek-v4-flash`（轻量）
3. **GLM** `glm-5.2`（编译主体）+ `glm-5-turbo`（轻量）—— 兜底降级

---

## 5. 工作分解与依赖

```
W1 类型契约 ──► W2 上游串联 ──► W3 Mission+Quiz ──► W4 Feynman ──┐
                                                                  ├──► W7 集成测试 ──► W8 决策
                                                                  │
                                       W6 错误处理 ────────────────┤
                                                                  │
                                       W5 SSE 端点 ────────────────┘
```

**建议顺序**：

1. **W1** 先冻结类型契约（CompileEvent / CompileConfig / CompileErrorPayload）→ 所有下游并行开发的共同基础
2. **W2** 上游串联 + 同步做 **W6** 错误处理（错误码表一次性写完，避免后期返工）
3. **W3** 并行编排（pipeline 内部最复杂的部分）
4. **W4** Feynman 串联（最简单，半天）
5. **W5** SSE 端点（依赖 W1-W4 全部就位）
6. **W7** 集成测试（mock 单测与 W2-W4 同步写，smoke 脚本在 W5 完成后写）
7. **W8** 默认模型决策（最后跑，所有工作就位后才有意义）

W9/W10/W11（Should）视资源穿插，不阻塞结项。

---

## 6. 与 M4 的衔接

M3 交付给 M4 的输入：

1. **`compileMarkdown()` API**：M4 导入页 / 编译中页直接调用
2. **CompileEvent 协议**：M4 编译中页订阅 SSE 流，按 stage_enter 切换文案、按 progress 推进进度条
3. **完整 Module JSON**：M4 课程概览页渲染依据
4. **CompileErrorPayload 协议**：M4 错误页按 code 映射文案（M3 W6 已提供完整表）
5. **默认模型表**（W8 决策）：M4 Settings 页的默认值
6. **smoke 脚本与 fixtures**：M4 接入 LocalStorage 时可复用 `__fixtures__/rag-medium.md` 跑端到端测试

M4 不必等 M3 W8 完成：M4 可先做 UI 骨架与 mock 数据演练，集成测试待 M3 W8 决策锁定模型后再跑真实数据。

---

## 7. 风险

| 风险 | 等级 | 缓解 |
|------|------|------|
| 真实 LLM 编译总耗时超 3min | 高 | W8 smoke 跑 5 次取 P95；若超 3min 先排查串行瓶颈（各 stage 延迟打点），再尝试升级编译主体模型到 `deepseek-v4-pro`（官方 DeepSeek 通道）做对比。注：M3 容忍度已放宽到 P95 ≤ 3min（V1.1），低于此阈值即视为达标 |
| Quiz 并行触发 429 风暴 | 中 | MAX_CONCURRENT_QUIZ = 5；Provider 层已有 429 退避；smoke 日志统计 429 次数 |
| Vercel Edge Runtime 不支持长 SSE | 低 | 已决策走 Node Runtime（§4.3）；若仍出问题，降级为 chunked HTTP 流 |
| Agent 输出 Schema 失败率高于 mock 假设 | 中 | _runner 已含重试；W8 smoke 实测失败率，若 > 5% 触发 Prompt 调优（属 M2 范畴回流） |
| Module Feynman 编译产物质量不足（rubric 抽象 / step 不分层） | 中 | W8 smoke 人工评估 5 次产物；若质量差触发 Prompt 调优 |
| 编译过程中前端断流（用户刷新 / 关页） | 低 | M3 不持久化中间状态；M4 接入 LocalStorage 时再加断点续编（W9） |

---

## 8. 修订记录

| 版本 | 日期 | 修订 | 作者 |
|------|------|------|------|
| 1.0 | 2026-07-07 | 初稿，承接 M2.5-Review，对齐 PRD FR-01/FR-02 | wish2333 |
| 1.1 | 2026-07-07 | 编译耗时容忍度放宽：P50 ≤ 30s / P95 ≤ 60s → **P50 ≤ 1.5min / P95 ≤ 3min**。依据 M2.5-Review §2 实测数据（chunk agent 在 turbo 超时、concept agent 单次 17s）。改动覆盖 §1.1 W5、§3 验收基线、§1.1 W8 验证维度、§4.3 Edge 决策、§7 风险表。30s SSE 静默超时保留（与总耗时无关）。PRD §6.1 NFR-P1 不动，仍为 M8 公测发布目标 | wish2333 |
| 1.2 | 2026-07-07 | 模型优先级修正：sensenova > deepseek > glm。W8 改为两阶段验证（① SenseNova v4-flash 跑通 ② 官方 v4-pro 对比）。GLM 系列降为兜底降级方案。CompileConfig 默认值、错误提示文案、候选组合表、风险表同步修正 | wish2333 |
