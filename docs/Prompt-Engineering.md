# AI Learning Compiler Prompt 工程文档

> **Prompt Engineering V1.0 — MVP**
> 版本：1.0 | 状态：Draft | 日期：2026-07-06
> 上游文档：[`Product-Specification.md`](./Product-Specification.md) V1.0（设计宪法）、[`PRD.md`](./PRD.md) V1.0（功能需求）、[`Technical-Specification.md`](./Technical-Specification.md) V1.0（工程架构）
> 本文档定义 HOW：7 个编译期 Agent + 2 个运行时 Agent 的 Prompt 怎么写。

---

## 0. 文档位置

```
Product-Specification.md       定义 WHY 与设计宪法（5 条原则 + 心理学基础）
        │
        ▼
PRD.md                         定义 WHAT：MVP 交付哪些功能 + §7 AI Agent 输入输出契约
        │
        ▼
Technical-Specification.md     定义 HOW（架构）：模块划分 / Provider 抽象 / Pipeline 编排
        │
        ▼
Prompt-Engineering.md          定义 HOW（Prompt）：              ← 本文档
   ├── 9 个 Agent 的 Prompt 设计宪法
   ├── JSON 输出策略与重试规则
   ├── 模型分层与温度策略
   ├── 检索报告综合（5 个外部参考的核心 take-away）
   └── 引用 lib/compiler/prompts/*.md 与 lib/compiler/schemas/*.ts
        │
        ▼
lib/compiler/prompts/*.md      Prompt 模板（本仓库 src 目录前）
lib/compiler/schemas/*.ts      Zod Schema 骨架（本仓库 src 目录前）
docs/prompt-evaluation.md      M2 评估方案
```

冲突优先级：**规格书 > PRD > 技术方案 > 本 Prompt 工程文档**。本文件若与上游冲突，上游为准；上游未覆盖的 Prompt 层细节，以本文档为最终依据。

---

## 1. 设计宪法

### 1.1 五条产品原则在 Prompt 工程层面的落地

继承规格书 §1.3 五条产品原则。每条原则都对应**可写入 Prompt 的具体指令**：

| 产品原则 | 在 Prompt 中的具体指令 |
|---|---|
| **P1：Quiz 永远不是目的** | Quiz Agent / Feynman Agent 的 system 段必须包含："你生成的每一道题都服务于帮助用户最终用自己的语言完整解释，而不是为了考住用户。" |
| **P2：永远降低表达成本** | Quiz Agent 的 stem 必须自带完整上下文，用户无需回看上文；Fill Blank 必须明确"填入 1-3 个关键词"，而非"自由作答"。 |
| **P3：每一道题都应该让用户成功** | Quiz Agent 的 distractor 必须是 "plausible but wrong"，不允许"absurd option"。Explanation 必须解释"为什么对"和"为什么错"，而不是只宣告答案。Feedback Agent 文案必须鼓励性，禁用"错误""失败""不正确"等强烈负面词。 |
| **P4：不让用户思考"如何回答"** | Quiz Agent 的 stem 必须明确"以下哪一项/请按顺序排列/请填入____"。不允许题干歧义。 |
| **P5：输出自由度逐渐增加** | Mission Agent 的占位符序列必须满足：前 2 题强制 Level 1 Choice；Level 3 Fill Blank 占比 ≤ 20%。 |

### 1.2 学习心理学基础在 Prompt 中的落地

继承规格书第九章。下表把抽象心理学原则翻译为可执行的 Prompt 指令：

| 心理学原则 | 在 Prompt 中的具体指令 |
|---|---|
| **Expression Cost**（§9.1） | Feynman Agent 的 Step 1-4 必须是 4 选项 Choice，绝不引入开放输入。Step 5 Fill Blank 必须明确"补全半句话"，不让用户从零组织语言。 |
| **Continuous Success**（§9.2） | Quiz Ladder 的 Level 1-2 题干必须用"以下哪一项 ____"，干扰项来自同领域相邻概念。不允许 Level 1 题就引入跨域迁移。 |
| **Quiz as Scaffold**（§9.3） | Quiz Agent 的 system 段："你不是在出考题，而是在帮用户在表达前最后一次接触知识。" |
| **Expression Freedom**（§9.4） | Mission Agent 编排 QuizSeries 时，expressionLevel 必须按 1→2→3 单调递增（局部可平级，不可下降）。 |
| **Module Mastery**（§9.5） | Feynman Agent 的 Rubric 关键点必须来自 Concept 级核心，不允许细节题（如"X 的具体数值是几"）。 |
| **Desirable Difficulty**（§9.6） | Quiz Ladder Level 3（Application）的题干必须涉及"新场景"，但场景与原始 Chunk 在结构上同构（避免超纲）。 |

---

## 2. 关键决策摘要

### 2.1 五项用户决策（已确认）

| 维度 | 决策 | 落地 |
|---|---|---|
| 产出物形态 | 全套交付 | 文档 + 9 个 Prompt 模板 + 9 个 Zod Schema + 评估方案 |
| Prompt 语言 | 中文为主 | System/约束/层级指导用中文；JSON Schema 字段名 / 变量占位符用英文 |
| JSON 输出策略 | `response_format: {type: 'json_object'}` + Zod 校验 | 失败时追加 system 消息重试 1 次，仍失败抛 `AgentOutputError` |
| 工程深度 | MVP 闭环优先 | 全部 Agent Zero-shot 起步；Few-shot 数据手工撰写、留到 V1.1 |
| Few-shot 数据 | 手工撰写 | 不依赖外部 learning-quiz 数据集 |

### 2.2 DeepSeek / GLM 结构化输出实战要点

基于检索报告 [§4 DeepSeek & GLM JSON output best practices](#52-外部检索报告综合)，以下要点直接写入 Provider 层与 Prompt 模板：

#### 2.2.1 通用规则（DeepSeek + GLM 都适用）

1. **两者都只支持 `response_format: {type: 'json_object'}`，不支持 `json_schema`**。Schema 强制约束必须靠客户端 Zod。
2. **绝不在同一请求里同时使用 `response_format` 和 `tools`**。两者会冲突，抑制 tool 调用。MVP 不使用 function calling，统一走 `response_format`。
3. **必须检查 `finish_reason`**：`"length"` 表示输出被截断，JSON 几乎一定不完整，需要重试且加大 `max_tokens`。
4. **必须处理空 `content`**：DeepSeek 在长输出/高负载下偶发返回空字符串，HTTP 200 但 `content=""`。重试 1 次通常可恢复。
5. **System 段必须包含 "json" 字样**：DeepSeek 官方文档明确要求，否则可能"无限输出空白直到 token 上限"。
6. **`max_tokens` 必须显式设置**，且取预估最大值的 2 倍。

#### 2.2.2 DeepSeek 专属

| 项 | 值 |
|---|---|
| baseURL | `https://api.deepseek.com`（注意：不是 `/v1`） |
| JSON 严格模式 | `baseURL: 'https://api.deepseek.com/beta'` + tool schema `strict: true`（MVP 不使用） |
| Thinking mode | V4 默认开启。返回有 `reasoning_content`（CoT，不要解析）+ `content`（最终答案）。不要把 `reasoning_content` 回传给下一次请求（400 错误）。 |
| 模型 ID | 当前：`deepseek-v4-flash`、`deepseek-v4-pro`。旧 ID（`deepseek-chat`、`deepseek-reasoner`）2026-07-24 退役。 |

#### 2.2.3 GLM（智谱 BigModel）专属

| 项 | 值 |
|---|---|
| 公开端点 baseURL | `https://open.bigmodel.cn/api/paas/v4` |
| **Coding Plan baseURL** | `https://open.bigmodel.cn/api/coding/paas/v4`（比公开端点多一段 `/coding/`） |
| 模型 ID | 当前：`glm-5.2`、`glm-5.1`、`glm-5`、`glm-5-turbo`。旧 ID（`glm-4.7`、`glm-4-plus`、`glm-4-flash`）已过时。MVP 推荐：编译用 `glm-5.2`，Feedback 用 `glm-5-turbo`。 |
| **默认 temperature = 0.95** | 太高，JSON 任务必须显式设 `temperature: 0.1`（结构化输出）或 `0.7`（生成题）。 |
| **默认 top_p = 0.7** | 与 OpenAI 默认 1.0 不同，迁移 Prompt 时需注意。 |
| **enable_thinking** | GLM 用 `extra_body={"enable_thinking": false}` 关闭 thinking 模式（OpenAI 协议是 `thinking` 参数）。JSON 任务建议关闭以避免 reasoning_content 干扰。 |
| **响应字段回退** | `message.content || message.reasoning_content || ''`。thinking 模式开启时内容可能落在 `reasoning_content`。 |
| **API Key 格式** | `{id}.{key}` 复合格式，不是单串。 |
| **tool_choice** | 仅支持 `"auto"`，不支持 `"required"` 或指定函数名。MVP 不使用 tool。 |

> **是否使用 Coding Plan 完全由 baseURL 决定**：同一份 API Key + 不同 baseURL = 不同计费来源。本仓库默认走 Coding Plan 端点。

#### 2.2.4 GLM Coding Plan（本仓库默认 LLM Provider）

GLM Coding Plan 是 zhipuai-coding-plan 的同源端点，行为与公开 GLM v4 接口高度一致，区别仅在 baseURL 路径（`/api/coding/paas/v4` vs `/api/paas/v4`）。

| 项 | 值 |
|---|---|
| baseURL | `https://open.bigmodel.cn/api/coding/paas/v4` |
| 可用模型 | `glm-5.2`、`glm-5-turbo`（与公开端点相同） |
| 配置方式 | `LLMConfig.baseURL` 直接填 Coding Plan URL；ProviderKind 仍为 `'glm'` |
| MVP 默认 | `model: 'glm-5.2'`（强模型，编译主体）；Feedback Agent 可切 `glm-5-turbo` |

---

## 3. 9 个 Agent 全景

### 3.1 编译期 7 个 Agent（Pipeline）

按 PRD §5.3 编译流程串联，Quiz Agent 在 Mission Agent 输出占位符后**并行**触发：

| 顺序 | Agent | 输入 | 输出 | 主要约束 |
|---|---|---|---|---|
| 1 | **Import Agent** | 原始 Markdown 文本 | 标准化文本 | 不修改语义；保留代码块；合并多余空行 |
| 2 | **Chunk Agent** | 标准化文本 | `Chunk[]`（含 id/text/heading） | 单 Chunk 200-800 字；按 H2/H3 优先切分 |
| 3 | **Concept Agent** | `Chunk[]` | `Concept[]`（含 name/definition/type/keyPoints） | 总数 ∈ [2,5]；单 Chunk ≤ 2 个；definition ≤ 30 字 |
| 4 | **Module Agent** | `Concept[]` | `Module`（含 title/intro/goal/concepts） | title ≤ 20 字；intro 用"完成本模块后，你能……"句式 |
| 5 | **Mission Agent** | `Module`（含 concepts） | 每个 Concept 的 `QuizSeries` 占位符（不生成具体题） | 占位符 ∈ [8,15]；前 2 个强制 `{ladderLevel:1, interactionType:'choice', expressionLevel:1}` |
| 6 | **Quiz Agent**（并行） | 单个占位符 + Concept | 完整 `Quiz`（stem/options/answer/explanation/distractors） | 4 选项；干扰项 plausible but wrong；不允许通过常识排除 |
| 7 | **Feynman Agent** | `Module` | `FeynmanTask`（6 步 + Rubric） | Step 1-4 Choice；Step 5 Fill Blank；Step 6 开放；Rubric 3-5 个 Concept 核心点 |

### 3.2 运行时 2 个 Agent

| Agent | 触发时机 | 输入 | 输出 | 性能要求 |
|---|---|---|---|---|
| **Feedback Agent** | 用户每答一题 | `Quiz` + `userAnswer` | `{score, gaps, next_action, feedback_text}` | P95 ≤ 1.5s |
| **Feynman Evaluator** | 用户提交费曼 Step 6 | `finalPrompt` + `rubric[]` + 用户输出 | `{score, rubricResults[], gaps[], sampleAnswer}` | P95 ≤ 3s |

---

## 4. Prompt 模板组织

### 4.1 目录结构

```
lib/compiler/prompts/
├── _shared/
│   ├── json-output-rules.md          # JSON 输出通用规则（所有 Agent 引用）
│   ├── ladder-level-explanation.md   # Quiz Ladder 4 层级定义（Mission/Quiz 引用）
│   ├── expression-level-explanation.md  # 表达层级 3 级定义（Mission/Quiz 引用）
│   └── distractor-rules.md           # 干扰项规则（Quiz Agent 引用）
│
├── import.md                         # Import Agent
├── chunk.md                          # Chunk Agent
├── concept.md                        # Concept Agent
├── module.md                         # Module Agent
├── mission.md                        # Mission Agent
├── quiz.md                           # Quiz Agent（编译期 + 答错重试场景）
├── feynman.md                        # Feynman Agent（编译期，生成 6 步 + Rubric）
│
├── feedback.md                       # Feedback Agent（运行时）
└── feynman-eval.md                   # Feynman Evaluator（运行时）
```

### 4.2 模板格式约定

- **Markdown 文件**：每个 Agent 一个 `.md` 文件。
- **占位符语法**：`{variable_name}` —— 编译时由 `buildPrompt(kind, input)` 做字符串替换。
- **共享片段引用**：用 `{{> shared/json-output-rules}}` 语法在编译时拼接（`buildPrompt` 内部展开）。
- **JSON Schema 嵌入**：每个 Agent 模板末尾用 `{{> schema/concept}}` 引用对应 Zod Schema 的 JSON 表示。

### 4.3 buildPrompt 调用示例

```typescript
import { conceptSchema } from '@/lib/compiler/schemas/concept'

const messages = buildPrompt('concept', {
  chunks: [{ id: 'c1', text: '...', heading: '...' }],
  constraints: { maxConcepts: 5 },
})
// 返回 ChatMessage[]，可直接传给 provider.chat()
```

`buildPrompt` 内部：
1. 读取 `lib/compiler/prompts/concept.md`
2. 替换 `{chunks}` 等占位符
3. 展开 `{{> shared/json-output-rules}}` 为 `_shared/json-output-rules.md` 内容
4. 展开 `{{> schema/concept}}` 为 `conceptSchema` 的 JSON Schema 文本
5. 返回 `[{role: 'system', content: '...'}, {role: 'user', content: '...'}]`

---

## 5. 检索报告综合

### 5.1 内部参考资料

| 文件 | 内容 | 用途 |
|---|---|---|
| `references/2026-07-06-1-First.md` | 早期 AI 讨论：DeepTutor / Human Skill Tree / Education Agent Skills / Hermes Edu Skills / uberSKILLS | 产品形态参考（非 Prompt 层） |
| `references/2026-07-06-2-Quiz.md` | 产品哲学讨论：双层 Loop / Quiz Ladder / Expression Freedom Curve | 已沉淀到规格书，本文件不再重复 |

### 5.2 外部检索报告综合

M2 阶段派 4 个 librarian 并行检索（路由 `zhipuai-coding-plan/glm-5-turbo`），3 份完整 + 1 份（Feynman rubric）中途终止（已由手工储备补足）。综合如下：

#### 5.2.1 多 Agent 学习类 Pipeline 参考

| 来源 | URL | 借鉴点 |
|---|---|---|
| **ClassBuild** | github.com/jtangen/classbuild | "正确答案永远放 A，渲染时再打乱"模式（消除 parser bug）；模型分层（Opus 出题、Sonnet 章节、Haiku 转录）；`buildXPrompt()/buildXUserPrompt()/parseXResponse()` 三段式分离 |
| **Instructional Agents** | github.com/DaRL-GenAI/instructional_agents (EACL 2026) | ADDIE 5 阶段；自纠正循环（评分 < 4/5 路由回 Development）；typed JSON 评分输出 `{score, status, reasoning}` |
| **Khanmigo** | blog.khanacademy.org | 私有 CoT（先想清楚再回答）；"keep responses short"；24h 对话日志可提升 5.09% 认知投入；prompt 过长会"随机忽略指令片段"——警示 |
| **Scaria et al. PS1-PS5** | arxiv.org/abs/2408.04394 | Bloom 5 档 Prompt 复杂度；PS5（CoT + skill 定义 + 示例）显著优于 PS1；但 GPT-4 + PS1 反超小模型 + PS5——警示模型质量比 prompt 复杂度更重要 |
| **KELE (EMNLP 2025)** | doi.org/10.18653/v1/2025.findings-emnlp.888 | 9 维 Socratic 评分（topic coverage / Socratic 原则 / 学生理解指标 / 启发质量 / 渐进难度 / 反馈及时性 / 鼓励 / 错误纠正 / 元认知脚手架）；微调 GLM4-9B 反超 GPT-4o |

#### 5.2.2 MCQ 干扰项生成参考

| 来源 | URL | 借鉴点 |
|---|---|---|
| **BiFlow (ACL 2025)** | aclanthology.org/2025.findings-acl.432.pdf | Teacher-Student 双向 + Result Checker 三准则（语法正确/答案类型一致/作为错误项合理）；迭代反馈循环 |
| **DPO + 学生选择预测 (ACL 2025)** | aclanthology.org/2025.acl-long.1154.pdf + github.com/holi-lab/distractor-generator | pairwise ranker："学生先要理解 X，但因误解 Y 会选 Z"；DPO 训练后反超 GPT-4o |
| **Overgenerate-and-Rank (BEA 2024)** | aclanthology.org/2024.bea-1.19.pdf | 先生成 10 个，再用 ranker 选 Top-3；Partial match 从 47% 提升到 68% |
| **Concept Map-based (arXiv 2505.02850)** | arxiv.org/abs/2505.02850 | CoT 模板 + 4 条教学要求（每干扰项针对一个误解 / 只掌握概念才能答对 / 语言难度对齐 / 包含具体场景）；猜对率 37% → 28% |
| **DiVERT (EMNLP 2024)** | aclanthology.org/2024.emnlp-main.512.pdf | 两步生成：先生成"误解"，再生成"由该误解导致的干扰项" |
| **moodle-mcq 5 干扰项策略** | github.com/danielcregg/moodle-mcq | Overcorrection / Outdated Practice / Wrong Context / Incomplete Solution / Reasonable Misunderstanding；15/15/70 答案长度分布律 |
| **aimcqframework 19 Item Writing Flaws** | github.com/gilles-chen/aimcqframework | 自动检测：长答案=对 / 绝对词 / 荒谬项 / 语法不一致 / 词重复 / 收敛线索 / 否定题干 / "以上都对"等 |
| **Haladyna & Downing 经典 IWF** | site.ufvjm.edu.br/fammuc/files/2016/05/item-writing-guidelines.pdf | 三选项通常足够；约 2/3 题目只有 1-2 个有效干扰项；用"学生典型错误"写干扰项 |

#### 5.2.3 DeepSeek + GLM JSON 输出参考

详见本文件 §2.2。核心 take-away：

- 两者都只支持 `json_object`，不支持 `json_schema` → 客户端 Zod 强制校验
- 两者都禁止 `response_format` 与 `tools` 同请求混用
- DeepSeek 长输出偶发空 `content` → 重试 1 次
- GLM 默认 temperature=0.95 → JSON 任务必须显式设 0.1
- GLM `enable_thinking` 关闭后输出更稳定

#### 5.2.4 Feynman Rubric 评分参考（手工储备补充）

外部检索在第 4 个任务被中断，本节由手工储备补全。参考来源包括：

| 来源 | URL/出处 | 借鉴点 |
|---|---|---|
| **DeepEval `GEval`** | github.com/confident-ai/deepeval | 默认 CoT 评分模板：先输出 `reasoning`，再输出 `score`（0-5）和 `reason`；支持 `strict_mode` 强制格式 |
| **Ragas `faithfulness`** | github.com/explodinggradients/ragas | 两步法：先用 LLM 抽取 statement 列表，再对每个 statement 判定是否被上下文支持 |
| **promptfoo `llm-rubric`** | github.com/promptfoo/promptfoo | 把"期望输出"作为 rubric 输入，让 LLM 判 "pass/fail"+ 理由 |
| **Inspect AI `score`** | github.com/UKGovernmentBEIS/inspect_ai | 把 rubric point 作为独立 assertion；每个 point 独立 LLM call 提高稳定性 |
| **Anthropic Socratic Tutor** | github.com/anthropics/claude-cookbooks/main/misc/metaprompt.ipynb | "完成后告诉学生并给予 praise；未完成给下一步 hint；推理有误用提问方式指出不一致" |
| **KELE 9 维 rubric** | （同 §5.2.1） | 直接用于 Feynman Evaluator 的多维度判定 |

### 5.3 综合 take-away（写入各 Agent Prompt 的指令）

下列指令已直接写入对应 Agent 的 `.md` 模板：

| Agent | 借鉴的指令 |
|---|---|
| Quiz Agent | "干扰项 plausible but wrong，必须来自常见误解或相邻概念，不允许荒谬选项"（moodle-mcq / BiFlow） |
| Quiz Agent | "先生成 6-8 个候选干扰项，再选 Top-3"（Overgenerate-and-Rank） |
| Quiz Agent | "正确答案长度分布遵循 15/15/70 规则"（moodle-mcq） |
| Quiz Agent | "每个干扰项针对**不同的**误解"（Concept Map-based） |
| Mission Agent | "前 2 题强制 `{ladderLevel:1, interactionType:'choice', expressionLevel:1}`"（PRD §7.5） |
| Concept Agent | "PS5 模式：CoT + Bloom 层级定义 + 示例"（Scaria et al.） |
| Feynman Agent | "Step 1-4 必须是 Choice，让用户内化解释结构；Step 6 用 Rubric 3-5 个 Concept 核心点评分"（PRD §7.7 + KELE） |
| Feynman Evaluator | "私有 CoT 先行：先输出 reasoning 列出 rubric 各点命中情况，再输出 score"（Khanmigo + DeepEval GEval） |
| Feynman Evaluator | "rubric 命中判定 paraphrase-tolerant：触及核心含义即视为 hit，不要求字面一致"（Ragas faithfulness） |
| Feedback Agent | "feedback_text ≤ 50 字，鼓励性语气，禁用'错误''失败''不正确'等强烈负面词"（规格书 P3） |

---

## 6. JSON 输出策略

### 6.1 总体策略

**统一使用 `response_format: {type: 'json_object'}` + 客户端 Zod 校验 + 失败重试 1 次。**

理由：
1. DeepSeek 与 GLM 都不支持 `json_schema` 类型，无法靠 API 层强制 schema
2. `response_format: json_object` 已能消除 90%+ 的格式问题（markdown 包裹、自由文本）
3. Zod 在客户端兜底，捕获剩余的语义/结构错误
4. Function calling 在 GLM 上无法强制（`tool_choice` 仅支持 `auto`），不可靠

### 6.2 调用模板

```typescript
const response = await provider.chat({
  messages,
  temperature: agentKindTemperature(kind),  // 见 §7.2
  maxTokens: agentKindMaxTokens(kind),       // 见 §7.3
  jsonSchema: schemaToResponseFormatHint(schema),  // 仅作为提示嵌入 system 段
  responseFormat: 'json_object',              // 走 response_format
})
```

### 6.3 重试策略

详见 [`lib/compiler/agents/_runner.ts`](../lib/compiler/agents/_runner.ts)（由技术方案 §4.3 定义）。MVP 阶段采用 PRD §6.4 NFR-R4 的最小策略：

```
1. 调用 LLM，response_format=json_object
2. 取 message.content || message.reasoning_content || ''
3. 若空 → retry 1 次，messages 追加 "上一次响应为空，请输出 JSON"
4. JSON.parse → 失败 → retry 1 次，messages 追加 "上一次响应非合法 JSON: {err}，请严格返回 JSON"
5. schema.safeParse → 失败 → retry 1 次，messages 追加 "上一次响应未通过 Schema 校验: {issues}，请修正"
6. 仍失败 → 抛 AgentOutputError(kind, subKind, raw) → 上层 UI 提示"AI 输出不规范"
```

### 6.4 共享 JSON 输出规则片段

见 [`lib/compiler/prompts/_shared/json-output-rules.md`](../lib/compiler/prompts/_shared/json-output-rules.md)。所有 Agent 在 system 段引用此片段。

---

## 7. 模型分层与温度策略

### 7.1 模型分层（Provider 层路由）

MVP 不实现完整模型分层（PRD §15.1 已确认）。但建议在 `LLMConfig.model` 中按 Agent 类型预设默认值：

| Agent 类型 | DeepSeek 默认 | GLM 默认 | 理由 |
|---|---|---|---|
| Import / Chunk | `deepseek-v4-flash` | `glm-5-turbo` | 简单文本处理，对模型质量要求低 |
| Concept / Module | `deepseek-v4-flash` | `glm-5-turbo` | 中等复杂度，turbo 足够 |
| Mission / Quiz / Feynman | `deepseek-v4-pro` | `glm-5.2` | 质量敏感，需要更强模型 |
| Feedback / Feynman Eval | `deepseek-v4-flash` | `glm-5-turbo` | P95 ≤ 1.5s 性能优先，turbo 响应快 |

### 7.2 温度策略

| Agent 类型 | temperature | 理由 |
|---|---|---|
| Import / Chunk | 0.1 | 标准化与切分需要确定性 |
| Concept | 0.3 | 概念提取需要少量多样性，但主轴稳定 |
| Module | 0.3 | 同上 |
| Mission | 0.2 | 占位符编排需要严格遵循层级分布约束 |
| **Quiz** | **0.7** | 题干与干扰项需要多样性（Scaria et al. 实证 0.7-0.9 最佳） |
| **Feynman（生成 6 步）** | **0.7** | Step 1-4 的解释策略需要多样性 |
| **Feedback** | **0.1** | 评分需要确定性，避免相同答案不同分数 |
| **Feynman Eval** | **0.1-0.2** | 同上，允许少量宽容度 |

> GLM 默认 temperature=0.95。所有调用必须显式覆盖。

### 7.3 maxTokens 策略

| Agent 类型 | maxTokens | 理由 |
|---|---|---|
| Import | 4096 | 输入可能 20000 字符，标准化后可能更长 |
| Chunk | 8192 | Chunk[] JSON 较长 |
| Concept | 4096 | 2-5 个概念，每个含 keyPoints |
| Module | 2048 | 单 Module 元数据 |
| Mission | 4096 | 占位符数组 |
| **Quiz**（单题） | **2048** | 单题 JSON 不大，但要预留 explanation 空间 |
| **Feynman** | **8192** | 6 步 + Rubric，且 Step 4 选项较长 |
| Feedback | 1024 | score + gaps + 短文案 |
| Feynman Eval | 2048 | rubricResults + sampleAnswer（150-300 字） |

---

## 8. Few-shot 路线图

### 8.1 MVP 阶段：Zero-shot

所有 9 个 Agent 起步 Zero-shot：
- 不在 Prompt 中放示例输入/输出
- 完全依赖 system 段约束 + JSON Schema 嵌入
- 优点：Prompt 短、维护简单、迭代快
- 缺点：质量稳定性低于 Few-shot

理由：MVP 优先验证核心体验闭环（PRD §1.3），不追求 Prompt 工程的最佳质量。Zero-shot 能在 M2 里程碑（W2-3）内交付可测 Prompt。

### 8.2 V1.1 阶段：关键 Agent Few-shot（计划）

仅在 3 个质量敏感的 Agent 引入手工 Few-shot：

| Agent | Few-shot 数据 | 来源 |
|---|---|---|
| Concept Agent | 1-2 个"Markdown 输入 → 2-3 个 Concept 输出"示例 | 手工撰写（用户决策） |
| Quiz Agent | 2-3 个"Concept + 占位符 → 完整 Quiz"示例，覆盖 Recognition / Discrimination / Application 各一道 | 手工撰写 |
| Feynman Evaluator | 1 个"用户输出 + Rubric → {score, rubricResults}"示例，演示 paraphrase-tolerant | 手工撰写 |

Few-shot 数据放 `lib/compiler/prompts/_fewshot/` 目录，按 `concept.fewshot.json` 等命名。

### 8.3 V2 阶段：A/B 评估框架（计划）

引入 promptfoo 或自建评估集，对每个 Agent 跑 N 次固定输入，统计：
- Schema 通过率
- 输出稳定性（多次运行方差）
- 业务约束达成率（如 Concept 数 ∈ [2,5]）

详见 [`docs/prompt-evaluation.md`](./prompt-evaluation.md)。

---

## 9. 9 个 Agent 的 Prompt 设计要点

> 完整 Prompt 模板见 `lib/compiler/prompts/*.md`。本节仅列出每个 Agent 的**关键设计决策**，便于评审与回溯。

### 9.1 Import Agent

- **职责**：标准化 Markdown，不修改语义
- **system 段**：1 段角色定义 + JSON 输出规则引用
- **关键约束**：
  - 保留代码块（```...```）
  - 保留列表结构
  - 合并多余空行（连续 ≥ 2 个空行 → 1 个）
  - 统一标题层级（顶层 # 只允许 1 个，其余递降）
- **输出**：`{normalizedText, stats: {originalLength, normalizedLength, removedElements}}`

### 9.2 Chunk Agent

- **职责**：按 H2/H3 切分，单 Chunk 200-800 字
- **关键约束**：
  - 优先按 H2/H3 切分；若单节超 800 字，按段落二次切分
  - 单 Chunk < 200 字时，尝试与下一节合并
  - 代码块不切分（即使超 800 字）
  - 每个 Chunk 必须有 heading 字段（取最近的 H2/H3 文本）
- **输出**：`{chunks: [{id, text, heading}]}`

### 9.3 Concept Agent

- **职责**：从 `Chunk[]` 提取 2-5 个原子概念
- **system 段**：嵌入 Scaria PS5 风格（CoT 指令 + Bloom 层级定义）
- **关键约束**：
  - 总数 ∈ [2, 5]
  - 单 Chunk 提取 ≤ 2 个
  - `definition` ≤ 30 字
  - `keyPoints` 每条 ≤ 15 字，共 2-4 条
  - `type` ∈ `fact | procedure | theory`
  - 不要提取琐碎细节（如"X 的具体版本号是 1.0"）
  - 不要提取跨章节的元概念（如"本文介绍了 RAG"）
- **输出**：`{concepts: [{id, name, definition, type, keyPoints, parentChunkId}]}`

### 9.4 Module Agent

- **职责**：把 Concept[] 聚类为单个 Module（MVP 固定单 Module）
- **关键约束**：
  - `title` ≤ 20 字，概括核心主题
  - `intro` ≤ 40 字，用"完成本模块后，你能……"句式
  - `goal` ≤ 30 字，费曼目标（如"解释 X 是什么、为什么需要它"）
  - `concepts` 按"理解顺序"线性排列（基础在前）
- **输出**：`{title, intro, goal, concepts: [{id, order}]}`（不含 QuizSeries 与 FeynmanTask，由后续 Agent 填充）

### 9.5 Mission Agent

- **职责**：为每个 Concept 生成 QuizSeries 占位符（不生成具体题）
- **system 段**：嵌入 Quiz Ladder 4 层级定义 + 表达层级 3 级定义
- **关键约束**（PRD §7.5）：
  - 每个 Concept 的占位符数 ∈ [8, 15]
  - **层级分布**：Recognition 30-40% / Discrimination 30-40% / Application 20-30%（MVP 不含 Association）
  - **表达层级分布**：Level 1（Choice）≥ 60% / Level 2（Sorting）≤ 20% / Level 3（Fill Blank）≤ 20%
  - **前 2 个占位符强制**：`{ladderLevel: 1, interactionType: 'choice', expressionLevel: 1}`
  - expressionLevel 在 Concept 内**单调非递减**（局部可平级，不可下降）
- **输出**：`{seriesByConcept: {conceptId: QuizPlaceholder[]}}`

### 9.6 Quiz Agent

- **职责**：根据占位符生成完整 Quiz
- **system 段**：嵌入 Quiz Ladder 层级指导 + 干扰项规则 + JSON 输出规则
- **关键约束**：
  - `stem` 清晰，用户无需思考"题目要我做什么"
  - Choice 题：4 选项，1 正确 + 3 干扰
  - 干扰项 **plausible but wrong**（详见 [`_shared/distractor-rules.md`](../lib/compiler/prompts/_shared/distractor-rules.md)）
  - 正确答案**不能通过常识排除法猜出**
  - `explanation` 同时说明"为什么对"和"为什么错"
  - `distractors` 字段列出干扰项特征（用于答错后生成同类新题）
  - **正确答案位置**：在 JSON 中始终放 `options[0]`，渲染时打乱（ClassBuild 模式，消除 parser bug）
  - **答错重试场景**：保留 conceptId / ladderLevel / interactionType / expressionLevel；更换 stem 与至少 2 个 distractors
- **温度**：0.7（Scaria et al. 实证最佳区间）
- **输出**：完整 `Quiz` 对象

### 9.7 Feynman Agent

- **职责**：生成 6 步费曼任务序列 + Rubric
- **关键约束**：
  - **Step 1-4** Choice（4 选项）：
    - Step 1：题干"如果让你解释 {goal}，第一句话应该是什么？"
    - Step 2：题干"接下来应该解释什么方向？"
    - Step 3：题干"如果对方没懂，你会举什么例子？"
    - Step 4：题干"下面四个完整解释，哪一个最好？" —— 4 选项质量分层（优秀 / 良好 / 一般 / 错误）
  - **Step 5** Fill Blank："请补充一句话：____"，空白处 ≤ 30 字
  - **Step 6** 开放输出（无占位符，由前端 finalPrompt 渲染）
  - `rubric` 3-5 个关键点，每点 ≤ 20 字，必须是 Concept 核心（不是细节）
  - Step 1-4 的选项必须覆盖**不同的解释策略**，让用户内化"如何组织一个解释"
- **温度**：0.7
- **输出**：`{steps: [{order, type, stem, options, answer, explanation}], finalPrompt, rubric}`

### 9.8 Feedback Agent（运行时）

- **职责**：评估用户答案
- **关键约束**（PRD §7.8）：
  - `score` ∈ [0, 100]
    - Choice/Sorting：全对 = 100、错 = 0
    - Fill Blank：关键词全命中 = 100、部分 = 50、无 = 0
  - `gaps`：Choice/Sorting 答错时列出 ≤ 2 条用户忽略的关键点
  - `next_action` ∈ `advance | retry`；score ≥ 80 → advance，< 80 → retry
  - `feedback_text` ≤ 50 字，**鼓励性语气**
  - 禁用词：错误、失败、不正确、错了、不行（替换为"差一点""再想想""关键在于"）
- **温度**：0.1（评分确定性）
- **性能**：P95 ≤ 1.5s（用 flash 模型 + 简化 Prompt）
- **Fill Blank 精确匹配兜底**（PRD §10.5）：若 Feedback 判错但客户端 `normalize(userAnswer) === normalize(answer)`，覆盖为 advance

### 9.9 Feynman Evaluator（运行时）

- **职责**：评分用户 Step 6 开放输出
- **system 段**：私有 CoT 模式（Khanmigo）+ paraphrase-tolerant rubric（Ragas 风格）+ KELE 9 维度部分裁剪
- **关键约束**（PRD §7.9）：
  - `score` = 各 rubric 点命中得分之和（每点满分 = 100 / rubric.length，部分命中 = 半分）
  - `rubricResults`：`[{point, hit: 'full' | 'partial' | 'none', comment}]`
  - `gaps`：`hit='none'` 的 rubric 点列表
  - `sampleAnswer`：AI 生成的高质量范文（150-300 字）
  - **评分宽容**：触及关键点核心含义即视为 hit，不要求字面一致
- **温度**：0.2（评分需要少量宽容度，但主轴稳定）
- **性能**：P95 ≤ 3s
- **私有 CoT**：Prompt 要求 LLM 先在 `reasoning` 字段输出分析（每 rubric 点命中判断），再输出 `rubricResults` 与 `score`。这样 LLM "想清楚再答"，分数更稳定。

---

## 10. 文件清单

本 Prompt 工程阶段共产出 24 个文件：

| # | 文件 | 类型 | 用途 |
|---|---|---|---|
| 1 | `docs/Prompt-Engineering.md` | 文档 | 本文件（总文档） |
| 2 | `docs/prompt-evaluation.md` | 文档 | M2 评估方案 |
| 3-6 | `lib/compiler/prompts/_shared/*.md` | Prompt 片段 | 共享 JSON/层级/干扰项规则 |
| 7-13 | `lib/compiler/prompts/{import,chunk,concept,module,mission,quiz,feynman}.md` | Prompt 模板 | 7 个编译期 Agent |
| 14-15 | `lib/compiler/prompts/{feedback,feynman-eval}.md` | Prompt 模板 | 2 个运行时 Agent |
| 16-24 | `lib/compiler/schemas/*.ts` | Zod Schema | 9 个 Agent 输出校验骨架 |

完整文件树：

```
docs/
├── Prompt-Engineering.md
└── prompt-evaluation.md

lib/compiler/prompts/
├── _shared/
│   ├── json-output-rules.md
│   ├── ladder-level-explanation.md
│   ├── expression-level-explanation.md
│   └── distractor-rules.md
├── import.md
├── chunk.md
├── concept.md
├── module.md
├── mission.md
├── quiz.md
├── feynman.md
├── feedback.md
└── feynman-eval.md

lib/compiler/schemas/
├── import.ts
├── chunk.ts
├── concept.ts
├── module.ts
├── mission.ts
├── quiz.ts
├── feynman.ts
├── feedback.ts
└── feynman-eval.ts
```

---

## 11. 与上游文档的映射表

| 上游章节 | 本文档章节 | 实现要点 |
|---|---|---|
| Spec §1.3 五条原则 | §1.1 | 每条原则 → Prompt 中的具体指令 |
| Spec §9 学习心理学 | §1.2 | 6 项原则 → Prompt 中的具体指令 |
| Spec §7.2 Prompt 框架 | §3, §9 | 7 Agent + 2 运行时 Agent 设计要点 |
| PRD §7 AI Agent 规格 | §9 | IO 契约直接对齐 |
| PRD §10 设计决策 | §1, §9.6 | Fill Blank 双策略 / Quiz Ladder 合并 |
| PRD §15 开放问题 | §12 | LLM 提供商 / Markdown 字数 / Feynman 字数 / 跳过 Concept / 多语言 |
| Tech §3 Provider 抽象 | §2.2, §6 | DeepSeek/GLM 实战要点写入 Provider 配置 |
| Tech §4.3 Agent 调用模板 | §6.3 | retry 策略对齐 |
| Tech §9 Prompt 工程架构 | §4, §10 | 模板组织 / 文件清单对齐 |
| Tech §10 性能优化 | §7 | 模型分层 / 温度 / maxTokens |

---

## 12. 开放问题（M2 期间需澄清）

继承 PRD §15 与 Tech §17.2。M2 阶段（Prompt 工程闭环）需在 W2-3 内澄清：

| # | 问题 | 当前倾向 | 验证方式 |
|---|---|---|---|
| 1 | **DeepSeek / GLM 具体模型名** | 编译用 `glm-5.2`，Feedback 用 `glm-5-turbo`；DeepSeek 编译用 `deepseek-v4-pro`，Feedback 用 `deepseek-v4-flash` | M2 末用固定测试集跑 5 次，比较 Schema 通过率与质量 |
| 2 | **Prompt 中文/英文选择** | 中文为主（已定） | 同上 A/B |
| 3 | **Feynman Step 6 字数下限处理** | < 100 字时提示但不阻断（PRD §15.3 已建议） | M5 内测观察 |
| 4 | **Prompt 模板版本管理** | git 主版本 + 副本实验 + `PROMPT_VERSION` 环境变量 | M2 引入 |
| 5 | **Few-shot 何时引入** | V1.1 阶段，仅 Concept / Quiz / Feynman Eval 三个 Agent | M7 内测反馈后定 |
| 6 | **GLM enable_thinking 默认值** | Feedback / Feynman Eval 关闭（确定性优先），Quiz / Feynman 生成可开启 | M2 A/B |

---

## 13. 修订记录

| 版本 | 日期 | 修订 | 作者 |
|------|------|------|------|
| 1.0 | 2026-07-06 | 初稿，对齐 Spec V1.0 + PRD V1.0 + Tech V1.0；综合 4 份检索报告 | — |

---

## 附录 A：术语表（继承 + 本文件新增）

继承 [Spec 附录 A](./Product-Specification.md#附录-a术语表) + [PRD §0.3](./PRD.md#03-术语)。本文件新增：

| 术语 | 定义 |
|---|---|
| Agent Kind | Agent 类型枚举，对应 9 个 Agent：`import | chunk | concept | module | mission | quiz | feynman | feedback | feynman-eval` |
| 占位符（Placeholder） | Mission Agent 输出的 Quiz 元数据（conceptId + ladderLevel + interactionType + expressionLevel），不含具体题目 |
| Item Writing Flaw（IWF） | 经典测量学定义的题目编写缺陷（详见 [`_shared/distractor-rules.md`](../lib/compiler/prompts/_shared/distractor-rules.md)） |
| Overgenerate-and-Rank | 先生成 N 个候选干扰项，再用 ranker 选 Top-3 的模式 |
| Paraphrase-tolerant | 评分时容忍同义表达，"触及核心含义即视为 hit" |

---

## 附录 B：5 份检索报告 take-away 一图速查

| 维度 | 最佳参考 | 一句话 take-away |
|---|---|---|
| Pipeline 架构 | Instructional Agents（EACL 2026） | ADDIE + 自纠正循环 + typed JSON eval |
| 出题质量 | ClassBuild（github） | 正确答案永远放 A + 渲染时打乱；distractor 来自 misconception |
| Bloom 层级 Prompt | Scaria et al. PS5（AIED 2024） | CoT + skill 定义 + 示例；但模型质量 > Prompt 复杂度 |
| 干扰项生成 | Overgenerate-and-Rank（BEA 2024） | 生成 10 个，选 Top-3，Partial match +21% |
| Socratic 评分 | KELE（EMNLP 2025） | 9 维 rubric；微调 9B 反超 GPT-4o |
| JSON 输出 | DeepSeek + GLM 官方文档 | 都只支持 `json_object`；客户端 Zod 强制校验 |
| Feynman Rubric | DeepEval GEval + Ragas faithfulness | 私有 CoT + statement 级别判定 + paraphrase-tolerant |

---

> **文档结束**
>
> 本文档定义了 AI Learning Compiler V1 MVP 的 Prompt 工程方案。任何修改应：
> 1. 不违反规格书第一章五条产品原则与第九章心理学基础
> 2. 不违反 PRD §7 AI Agent 输入输出契约
> 3. 经产品 + 工程 + AI 工程师三方评审
>
> 后续 9 个 Prompt 模板（`lib/compiler/prompts/*.md`）与 9 个 Zod Schema（`lib/compiler/schemas/*.ts`）均应从本文档拆解。
