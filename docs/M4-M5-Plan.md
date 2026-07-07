# M4-M5 合并工作计划（学习循环 + 费曼闭环）

> **M4-M5 Plan V1.0**
> 状态：Draft | 日期：2026-07-08
> 定位：PRD §14 第四+第五个正式里程碑，合并开发
> 范围：[FR-03 Quiz 交互](./PRD.md#fr-03-quiz-交互系统quiz-interaction) + [FR-04 反馈与重试](./PRD.md#fr-04-反馈与重试机制feedback--retry) + [FR-06 Module Feynman](./PRD.md#fr-06-module-feynman模块费曼) + [FR-07 掌握度追踪](./PRD.md#fr-07-掌握度追踪mastery-tracking) + [FR-08 进度持久化](./PRD.md#fr-08-进度持久化progress-persistence)
> 验收：从粘贴 Markdown → 完成费曼 6 步 → 看到掌握度报告，全流程可在浏览器走通
>
> 承接：[M3-Review](./M3-Review.md) 交付的 `compileMarkdown()` + `/api/compile` SSE 端点

---

## 0. 为什么合并 M4 和 M5

PRD §14 原本把 M4（学习循环闭环）和 M5（费曼闭环）拆成两个里程碑。实际规划后发现两者高度耦合，拆开会导致大量返工：

1. **状态机共享**：`ModuleStage` 是一条贯穿 `module_intro → concept → challenge → feynman_intro → feynman_step → feynman_final → done` 的链。M4 做 concept 分支、M5 做 feynman 分支，但它们是同一状态机的不同段，拆开实现意味着两次状态机重构
2. **持久化统一**：FR-08 要求 `ProgressState` + `AttemptRecord` + `FeynmanAttempt` 全部持久化到 LocalStorage。M4 写 progress/attempts store，M5 追加 feynman store，两次改同一个持久化层
3. **UI 组件复用**：Feynman Step 1-4 是 Choice 题（复用 M4 的 ChoiceQuiz 组件），Step 5 是 Fill Blank（复用 FillBlankQuiz 组件）。拆开要么 M4 先做组件 M5 复用（强依赖），要么各自重复
4. **API 端点模式一致**：`/api/feedback` 和 `/api/feynman-eval` 都是"用户答案 → LLM 评分 → 结构化反馈"模式。一次设计、两次实现

合并后可以在第一个 Sprint 就把状态机、持久化层、组件库基础设施全部定好，后续填业务逻辑时零返工。

---

## 1. 范围

### 1.1 包含（Must）

| # | 工作项 | 来源 | 交付物 |
|---|--------|------|--------|
| W1 | **状态机 + 持久化层** | Tech Spec §5.1 / §6 / FR-08 | `lib/state/`（5 个 Zustand store）+ `lib/persistence/`（repository + local-storage + quota）+ `lib/runtime/`（mastery 纯函数 + retry-policy）|
| W2 | **导入页 + 编译中页** | FR-01 / FR-02 / US-02/04/06 | `app/learn/import/page.tsx` + `app/learn/compiling/page.tsx`：Markdown 输入 → 字数校验 → SSE 流式进度 → Module 写入 LocalStorage |
| W3 | **课程概览页 + Module 导言页** | US-05 / FR-03 前置 | `app/learn/overview/page.tsx` + `app/learn/module/[id]/page.tsx`（module_intro 态）：Module 概览 → Concept 列表 → 预计时长 → "开始学习" |
| W4 | **Quiz 三组件 + Concept 学习主体** | FR-03 / Tech Spec §5.2 | `components/quiz/`（ChoiceQuiz / SortingQuiz / FillBlankQuiz）+ Concept 学习页（状态机 concept 态）：渲染题目 → 作答 → 反馈 → advance/retry |
| W5 | **Feedback + Regenerate API** | FR-04 / Tech Spec §5.2-5.3 | `app/api/feedback/route.ts` + `app/api/regenerate/route.ts`：Feedback Agent 评分 → score/gaps/next_action → retry 时 quiz-batch Agent 生成同类型新题 |
| W6 | **Feynman 6 步序列** | FR-06 / Tech Spec §5.5 | `components/feynman/`（Step1-4 Choice + Step5 FillBlank + Step6 开放输出）+ Feynman 学习页（feynman_intro → feynman_step → feynman_final）|
| W7 | **Feynman-Eval API + 完成页** | FR-06 AC3-5 / FR-07 | `app/api/feynman-eval/route.ts`（Step6 Rubric 评分）+ `app/learn/done/page.tsx`（Mastery 卡片 + 概念掌握度 + 费曼得分）|
| W8 | **集成测试 + E2E smoke** | 全部 FR 的 AC | vitest 单测（mastery/retry-policy/quota 纯函数）+ Playwright E2E（全流程走通）|

### 1.2 包含（Should，资源允许时）

| # | 工作项 | 说明 |
|---|--------|------|
| W9 | **Module Challenge（FR-05）** | PRD 标注 Should。3-5 道跨概念综合题，在所有 Concept 完成后、Feynman 之前出现。反馈机制复用 FR-04。若 W1-W8 耗时超预期推迟到 M6 |
| W10 | **断点续编** | M3-Review §7 推迟项。刷新页面后从同一 `ProgressState` 恢复。W1 持久化层就位后自然支持，只需验证 |

### 1.3 不包含（属 M6 或更后）

- **Module Challenge 正式实现**（若 W9 不做 → M6）
- **正式完成页**（M6：含被跳过概念复习入口、历史 Module 列表）
- **PDF / 网页输入**（V3）
- **多 Module 课程**（V2）
- **跨设备同步**（V2）

---

## 2. 已就位的基础设施（M1-M3 遗产）

以下模块已在 M1-M3 完成，M4-M5 直接使用，无需重建：

### 2.1 编译器 pipeline（M3）

| 文件 | 用途 |
|------|------|
| `lib/compiler/pipeline/` | `compileMarkdown()` 异步生成器 + `CompileEvent` + `CompileConfig` + `CompileErrorPayload` |
| `app/api/compile/route.ts` | SSE 端点，POST → 流式返回 Module JSON |
| `lib/compiler/agents/` | `runAgent()` + `AGENT_CONFIG` + mappers + errors |
| `lib/compiler/schemas/feedback.ts` | Feedback Agent 输出 Schema（score/gaps/next_action/feedback_text）**已定义** |
| `lib/compiler/schemas/feynman-eval.ts` | Feynman-Eval Agent 输出 Schema（score/rubricResults/gaps/sampleAnswer）**已定义** |

### 2.2 领域类型（M1）

`types/domain.ts` 已定义全部运行时类型：
- `ModuleStage`（7 种状态 discriminated union）
- `ProgressState`（moduleId + stage + updatedAt）
- `AttemptRecord`（originalQuizId + attemptVersion + score + gaps + nextAction）
- `Mastery`（moduleCompletion + conceptMastery[] + feynmanScore）
- `FeynmanAttempt`（stepResults + finalOutput + finalScore + finalGaps）

### 2.3 持久化 Key 规范（M1）

`lib/persistence/keys.ts` 已定义全部 LocalStorage key 模板：
- `StorageKeys.module(id)` / `.mastery(id)` / `.attempts(quizId)` / `.feynman(id)` / `.progress(id)` / `.settings`
- 容量阈值：`STORAGE_WARN_BYTES`（4.5MB）/ `STORAGE_HARD_LIMIT_BYTES`（5MB）/ `STORAGE_MAX_HISTORY_MODULES`（3）

### 2.4 UI 设计稿（M1）

`docs/ui-design/` 下 19 个 HTML 原型 + 4268 行 DESIGN-SPEC.md，覆盖全部 10 个页面：
- 01-home / 02-compiling / 03-overview / 04-intro
- 05-learn-choice / 06-learn-sorting / 07-learn-fill-blank
- 08-challenge / 09-feynman-steps / 09-feynman-final / 10-done / 11-error

设计语言：学术沉静（Scholarly Stillness），暗色优先，阶梯隐喻，克制优雅微交互。

### 2.5 脚手架

- `app/settings/page.tsx`：M1 Settings 页骨架
- `app/page.tsx` + `app/layout.tsx`：M1 根布局
- `.prettierrc.json` + `eslint.config.mjs` + husky pre-commit（M2.5 质量门禁）
- `vitest.config.ts`（M2 测试框架）

---

## 3. 交付物详情

### W1 状态机 + 持久化层

**新增文件**：

```
src/lib/
├── state/
│   ├── settings-store.ts     # LLM Provider/API Key/模型名（persist）
│   ├── module-store.ts       # 当前 Module + 当前 Quiz 引用（persist）
│   ├── progress-store.ts     # ProgressState 状态机（persist）
│   ├── attempts-store.ts     # AttemptRecord[]（persist）
│   └── compile-store.ts      # 编译过程临时状态（不 persist）
├── persistence/
│   ├── repository.ts         # Repository 接口（CRUD 抽象）
│   ├── local-storage.ts      # LocalStorage 实现
│   └── quota.ts              # 4.5MB 预警 + 历史淘汰
├── runtime/
│   ├── mastery.ts            # computeMastery 纯函数（Tech Spec §5.4）
│   ├── retry-policy.ts       # 连续 3 次失败强制 advance（FR-04）
│   └── fill-blank.ts         # Fill Blank 标准化匹配（精确兜底）
```

**状态机设计**（Tech Spec §5.1）：

```typescript
// progress-store.ts 核心转移逻辑
type Transition =
  | { from: 'module_intro'; trigger: 'start'; to: { kind: 'concept'; conceptIndex: 0; quizIndex: 0 } }
  | { from: 'concept'; trigger: 'advance'; to: 'next-quiz-or-next-concept' }
  | { from: 'concept(末题)'; trigger: 'advance'; to: 'challenge-or-feynman-intro' }
  | { from: 'feynman_intro'; trigger: 'start-feynman'; to: { kind: 'feynman_step'; stepOrder: 1 } }
  | { from: 'feynman_step'; trigger: 'advance'; to: 'next-step-or-feynman-final' }
  | { from: 'feynman_final'; trigger: 'submit'; to: { kind: 'done' } }
```

转移规则全部在 `progress-store.ts` 内封装，UI 只调 `useProgressStore().advance()` / `.retry()`，不直接操作 stage。

**答错 retry 的状态语义**（Tech Spec §5.3）：
- retry **不触发状态机转移**（quizIndex 不变）
- `module-store` 中当前 Quiz 引用替换为 `replacementQuiz`
- `attempts-store` 追加 `AttemptRecord`（`originalQuizId` 指向最初槽位，`attemptVersion` 递增）
- 连续 3 次失败 → `retry-policy.ts` 强制 advance

**Mastery 计算**（Tech Spec §5.4）：
- `computeMastery(module, attempts, feynmanAttempt)` 纯函数
- `conceptMastery` = 每 Concept 内所有槽位的"首次答对率"（`attemptVersion=0 && score≥80`）
- `moduleCompletion` = 已完成 Quiz 数 / 总 Quiz 数（含 Feynman Step 1-6）
- 每次作答后由 `progress-store` 触发重算，结果写入 `mastery-store`（仅缓存，启动时从 attempts 重算）

### W2 导入页 + 编译中页

**导入页** `app/learn/import/page.tsx`：
- UI 参考：`docs/ui-design/01-home.html` + `DESIGN-SPEC §5.1`
- 功能：
  - Markdown 文本框（textarea 或 CodeMirror 轻量版）
  - 实时字数计数器（200-20000 范围，80/450 阈值金棕渐进过渡，DESIGN-SPEC §4.4.3）
  - "开始编译"按钮（字数校验通过后激活）
  - 从 `settings-store` 读取 LLM 配置；未配置时跳 Settings 页
- 数据流：用户点击编译 → 路由到 `/learn/compiling?source=<tempId>`

**编译中页** `app/learn/compiling/page.tsx`：
- UI 参考：`docs/ui-design/02-compiling.html` + `DESIGN-SPEC §5.2`
- 功能：
  - `EventSource` 连接 `/api/compile` SSE 端点
  - 按 `stage_enter` 切换阶段文案（"正在切分知识块 → 提取概念 → 生成练习"）
  - 按 `progress.percent` 推进进度条
  - `complete` 事件 → Module JSON 写入 `module-store` + LocalStorage → 路由到 `/learn/overview`
  - `error` 事件 → 显示 `CompileErrorPayload.message` + hint + 重试按钮（US-06）
  - Agent 超时抚慰态：单 stage 静默 > 15s 显示友好提示（DESIGN-SPEC §5.2.6）

### W3 课程概览页 + Module 导言页

**课程概览页** `app/learn/overview/page.tsx`：
- UI 参考：`docs/ui-design/03-overview.html`
- 功能：
  - Module 标题 + intro + goal
  - Concept 列表（名称 + 类型 + 预计题数）
  - 预计学习时长（按 Quiz 数 × 15s + Feynman 6 步估算）
  - "开始学习"按钮 → 写入 `progress-store`（`module_intro` 态）→ 路由到 module 页

**Module 学习主体** `app/learn/module/[id]/page.tsx`：
- 这是状态机路由器：读 `progress-store.stage`，渲染对应组件
- `module_intro` → 导言组件（Module title/intro/goal + "开始"按钮）
- `concept(i, q)` → Concept 学习组件（W4）
- `challenge(q)` → Challenge 组件（W9，若做）
- `feynman_intro` → 费曼导言组件
- `feynman_step(k)` → 费曼步组件（W6）
- `feynman_final` → 费曼最终输出组件（W6）
- `done` → 路由到完成页（W7）

### W4 Quiz 三组件 + Concept 学习主体

**Quiz 组件** `components/quiz/`：

| 组件 | 交互 | UI 参考 | 关键约束 |
|------|------|---------|---------|
| `ChoiceQuiz.tsx` | 4 选项点击，一次提交 | `05-learn-choice.html` | 提交后立即显示反馈；选项打乱（前端 shuffle options[0]）|
| `SortingQuiz.tsx` | 3-5 项拖拽排序 | `06-learn-sorting.html` | 桌面拖拽 + 移动端上下箭头（DESIGN-SPEC §4.2.2）|
| `FillBlankQuiz.tsx` | 1-3 关键词输入 | `07-learn-fill-blank.html` | 宽度自适应（§4.2.3）；标准化匹配 + Feedback Agent 双策略 |

**Concept 学习流程**（Tech Spec §5.2 `gradeAttempt`）：

```
用户作答
  → POST /api/feedback { quiz, userAnswer }
  → Feedback Agent 返回 score / gaps / next_action / feedback_text
  → Fill Blank 标准化兜底（精确匹配命中 → 覆盖为 advance）
  → retry-policy 判断连续失败次数
  → advance：progress-store.advance() → 下一题
  → retry：POST /api/regenerate → replacementQuiz → module-store 替换当前 quiz
  → 追加 AttemptRecord → 重算 Mastery → UI 更新
```

**反馈面板**（DESIGN-SPEC §4.6）：
- 答对：1px 绿色细线从底部 `scaleX(0→1)` 展开 + feedbackText
- 答错：温和琥珀色边框 + explanation 展开（`grid-template-rows` 动画）
- 不用红色叉号、不用"错误"字样（FR-04 约束 + feedbackSchema 负面词过滤）

### W5 Feedback + Regenerate API

**`/api/feedback`** `app/api/feedback/route.ts`：

```typescript
// POST { quiz, userAnswer, llmConfig } → { score, gaps, next_action, feedback_text }
export async function POST(req: NextRequest) {
  const { quiz, userAnswer, llmConfig } = await req.json()
  const provider = createProvider(llmConfig)
  const out = await runAgent('feedback', { quiz, userAnswer }, provider, feedbackSchema)
  return Response.json(mapFeedback(out))  // snake_case → camelCase
}
```

- 复用 M2 已定义的 `feedbackSchema` + M2.5 的 `mapFeedback` mapper
- Node Runtime（Feedback Agent 需调 LLM）
- 响应延迟 P95 ≤ 1.5s（FR-03 AC6）

**`/api/regenerate`** `app/api/regenerate/route.ts`：

```typescript
// POST { conceptId, ladderLevel, interactionType, expressionLevel, originalDistractors, llmConfig }
//   → { quiz: Quiz（同类型新题，干扰项已更换） }
```

- 复用 quiz-batch Agent 的 schema + prompt，但只生成 1 道
- 输入 `originalDistractors` 避免重复（Prompt 注入"以下干扰项已用过，必须更换"）
- 若 quiz-batch Agent 不适合单题场景，降级用原 `quiz` Agent（单题 schema）

### W6 Feynman 6 步序列

**Feynman 组件** `components/feynman/`：

| 组件 | Step | 复用 | UI 参考 |
|------|------|------|---------|
| `FeynmanChoiceStep.tsx` | 1-4 | 复用 `ChoiceQuiz` 组件 | `09-feynman-steps.html` |
| `FeynmanFillStep.tsx` | 5 | 复用 `FillBlankQuiz` 组件 | 同上 |
| `FeynmanFinalStep.tsx` | 6 | 新建（开放文本输出 + Rubric 展示） | `09-feynman-final.html` |

**Step 1-4 行为**（FR-06 约束）：
- 答错**不重试**（费曼脚手架低焦虑），显示 explanation 后 advance
- Step 4 的 4 选项必须真实不同质量（优秀/良好/一般/错误）

**Step 6 行为**（FR-06 AC3-8）：
- 开放文本输出，建议 100-500 字
- 提交 → POST `/api/feynman-eval` → Rubric 各点命中情况 + 总分
- 显示 sampleAnswer（高质量范文，≥ 150 字）
- 允许"重写一次"（最多 2 次提交）

**状态机集成**：
- `feynman_intro` → 显示费曼任务说明 + finalPrompt → "开始"按钮
- `feynman_step(1-5)` → 渲染对应组件 → advance → 下一 step
- `feynman_final` → 渲染 Step6 → submit → `done`

### W7 Feynman-Eval API + 完成页

**`/api/feynman-eval`** `app/api/feynman-eval/route.ts`：

```typescript
// POST { finalPrompt, rubric, userOutput, llmConfig }
//   → { score, rubricResults, gaps, sampleAnswer }
export async function POST(req: NextRequest) {
  const { finalPrompt, rubric, userOutput, llmConfig } = await req.json()
  const provider = createProvider(llmConfig)
  const out = await runAgent('feynman-eval', { finalPrompt, rubric, userOutput }, provider, feynmanEvalSchema)
  return Response.json(out)
}
```

- 复用 M2 已定义的 `feynmanEvalSchema`
- Prompt 中明确评分宽容策略："触及关键点的核心含义即视为 hit"（Tech Spec §5.5）

**完成页** `app/learn/done/page.tsx`：
- UI 参考：`docs/ui-design/10-done.html`
- 功能：
  - Mastery 卡片：moduleCompletion % + 各 concept 掌握度条
  - Feynman 得分 + Rubric 命中详情
  - "重新学习" / "导入新内容"入口
  - （Should）被跳过概念的复习入口（DESIGN-SPEC §5.10.6）

### W8 集成测试 + E2E smoke

**A. 纯函数单测**（vitest，CI 友好）：

| 模块 | 测试文件 | 覆盖 |
|------|---------|------|
| `mastery.ts` | `runtime/__tests__/mastery.test.ts` | 边界值：空 attempts / 全对 / 全错 / 部分重试 / feynmanAttempt 缺失 |
| `retry-policy.ts` | `runtime/__tests__/retry-policy.test.ts` | 连续 1/2/3 次失败 → advance / advance / force-advance |
| `fill-blank.ts` | `runtime/__tests__/fill-blank.test.ts` | 大小写 / 首尾空格 / 全半角 / 语义相似度边界 |
| `quota.ts` | `persistence/__tests__/quota.test.ts` | 淘汰最旧 Module / 4.5MB 预警触发 |

**B. 组件测试**（vitest + @testing-library/react）：
- ChoiceQuiz / SortingQuiz / FillBlankQuiz 的渲染 + 交互 + 回调
- FeynmanFinalStep 的字数计数 + 提交

**C. E2E smoke**（Playwright）：
- 全流程：导入 `__fixtures__/rag-medium.md` → 编译 → 概览 → 做 2 道 Quiz（1 对 1 错 retry）→ Feynman 6 步 → 完成页
- 使用 mock LLM（拦截 `/api/feedback` `/api/feynman-eval` 返回 canned 响应）
- 目标：1 个 happy path E2E 通过

---

## 4. 关键设计决策

### 4.1 Zustand vs React Context / Redux

**决策**：Zustand。

**理由**：
- Tech Spec §6 已规划 Zustand store 划分
- Zustand 的 `persist` middleware 天然支持 LocalStorage（FR-08）
- 比 Redux 少 60% 样板代码；比 Context 不会引发全树 re-render
- 状态机逻辑封装在 store actions 里，UI 只订阅 + dispatch

### 4.2 状态机用 XState 还是手写？

**决策**：手写 discriminated union + 转移函数。

**理由**：
- Tech Spec §5.1 已定义 `ModuleStage` 为 7 种状态的 union type
- 状态只有 7 个，转移规则只有 ~10 条，XState 的可视化/时间旅行调试对 MVP 过重
- TypeScript 的 exhaustive check 能在编译期捕获非法转移

### 4.3 Quiz 组件：一个泛型组件还是三个独立组件？

**决策**：三个独立组件（ChoiceQuiz / SortingQuiz / FillBlankQuiz）。

**理由**：
- 三种交互差异大（点击 vs 拖拽 vs 输入），泛型化会让 props 接口复杂
- DESIGN-SPEC 对每种组件有独立的微交互规范
- 独立组件便于单独测试和迭代

### 4.4 Regenerate 用 quiz-batch 还是单题 quiz Agent？

**决策**：优先用单题 quiz Agent（`quiz` schema），保留 quiz-batch 作为 fallback。

**理由**：
- regenerate 只需生成 1 道题，用 quiz-batch（一次 10+ 道）浪费
- M2 已定义 `quizSchema`（单题），M3 的 quiz-batch schema 内部复用了 `quizItemSchema`，两者兼容
- 若单题 quiz Agent 的 Schema 通过率不稳定（M2.5 smoke 未测单题模式），降级用 quiz-batch 取首题

### 4.5 Module Challenge 是否纳入 M4-M5？

**决策**：Should 项（W9），视 W1-W8 进度决定。

**理由**：
- FR-05 标注 Should，不阻塞 MVP 可用性
- Challenge 组件复用 ChoiceQuiz + SortingQuiz，开发量不大（~1 天）
- 状态机已有 `challenge` 分支预留，插入成本低
- 若 W1-W8 耗时超预期，推迟到 M6

---

## 5. 工作分解与依赖

```
W1 状态机+持久化 ──► W2 导入+编译中 ──► W3 概览+导言 ──► W4 Quiz+Concept
                                                            │
                                                            ▼
                                         W5 Feedback API ◄──┤
                                                            │
W6 Feynman 序列 ◄───────────────────────────────────────────┤
                                                            │
                                         W7 Feynman-Eval+Done ◄──┤
                                                            │
                                                            ▼
                                              W8 集成测试+E2E
```

**建议顺序**：
1. **W1** 先行：状态机 + 持久化 + mastery 纯函数是所有 UI 的基础
2. **W2 + W3** 并行：导入/编译中 和 概览/导言 可以同时开发
3. **W5** Feedback/Regenerate API：W4 依赖它才能跑通作答流程
4. **W4** Quiz 三组件 + Concept 学习：最大工作量块
5. **W6** Feynman 序列：复用 W4 组件，增量开发
6. **W7** Feynman-Eval API + 完成页
7. **W8** 贯穿全程（纯函数单测随 W1 写，E2E 在 W7 后写）

**工作量预估**（粗估，单人）：

| 工作项 | 预估天数 |
|--------|---------|
| W1 状态机+持久化 | 3-4 天 |
| W2 导入+编译中 | 2 天 |
| W3 概览+导言 | 1-2 天 |
| W5 Feedback+Regenerate API | 1-2 天 |
| W4 Quiz+Concept | 4-5 天 |
| W6 Feynman 序列 | 2-3 天 |
| W7 Feynman-Eval+Done | 2 天 |
| W8 测试 | 2-3 天 |
| **合计** | **17-23 天（~3-4 周）** |

---

## 6. 验收标准

| 验收项 | 目标 | 验证 |
|--------|------|------|
| 导入→编译→概览全流程 | Markdown → Module JSON → 概览页渲染 | 手动走通 + E2E smoke |
| Choice/Sorting/FillBlank 三组件可用 | 三种交互题均可作答并收到反馈 | 组件测试 + 手动 |
| 答对 advance / 答错 retry | Feedback Agent 返回正确 next_action | W5 API 单测 |
| 连续 3 次失败强制 advance | retry-policy 触发 | retry-policy.test.ts |
| Feynman 6 步完整走通 | Step1-6 全部可作答 + Step6 评分 | E2E smoke |
| Step6 Rubric 评分 | 各点命中情况 + 总分 + sampleAnswer | feynman-eval API 手动验证 |
| Mastery 实时更新 | 每次作答后 conceptMastery 刷新 | mastery.test.ts + UI 观察 |
| 刷新页面恢复进度 | ProgressState 从 LocalStorage 恢复 | 手动：做到一半刷新 |
| LocalStorage 容量预警 | 超 4.5MB 提示 | quota.test.ts |
| 类型安全 | tsc --noEmit 0 错 | `bun run typecheck` |
| Lint | 0 错 0 警告 | `bun run lint` |

---

## 7. 风险

| 风险 | 等级 | 缓解 |
|------|------|------|
| Feedback Agent 延迟 > 1.5s（FR-03 AC6） | 高 | 实测 M3 smoke 的 Feedback Agent 单次延迟；若超 1.5s 考虑模型降级或流式返回 |
| Fill Blank 语义匹配不准（误判对/错） | 中 | 双策略：Feedback Agent 判错后 fill-blank.ts 标准化兜底（精确匹配覆盖） |
| LocalStorage 5MB 不够（大 Module + 多次 retry） | 中 | quota.ts 历史淘汰（最多 4 个 Module）；超限提示用户清空 |
| SSE 流在弱网下断开 | 中 | 编译中页加重连逻辑；Module JSON 部分写入 LocalStorage 后断开可恢复 |
| Feynman Step6 评分 Prompt 宽容度不好调 | 中 | M3 未测 feynman-eval 真实 LLM；W7 需 ≥ 5 次手动评估 |
| Zustand persist 在 SSR 下 hydration 不匹配 | 低 | Next.js App Router 用 `'use client'` 标注所有 store 消费页 |
| Challenge（W9）挤占 W1-W8 时间 | 低 | W9 是 Should；若进度紧张直接推迟 M6 |

---

## 8. 与 M6 的衔接

M4-M5 交付给 M6 的输入：

1. **Module Challenge 状态机分支**：`progress-store` 已预留 `challenge` 态，M6 只需填业务逻辑
2. **完成页骨架**：M7 的正式完成页（含复习入口、历史列表）基于 M4-M5 的 done 页扩展
3. **Quiz 组件库**：M6 的 Challenge 题复用 ChoiceQuiz + SortingQuiz
4. **Feedback API**：M6 Challenge 答错重试直接调 `/api/regenerate`
5. **Mastery 计算**：M6 追加 Challenge 题的 AttemptRecord，`computeMastery` 自然纳入

---

## 9. 修订记录

| 版本 | 日期 | 修订 | 作者 |
|------|------|------|------|
| 1.0 | 2026-07-08 | 初稿，合并 M4（学习循环）+ M5（费曼闭环）。W1-W8 Must + W9-W10 Should | wish2333 |