# M6 工作计划（Module Challenge + 完成页 + 技术债）

> **M6 Plan V1.0**
> 状态：Draft | 日期：2026-07-08
> 定位：PRD §14 第六个正式里程碑
> 范围：[FR-05 Module Challenge](./PRD.md#fr-05-module-challenge模块挑战) + 正式完成页 + M4-M5 技术债清理
> 验收：Challenge 阶段嵌入 Concept → Feynman 之间，全流程含 Challenge 可在浏览器走通；M4-M5 保留项清零
>
> 承接：[M4-M5-Review](./M4-M5-Review.md) 交付的完整学习循环 + 费曼闭环

---

## 0. 定位与约束

M6 是内测前（M7）的最后一个功能里程碑。三大目标：

1. **Module Challenge**：在所有 Concept 完成后、Feynman 之前，插入 3-5 道跨概念综合题（FR-05）
2. **正式完成页**：当前 done 页是骨架，M6 扩展为含"被跳过概念复习入口"+"历史 Module 列表"的完整闭环
3. **技术债清理**：M4-M5 Review §3.2 的 5 个保留项 + compiling 页硬刷新等遗留问题

**不在范围内**：
- 多 Module 课程（V2）
- PDF / 网页输入（V3）
- 跨设备同步（V2）
- 自适应难度（V2）

---

## 1. 已就位的基础设施（M4-M5 遗产）

### 1.1 状态机预留

```typescript
// types/domain.ts — ModuleStage 已有 challenge 态
| { kind: 'challenge'; quizIndex: number }

// progress-store.ts advance() — challenge 分支当前跳过到 feynman_intro
case 'challenge': {
  set({ stage: { kind: 'feynman_intro' }, updatedAt: Date.now() })
  break
}
```

M6 只需把 `challenge` 分支从"跳过"改为"正常推进"。

### 1.2 可复用的组件与 API

| 组件 / API | 来源 | 复用方式 |
|------------|------|---------|
| `ChoiceQuiz` | M4-M5 W4 | Challenge 题仅用 Choice / Sorting，直接复用 |
| `SortingQuiz` | M4-M5 W4 | 同上 |
| `QuizRenderer` | M4-M5 W4 | interactionType 分发，Challenge 题只有 choice/sorting |
| `FeedbackPanel` | M4-M5 W4 | 反馈面板完全复用 |
| `/api/feedback` | M4-M5 W5 | Challenge 答题评分直接调 |
| `/api/regenerate` | M4-M5 W5 | Challenge retry 换题直接调 |
| `retry-policy.ts` | M4-M5 W1 | 连续 3 次失败强制 advance，完全复用 |
| `computeMastery()` | M4-M5 W1 | Challenge 题的 AttemptRecord 自然纳入计算 |

### 1.3 编译器 pipeline

Challenge 题目当前由编译器在 `quiz` 阶段生成——但现有 mission schema 只为每个 Concept 生成 QuizSeries，**没有跨 Concept 的 challenge 题生成机制**。M6 需要在 pipeline 中新增一个 challenge-batch Agent 阶段。

---

## 2. 范围

### 2.1 包含（Must）

| # | 工作项 | 来源 | 交付物 |
|---|--------|------|--------|
| W1 | **Challenge Agent + Schema** | FR-05 / Tech Spec §4 | 新增 `challenge-batch` Agent prompt + Zod schema（3-5 道跨概念 choice/sorting 题）+ pipeline 集成 |
| W2 | **Module 类型扩展 + 状态机激活** | Tech Spec §5.1 | `Module` 增加可选 `challengeQuizzes?: Quiz[]` 字段；progress-store `challenge` 分支正常推进 |
| W3 | **ChallengeView 组件** | FR-05 / US-13/14 | `components/learn/ChallengeView.tsx`：复用 QuizRenderer + FeedbackPanel + retry 流程；视觉与 Concept 页区分 |
| W4 | **正式完成页** | US-21/22 / PRD §9.2 | 扩展 `app/learn/done/page.tsx`：被跳过概念复习入口 + Challenge 得分 + 历史 Module 列表 |
| W5 | **技术债清理** | M4-M5 Review §3.2 | 5 个保留项修复 + compiling 页硬刷新优化 |

### 2.2 包含（Should，资源允许时）

| # | 工作项 | 说明 |
|---|--------|------|
| W6 | **断点续编验证** | M4-M5 Review W10 推迟项。持久化层就位后验证刷新恢复 |
| W7 | **Settings 页实现** | M1 占位的 Settings 页替换为完整 LLM 配置 UI（provider 选择 + API key + 模型 + ping 测试） |

### 2.3 不包含

- **Adaptive Learning**（V2）
- **多 Module 课程**（V2）
- **PDF / 网页输入**（V3）

---

## 3. 交付物详情

### W1 Challenge Agent + Schema

**新增文件**：

```
src/lib/compiler/
├── prompts/
│   └── challenge-batch.md          # Challenge Agent prompt
└── schemas/
    └── challenge-batch.ts          # Challenge batch Zod schema
```

**Schema 设计**：

```typescript
// challenge-batch.ts
const challengeQuizItemSchema = quizItemSchema.extend({
  // Challenge 题必须显式涉及 ≥ 2 个 Concept
  involvedConceptIds: z.array(z.string()).min(2),
  // Challenge 题限 choice / sorting（无 fill_blank）
  interactionType: z.enum(['choice', 'sorting']),
})

export const challengeBatchSchema = z.object({
  reasoning: z.string().min(1),
  quizzes: z.array(challengeQuizItemSchema).min(3).max(5),
})
```

**Prompt 要点**：
- 输入：Module 内全部 Concept 的 name + definition + keyPoints
- 输出：3-5 道跨概念综合题
- 约束：
  - 每道题题干显式涉及 ≥ 2 个 Concept（如"Embedding 与检索的关系是？"）
  - 仅 Choice / Sorting（Challenge 阶段不引入 Fill Blank）
  - 干扰项需利用概念间的常见混淆点
  - ladderLevel 固定为 3（Application，综合应用）

**Pipeline 集成**：

在 `pipeline.ts` 的 Stage 6（quiz-batch）之后、Stage 7（feynman）之前插入新阶段：

```
Stage 6: quiz-batch（按 Concept 分组生成练习）
Stage 6.5: challenge-batch（NEW — 生成 3-5 道跨概念题）
Stage 7: feynman
```

`CompileStage` 类型新增 `'challenge'` 值。`STAGE_PERCENT` 调整分配。

### W2 Module 类型扩展 + 状态机激活

**类型扩展**：

```typescript
// types/domain.ts
export interface Module {
  // ...existing fields...
  /** Module Challenge 综合题（3-5 道），编译产物 */
  challengeQuizzes?: Quiz[]
}
```

**状态机修改**：

```typescript
// progress-store.ts advance()

// concept 末题 → challenge（原直接跳 feynman_intro）
case 'concept': {
  // ...existing quizIndex / conceptIndex 推进...
  // 所有 Concept 完成 →
  if (currentModule.challengeQuizzes?.length) {
    set({ stage: { kind: 'challenge', quizIndex: 0 }, updatedAt: Date.now() })
  } else {
    set({ stage: { kind: 'feynman_intro' }, updatedAt: Date.now() })
  }
  break
}

// challenge 正常推进（原跳过）
case 'challenge': {
  const challengeCount = currentModule.challengeQuizzes?.length ?? 0
  if (stage.quizIndex + 1 < challengeCount) {
    set({ stage: { kind: 'challenge', quizIndex: stage.quizIndex + 1 }, updatedAt: Date.now() })
  } else {
    set({ stage: { kind: 'feynman_intro' }, updatedAt: Date.now() })
  }
  break
}
```

**Mastery 计算扩展**：

`computeMastery()` 的 `moduleCompletion` 分母加入 Challenge 题数：

```typescript
const totalChallengeQuizzes = module.challengeQuizzes?.length ?? 0
const totalQuizzes = totalConceptQuizzes + totalChallengeQuizzes + totalFeynmanSteps
```

### W3 ChallengeView 组件

**新增文件**：`components/learn/ChallengeView.tsx`

**设计**：
- 结构与 `ConceptView` 高度相似（QuizRenderer + FeedbackPanel + retry 流程）
- 差异：
  - 数据源是 `module.challengeQuizzes[quizIndex]` 而非 `concept.quizSeries.quizzes[quizIndex]`
  - slotId 格式：`challenge:${quizIndex}`
  - 视觉与 Concept 学习页区分（PRD §9.2："换主色调，强调综合挑战感"）

**module-store 扩展**：
- 新增 `currentChallengeQuiz: Quiz | null`（或复用 `currentQuiz`，通过 progress stage 区分）

**Module 路由器修改**：

```typescript
// app/learn/module/[id]/page.tsx
case 'challenge':
  return <ChallengeView quizIndex={stage.quizIndex} />
```

### W4 正式完成页

**扩展** `app/learn/done/page.tsx`：

| 功能 | 来源 | 实现 |
|------|------|------|
| Mastery 卡片（已有） | M4-M5 | 保留 |
| Challenge 得分摘要 | FR-05 | 新增：Challenge 题的首次答对率 |
| 被跳过 / 待复习概念入口 | US-22 | 新增：展示 `conceptMastery < 50%` 的概念，提供"重新练习"按钮 |
| 历史 Module 列表 | US-22 | 新增：从 `listModuleIds(repo)` 读取历史 Module，展示标题 + 完成时间 |
| 清空进度入口 | FR-08 AC3 | 新增：`storage.clearAll()` + 确认对话框 |

**被跳过概念复习**：

点击"重新练习"时，直接将 progress-store 设为 `concept(conceptIndex, 0)`。已有 AttemptRecord 保留，retry-policy 计数继续。

### W5 技术债清理

M4-M5 Review §3.2 的 5 个保留项 + compiling 页修复：

| # | 文件 | 问题 | 修复方案 |
|---|------|------|---------|
| 6 | `ConceptView.tsx` | attemptVersion 并发竞态 | 改为在 handleAnswer 入口一次性快照 `const version = getNextAttemptVersion(slotId)`，后续全部使用该快照 |
| 7 | `FillBlankQuiz.tsx` | 多 `____` 共享单 input | 添加多 input 支持：按 `____` 数量渲染对应数量 input，userAnswer 用 `\n` 连接 |
| 8 | `FeynmanFinalView.tsx` | MIN_WORDS 命名误导 | 重命名为 `MIN_CHARS` / `MAX_CHARS` |
| 9 | `SortingQuiz.tsx` | 拖拽中 arrow 导致 stale index | 拖拽开始时禁用 arrow 按钮（`draggingRef` 状态守卫） |
| 10 | `compiling/page.tsx` | handleRetry 硬刷新 | 改为 React 状态重置：`resetCompile()` + 重新触发 `streamCompile()`（通过 `useEffect` key 或 `useState` 计数器） |

---

## 4. 关键设计决策

### 4.1 Challenge 题在编译期生成 vs 运行时动态生成

**决策**：编译期生成（pipeline Stage 6.5）。

**理由**：
- 编译期已有全部 Concept 上下文，可生成高质量跨概念题
- 运行时动态生成增加延迟（用户刚完成最后一个 Concept，期待立即进入 Challenge）
- retry 时仍用 `/api/regenerate`（运行时），但首组题目编译期就位

### 4.2 challengeQuizzes 放在 Module 上 vs 独立 Concept

**决策**：Module 可选字段 `challengeQuizzes?: Quiz[]`。

**理由**：
- Challenge 题不属于任何单个 Concept
- 可选字段（`?`）保持向后兼容：M4-M5 已编译的 Module JSON 无此字段时不报错
- 若 `challengeQuizzes` 为空或 undefined，状态机直接跳到 feynman_intro（与当前行为一致）

### 4.3 Challenge retry 是否复用 ConceptView 的 retry 逻辑

**决策**：新建 `ChallengeView`，但最大化复用 ConceptView 的模式（非直接继承）。

**理由**：
- 数据源不同（`module.challengeQuizzes[i]` vs `concept.quizSeries.quizzes[i]`）
- slotId 格式不同（`challenge:N` vs `concept-N:N`）
- 视觉风格不同（PRD 要求"换主色调"）
- 共享逻辑通过提取 hook `useQuizAttempt(slotId, quiz)` 来复用

### 4.4 Settings 页是否纳入 M6

**决策**：Should 项（W7），视 W1-W5 进度。

**理由**：
- M4-M5 的 Settings 页仍是 M1 占位，用户需手动编辑 localStorage 才能配置 LLM
- 但全流程已可用（通过 `/settings` 路由访问占位页 + `scripts/ping.ts` 验证）
- 正式 Settings UI 对内测（M7）重要但不阻塞功能验证

---

## 5. 工作分解与依赖

```
W1 Challenge Agent+Schema ──► W2 类型扩展+状态机 ──► W3 ChallengeView
                                                        │
                                                        ▼
                                            W4 正式完成页
                                                        │
W5 技术债清理 ◄────────────────────────────────────────┘
（W5 与 W1-W4 无依赖，可并行）
```

**建议顺序**：
1. **W5 技术债清理**先行（独立，无依赖，快速清零已知问题）
2. **W1 Challenge Agent + Schema**（需 prompt 设计 + schema 定义）
3. **W2 类型扩展 + 状态机激活**（W1 schema 就位后集成到 pipeline + types）
4. **W3 ChallengeView 组件**（W2 状态机就位后开发 UI）
5. **W4 正式完成页**（W3 就位后扩展）
6. **W6/W7**（视进度）

**工作量预估**（粗估，单人）：

| 工作项 | 预估天数 |
|--------|---------|
| W5 技术债清理 | 1 天 |
| W1 Challenge Agent + Schema | 2-3 天（含 prompt 调优） |
| W2 类型扩展 + 状态机 | 1 天 |
| W3 ChallengeView | 1-2 天 |
| W4 正式完成页 | 1-2 天 |
| W7 Settings 页（Should） | 1-2 天 |
| 测试 + E2E 扩展 | 1-2 天 |
| **合计** | **7-12 天（~1.5-2.5 周）** |

---

## 6. 验收标准

| 验收项 | 目标 | 验证 |
|--------|------|------|
| Challenge 题在 Concept 后 Feynman 前出现 | 全流程含 Challenge 阶段 | 手动走通 + E2E |
| 每道 Challenge 题涉及 ≥ 2 个 Concept | 题干跨概念 | W1 schema 校验 + 抽检 |
| Challenge 题数 ∈ [3, 5] | 不多不少 | W1 schema 校验 |
| Challenge 仅 Choice / Sorting | 无 Fill Blank | W1 schema 校验 |
| Challenge retry 与普通 Quiz 一致 | 答错换题 + 3 次强制 advance | 手动 + E2E |
| Challenge 得分纳入 Mastery | moduleCompletion 包含 Challenge 题数 | mastery 单测扩展 |
| 完成页显示 Challenge 得分 | 新增 Challenge 摘要 | 手动 |
| 完成页显示待复习概念 | conceptMastery < 50% 的概念有"重新练习"入口 | 手动 |
| 完成页显示历史 Module | 列出已存储的 Module | 手动 |
| M4-M5 保留项全部清零 | §3.2 的 5 项全部修复 | code review |
| 类型安全 | tsc --noEmit 0 错 | `bun run typecheck` |
| Lint | 0 错 0 警告 | `bun run lint` |
| E2E 含 Challenge | 全流程 smoke 含 Challenge 阶段 | Playwright |

---

## 7. 风险

| 风险 | 等级 | 缓解 |
|------|------|------|
| Challenge Agent 跨概念题质量不高（题干实际只涉及 1 个 Concept） | 高 | W1 Schema 用 `involvedConceptIds: min(2)` 校验；Prompt 中给出正反例；W1 需 ≥ 5 次手动评估 |
| Challenge 阶段增加编译耗时（Stage 6.5 额外 LLM 调用） | 中 | Challenge Agent 单次调用（非 batch）；P95 预估增加 10-15s；若超预期考虑用 lightweight 模型 |
| ChallengeView 与 ConceptView 代码重复 | 中 | 提取 `useQuizAttempt` hook 共享作答/反馈/retry 逻辑 |
| Module 类型扩展破坏 M4-M5 已编译数据 | 低 | `challengeQuizzes` 为可选字段；undefined 时状态机跳过 Challenge |
| Settings 页 UI 工作量超预期 | 低 | W7 是 Should；若紧张推迟到 M7 |

---

## 8. 与 M7 的衔接

M6 交付给 M7 内测的输入：

1. **完整学习流程**：导入 → 编译 → Concept → Challenge → Feynman → 完成（含所有 FR-05 验收标准）
2. **正式完成页**：内测用户看到的最后一个页面，直接影响"Module 完成率"北极星指标
3. **技术债清零**：M4-M5 Review 的所有保留项已修复，内测不会有已知 bug
4. **Settings 页**（若 W7 完成）：内测用户可自行配置 LLM，不需手动编辑 localStorage

---

## 9. 修订记录

| 版本 | 日期 | 修订 | 作者 |
|------|------|------|------|
| 1.0 | 2026-07-08 | 初稿。W1-W5 Must + W6-W7 Should。承接 M4-M5 Review §3.2 + §6 | Sisyphus |
