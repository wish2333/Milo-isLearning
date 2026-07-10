# Prompt 评估方案（M2 里程碑）

> **Prompt Evaluation Plan V1.0 — MVP**
> 版本：1.0 | 状态：Draft | 日期：2026-07-06
> 对应 PRD §14 M2（W2-3）：7 个 Agent 的 Prompt + JSON Schema 校验，单 Agent 单测通过
> 对应 Tech §13.2 Agent 单测

---

## 0. 文档位置

```
docs/Prompt-Engineering.md      定义 Prompt 设计宪法与模板
        │
        ▼
docs/prompt-evaluation.md       ← 本文档
   ├── M2 验收标准
   ├── 每 Agent 评估指标
   ├── 固定输入测试集
   ├── 评估执行流程
   └── M7 内测回测方案
```

---

## 1. M2 验收标准

M2 里程碑（W2-3）结束时，必须满足：

| 验收项 | 目标 | 验证方式 |
|---|---|---|
| Schema 通过率 | ≥ 90%（每个 Agent） | 跑 N=10 次固定输入，统计 Schema 校验通过率 |
| JSON 输出合规率 | ≥ 95% | 跑 N=10 次，统计 JSON.parse 成功率 |
| Retry 触发率 | ≤ 20% | 同上，统计追加 system 消息触发次数 |
| Concept 数稳定 | ∈ [2, 5]，方差 ≤ 1 | 同一 Markdown 跑 5 次，Concept 数标准差 |
| Quiz 数稳定 | ∈ [8, 15] | 每个 Concept 跑 5 次 |
| 业务约束达成率 | ≥ 80% | 层级分布 / 表达层级分布 / 前 2 题强制 L1 等约束 |
| 评分稳定性（Feynman Eval） | 同一输出多次评分，score 方差 ≤ 5 | 固定范文跑 5 次 |
| 单 Agent 端到端延迟 | P95 ≤ 各 Agent 阈值 | 见 Prompt-Engineering §7.3 |

---

## 2. 评估指标定义

### 2.1 通用指标（所有 Agent）

| 指标 | 定义 | 计算公式 |
|---|---|---|
| **Schema 通过率** | Zod `safeParse` 成功的比例 | `successCount / totalCount × 100%` |
| **JSON 解析率** | `JSON.parse` 成功的比例 | `parseSuccess / total × 100%` |
| **Retry 触发率** | 至少触发 1 次 retry（空 content / JSON 解析失败 / Schema 失败）的比例 | `retryCount / total × 100%` |
| **平均延迟** | 单次 Agent 调用从发送到收到响应的毫秒数 | `mean(latencies)` |
| **P95 延迟** | 95 分位延迟 | `percentile(latencies, 95)` |

### 2.2 业务指标（按 Agent）

| Agent | 业务指标 | 目标 |
|---|---|---|
| Import | normalizedLength 与 originalLength 比值 ∈ [0.8, 1.1] | ≥ 90% |
| Chunk | Chunk 数 ∈ [3, 15]；单 Chunk 长度 ∈ [200, 800] | ≥ 95% |
| Concept | Concept 数 ∈ [2, 5]；同一输入 5 次方差 ≤ 1 | ≥ 90% |
| Module | intro 含"完成本模块后，你能"前缀；conceptOrder 长度 ∈ [2, 5] | 100% |
| Mission | 层级分布合规（30-40% / 30-40% / 20-30%）+ 表达分布合规（≥60% / ≤20% / ≤20%）+ 前 2 题强制 L1 | ≥ 80% |
| Quiz | 4 选项；options[0]=answer；至少 3 个 used distractor；distractor 类型覆盖 ≥ 3 类 | ≥ 90% |
| Feynman | 6 步结构正确；Step 1-4 都是 choice；Step 5 是 fill_blank；Rubric 数 ∈ [3, 5] | 100% |
| Feedback | score 与 next_action 一致性；feedback_text ≤ 50 字且无禁用词 | 100% |
| Feynman Eval | score 与 rubricResults 自洽；gaps = hit='none' 的 point 列表 | 100% |

### 2.3 质量指标（人工评估，M7 内测）

| 指标 | 评估方式 | 目标 |
|---|---|---|
| **Quiz 干扰项 plausible 度** | 人工 1-5 分评分 | 均分 ≥ 3.5 |
| **Concept 提取准确度** | 人工判断是否符合"原子概念"原则 | ≥ 80% |
| **Feynman Rubric 覆盖度** | 人工判断 rubric 是否覆盖 Module 核心 | ≥ 80% |
| **Feynman Eval paraphrase 容忍度** | 同义改写后评分一致性 | ≥ 85% |

---

## 3. 固定输入测试集

### 3.1 测试集设计原则

- **覆盖 3 种知识类型**：技术类（RAG）、理论类（费曼学习法）、流程类（Git 工作流）
- **覆盖 3 种长度**：短（500 字符）、中（2000 字符）、长（8000 字符）
- **覆盖 2 种语言**：中文为主、中英混合
- **固定种子**：测试时用固定 `seed`（DeepSeek/GLM 支持时），保证可重复

### 3.2 测试集清单

测试集存放在 `lib/compiler/__fixtures__/` 目录：

```
lib/compiler/__fixtures__/
├── rag-short.md              # RAG 主题，500 字符
├── rag-medium.md             # RAG 主题，2000 字符
├── rag-long.md               # RAG 主题，8000 字符
├── feynman-medium.md         # 费曼学习法主题，2000 字符
├── gitflow-medium.md         # Git 工作流主题，2000 字符
├── mixed-lang.md             # 中英混合 Markdown
└── edge-cases/
    ├── code-heavy.md         # 代码块占 > 50%
    ├── heading-chaos.md      # 标题层级混乱
    └── very-short.md         # 200 字符（边界值）
```

### 3.3 测试集获取方式

- **手工撰写**：由产品 + 工程师协作撰写 3 篇主题文章（用户决策：Few-shot 数据手工撰写）
- **真实文档采样**：从开源项目 README 摘录（去版权处理）
- **不可使用生产数据**：MVP 阶段尚无生产数据

---

## 4. 评估执行流程

### 4.1 单 Agent 单测（M2 必须完成）

每个 Agent 准备 **3 个固定输入 + 5 次重复运行**，断言：

1. **Schema 通过率 ≥ 90%**（15 次中 ≥ 14 次通过）
2. **业务约束达成率 ≥ 80%**（如 Concept 数 ∈ [2,5]）
3. **稳定性**：同一输入 5 次输出，关键字段方差 ≤ 阈值

### 4.2 测试代码骨架

```typescript
// lib/compiler/__tests__/concept.test.ts
import { describe, expect, test } from 'vitest'
import { conceptSchema } from '@/lib/compiler/schemas/concept'
import { runAgent } from '@/lib/compiler/agents/_runner'
import { mockProvider } from './_mocks'
import { readFixture } from './_fixtures'

describe('Concept Agent', () => {
  const fixtures = ['rag-medium', 'feynman-medium', 'gitflow-medium']

  fixtures.forEach((name) => {
    test(`${name}: Schema pass rate ≥ 90% over 5 runs`, async () => {
      const chunks = await readFixture(`${name}.chunks.json`)
      let passCount = 0
      const outputs: ConceptAgentOutput[] = []

      for (let i = 0; i < 5; i++) {
        const result = await runAgent('concept', chunks, mockProvider, conceptSchema)
        const parsed = conceptSchema.safeParse(result)
        if (parsed.success) {
          passCount++
          outputs.push(parsed.data)
        }
      }

      expect(passCount).toBeGreaterThanOrEqual(4) // 4/5 = 80%
    })

    test(`${name}: Concept count ∈ [2, 5] with variance ≤ 1`, async () => {
      const counts = outputs.map((o) => o.concepts.length)
      const mean = counts.reduce((a, b) => a + b, 0) / counts.length
      const variance = counts.reduce((s, n) => s + (n - mean) ** 2, 0) / counts.length
      expect(Math.sqrt(variance)).toBeLessThanOrEqual(1)
    })
  })
})
```

### 4.3 Mock Provider（M2 阶段）

```typescript
// lib/compiler/__tests__/_mocks.ts
import type { LLMProvider, ChatRequest, ChatResponse } from '@/lib/providers/types'

/**
 * M2 阶段：mock provider，返回预录制的 LLM 响应
 * M3 阶段：切换到真实 provider
 */
export function mockProvider(recordings: Record<string, ChatResponse>): LLMProvider {
  return {
    async chat(req: ChatRequest): Promise<ChatResponse> {
      const key = hashMessages(req.messages)
      const recorded = recordings[key]
      if (!recorded) {
        throw new Error(`No recording for key ${key}`)
      }
      return recorded
    },
    async *chatStream(req: ChatRequest): AsyncIterable<ChatResponse> {
      yield await this.chat(req)
    },
    async ping() {
      return { ok: true, latencyMs: 0 }
    },
  }
}
```

录制的 LLM 响应存放在 `lib/compiler/__recordings__/`（gitignored）。

---

## 5. 真实 LLM 联调（M2 末）

M2 末（W3）必须用真实 LLM 跑一轮，验证：

| 项 | 配置 |
|---|---|
| Provider | DeepSeek（`deepseek-v4-pro`） + GLM（`glm-5.2`）各跑一轮 |
| 测试集 | `rag-medium.md` + `feynman-medium.md` |
| 重复次数 | 每个测试集 5 次 |
| 验收 | Schema 通过率 ≥ 80%（真实 LLM 比 mock 容易触发 retry） |

---

## 6. 评估报告输出

每次评估运行后，自动生成 Markdown 报告：

```markdown
# Prompt 评估报告 - {date}

## Agent: Concept

测试集：rag-medium.md
重复：5 次

| 指标 | 结果 | 目标 | 通过 |
|---|---|---|---|
| Schema 通过率 | 5/5 = 100% | ≥ 90% | ✓ |
| Concept 数 ∈ [2,5] | 3, 3, 4, 3, 3 (mean=3.2, σ=0.4) | 方差 ≤ 1 | ✓ |
| Retry 触发率 | 0/5 = 0% | ≤ 20% | ✓ |
| 平均延迟 | 1.8s | ≤ 3s | ✓ |

失败用例：无

## Agent: Quiz

...
```

报告路径：`reports/prompt-eval/{date}-{provider}.md`（gitignored）。

---

## 7. M7 内测回测

继承 PRD §14 M7（W9 内测）。20 人内测期间收集的真实数据用于回测：

| 回测项 | 来源 | 目标 |
|---|---|---|
| Quiz 难度（70-85% 正确率） | AttemptRecord | 平均答对率 ∈ [70%, 85%] |
| Quiz 重试率 | AttemptRecord.next_action='retry' 比例 | ≤ 30% |
| Feynman Step 6 提交率 | FeynmanAttempt 提交数 / 到达 Step 6 用户数 | ≥ 60% |
| Feynman Step 1-4 答错率 | FeynmanAttempt.stepResults | < 30% |
| 用户主观掌握感 | 完成页评分（1-5） | 均分 ≥ 4 |

回测后，根据数据调整：

- 若平均答对率 < 70%：Mission Agent 层级分布偏 L1，Quiz Agent 干扰项 plausible 度降低
- 若平均答对率 > 85%：Mission Agent 层级分布偏 L3，Quiz Agent 干扰项 plausible 度提高
- 若 Feynman Step 1-4 答错率 > 30%：Feynman Agent 选项设计需要重新评估

---

## 8. V1.1+ 评估扩展（计划）

| 阶段 | 扩展内容 |
|---|---|
| V1.1 | 引入 Few-shot（Concept / Quiz / Feynman Eval 三个 Agent），A/B 对比 Zero-shot 与 Few-shot 的 Schema 通过率与质量分 |
| V2 | 引入 promptfoo 或 Inspect AI 跑批量评估，覆盖 ≥ 100 个测试输入 |
| V3 | 引入真实用户数据的离线评估（去标识化） |
| V4 | 引入 LLM-as-judge 评分（用更强的模型给弱模型输出打分） |

---

## 9. 附录：评估工具选型

| 工具 | 用途 | MVP 是否引入 |
|---|---|---|
| **Vitest** | 单元测试框架（已在 Tech §2.1 列入） | 是 |
| **zod-to-json-schema** | Zod Schema 转 JSON Schema（嵌入 Prompt） | 是（M2） |
| **promptfoo** | 批量 Prompt 评估 | 否（V2 引入） |
| **Inspect AI** | LLM 评估框架（含 rubric grading） | 否（V2 评估） |
| **DeepEval** | LLM 输出质量评估 | 否（V2 评估） |

---

## 修订记录

| 版本 | 日期 | 修订 | 作者 |
|---|---|---|---|
| 1.0 | 2026-07-06 | 初稿，对齐 PRD §14 M2 与 Tech §13.2 | — |
