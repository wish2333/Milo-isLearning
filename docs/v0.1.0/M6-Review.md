# M6 Review — Module Challenge + 完成页 + 技术债

> **M6 Review V1.0**
> 状态：Done | 日期：2026-07-08
> 对应计划：[`M6-Plan.md`](./M6-Plan.md) V1.0
> 上下文：M4-M5（学习循环 + 费曼闭环）已完成，本里程碑交付 Module Challenge 功能 + 正式完成页 + 技术债清零 + 开发者入口

---

## 0. 结论

M6 全部 5 项 Must 工作项（W1-W5）+ 2 项 Should（W7 Settings + .env.local 自动加载）已完成。从粘贴 Markdown 到看到掌握度报告，全流程含 Challenge 阶段可在浏览器走通。M4-M5 Review §3.2 的 5 个保留项全部清零。

**核心成果**：
1. Module Challenge：编译期生成 3-5 道跨概念综合题（choice/sorting），嵌入 Concept → Feynman 之间，状态机正常推进
2. 正式完成页：Challenge 得分摘要 + 待复习概念入口（conceptMastery < 50%）+ 历史 Module 列表 + 清空进度确认对话框
3. 技术债清零：M4-M5 Review §3.2 的 5 个保留项（attemptVersion 竞态 / 多空填空 / 命名误导 / 拖拽 stale index / 硬刷新）全部修复
4. Settings 页：从 M1 占位替换为完整 LLM 配置 UI（provider 选择 + API Key + ping 测试 + 保存）
5. .env.local 自动加载：`bun run dev` 启动后自动读取环境变量填充 Settings，开发者无需手动重复输入
6. 开发者指南：`docs/dev-guide.md` 覆盖环境搭建、命令一览、架构图解、调试指南、常见问题排查
7. 149 个 vitest 单测全过，tsc 0 错，eslint 0 错 0 警告

---

## 1. 交付物清单

### 1.1 Must 项

| 项 | 状态 | 关键文件 |
|----|------|---------|
| W1 Challenge Agent+Schema | Done | `schemas/challenge-batch.ts`（Zod schema，3-5 道跨概念 choice/sorting 题，每道涉及 ≥ 2 Concept）；`prompts/challenge-batch.md`（Agent prompt）；`schemas/index.ts` + `agents/config.ts`（注册 challenge-batch AgentKind）；`pipeline/types.ts`（CompileStage 添加 'challenge' + STAGE_PERCENT 96%）；`pipeline/pipeline.ts`（Stage 6.5 集成）；`mappers.ts`（assembleChallengeQuiz）；`schemas/quiz.ts`（导出 distractorItemSchema） |
| W2 类型扩展+状态机 | Done | `types/domain.ts`（Module.challengeQuizzes? + Mastery.challengeMastery?）；`progress-store.ts`（advance() concept 末题 → challenge → feynman 正常推进）；`mastery.ts`（moduleCompletion 分母加入 Challenge 题数 + challengeMastery 首次答对率计算） |
| W3 ChallengeView | Done | `components/learn/ChallengeView.tsx`（复用 QuizRenderer + FeedbackPanel + retry-policy，amber 主色调区分 Concept 页）；`app/learn/module/[id]/page.tsx`（challenge case 渲染 ChallengeView） |
| W4 正式完成页 | Done | `app/learn/done/page.tsx`（Challenge 得分摘要 + 待复习概念入口 + 历史 Module 列表 + 清空进度确认对话框） |
| W5 技术债清理 | Done | M4-M5 Review §3.2 的 5 个保留项全部修复，详见 §3 |

### 1.2 Should 项

| 项 | 状态 | 说明 |
|----|------|------|
| W6 断点续编验证 | 未验证 | 持久化层就位，未做手动刷新恢复测试。推迟到 M7 内测阶段 |
| W7 Settings 页 | Done | 从 M1 占位替换为完整 LLM 配置 UI，含 .env.local 自动加载 |

### 1.3 新增 API 端点

| 端点 | 方法 | 用途 |
|------|------|------|
| `/api/ping` | POST | LLM 连接健康检查（服务端调用 provider.ping()，避免 CORS） |
| `/api/env-config` | GET | 从 .env.local 读取 LLM 配置返回给前端自动加载 |

### 1.4 新增文档

| 文档 | 说明 |
|------|------|
| `docs/M6-Plan.md` | M6 里程碑计划 |
| `docs/M6-Review.md` | 本文档 |
| `docs/dev-guide.md` | 开发者指南（环境搭建、命令、架构、调试、FAQ） |

---

## 2. 文件统计

| 类别 | 修改 | 新增 | 说明 |
|------|------|------|------|
| schemas/ | 3 | 1 | challenge-batch.ts 新建；quiz.ts 导出 distractorItemSchema；index.ts 注册 |
| prompts/ | 0 | 1 | challenge-batch.md 新建 |
| pipeline/ | 2 | 0 | types.ts CompileStage + STAGE_PERCENT；pipeline.ts Stage 6.5 集成 |
| agents/ | 2 | 0 | config.ts 添加 challenge-batch；mappers.ts 添加 assembleChallengeQuiz |
| types/ | 1 | 0 | domain.ts Module.challengeQuizzes + Mastery.challengeMastery |
| state/ | 3 | 0 | progress-store 激活 challenge 分支；settings-store availableKeys（另一会话）；mastery 扩展 |
| components/learn/ | 3 | 1 | ChallengeView 新建；ConceptView/FeynmanFinalView 技术债修复 |
| components/quiz/ | 2 | 0 | FillBlankQuiz 多 input；SortingQuiz draggingRef |
| components/ | 0 | 1 | EnvConfigLoader 新建 |
| app/learn/ | 3 | 0 | done 页扩展；compiling 页去硬刷新；module 路由器更新 |
| app/settings/ | 1 | 0 | 从 M1 占位替换为完整 Settings UI |
| app/api/ | 0 | 2 | ping + env-config 端点新建 |
| app/ | 1 | 0 | layout.tsx 挂载 EnvConfigLoader |
| scripts/ | 1 | 0 | prompt-eval.ts 添加 challenge-batch case |
| tests/ | 3 | 0 | pipeline.test + smoke.test + builder.test 适配 |
| docs/ | 0 | 3 | M6-Plan + M6-Review + dev-guide |
| **合计** | **24 修改** | **9 新增** | |

---

## 3. 技术债清理（M4-M5 Review §3.2 保留项）

### 3.1 全部清零

| # | 严重度 | 文件 | 问题 | 修复方案 |
|---|--------|------|------|---------|
| 6 | MEDIUM | `ConceptView.tsx` | attemptVersion 在 API 调用前后两次读取 `getNextAttemptVersion`，理论上存在并发竞态 | 在 `handleAnswer` 入口一次性快照 `const attemptVersion = getNextAttemptVersion(slotId)` + `const consecutiveFailures = getConsecutiveFailures(...)`，后续全部使用快照值 |
| 7 | MEDIUM | `FillBlankQuiz.tsx` | 多 `____` 标记共享单个 input | 改用数组 state `values: string[]`，每个 `____` 渲染独立 input，userAnswer 用 `\n` 连接。添加 useEffect 在 blankCount 变化时重置 |
| 8 | LOW | `FeynmanFinalView.tsx` | `MIN_WORDS`/`MAX_WORDS` 实际比较的是字符数 | 重命名为 `MIN_CHARS`/`MAX_CHARS`，所有引用同步更新 |
| 9 | LOW | `SortingQuiz.tsx` | 拖拽中用箭头按钮可导致 sourceIndex 过时 | 添加 `draggingRef = useRef(false)`，`handleDragStart` 设 true，`handleDrop`/`onDragEnd` 设 false，`moveItem` 入口检查 `draggingRef.current` 守卫 |
| 10 | LOW | `compiling/page.tsx` | handleRetry 用 `window.location.reload()` 硬刷新 | 添加 `retryCount` state 计数器作为 useEffect 依赖，重试时 `setRetryCount(c => c + 1)` 触发重新编译，替代 `window.location.reload()` |

### 3.2 另一会话修复

| 文件 | 修改 | 说明 |
|------|------|------|
| `settings-store.ts` | 添加 `availableKeys: ApiKeyMap` 字段 + `setAvailableKeys()` 方法 | 为 .env.local 多供应商 API Key 自动填充做准备 |

### 3.3 安全审查

| 项 | 状态 | 说明 |
|----|------|------|
| API Key 传输 | 可接受 | BYOK 架构不变。新增 `/api/env-config` 在服务端读取 `process.env` 返回配置，仅在开发环境使用；`/api/ping` 在服务端创建 Provider 调用，不暴露 Key 到客户端网络 |
| 输入校验 | 通过 | `/api/ping` 和 `/api/env-config` 均有必填字段校验 |
| XSS | 通过 | 无 `dangerouslySetInnerHTML`；Settings 页 API Key 用密码 input + 脱敏显示 |
| LocalStorage 容量 | 通过 | 无变化，quota 策略不变 |

---

## 4. 验证结果

| 检查项 | 结果 |
|--------|------|
| TypeScript (`tsc --noEmit`) | 0 错误 |
| ESLint | 0 错误, 0 警告 |
| Vitest 单测 | 149 passed (10 files) |

### 新增测试适配

| 测试文件 | 修改内容 |
|---------|---------|
| `smoke.test.ts` | agent kinds 期望 10 → 11，添加 'challenge-batch' |
| `pipeline.test.ts` | AgentKind 添加 'challenge-batch'；CANNED 添加 challenge-batch 占位；setupDefaultMock 添加 challenge-batch mock（3 道 choice/sorting 题）；C1 stage_enter 期望 7 → 8，顺序加入 'challenge' |
| `builder.test.ts` | ALL_KINDS 添加 'challenge-batch'；SAMPLE_INPUTS 添加 challenge-batch 示例输入 |
| `prompt-eval.ts` | switch 添加 challenge-batch case（返回 CANNED_MODULE 概念摘要） |

---

## 5. 关键设计决策回顾

### 5.1 Challenge 题在编译期生成 vs 运行时动态生成

**决策**：编译期生成（pipeline Stage 6.5）。

**理由**：编译期已有全部 Concept 上下文，可生成高质量跨概念题。运行时动态生成增加延迟（用户刚完成最后一个 Concept，期待立即进入 Challenge）。retry 时仍用 `/api/regenerate`（运行时），但首组题目编译期就位。

### 5.2 challengeQuizzes 放在 Module 上 vs 独立 Concept

**决策**：Module 可选字段 `challengeQuizzes?: Quiz[]`。

**理由**：Challenge 题不属于任何单个 Concept。可选字段（`?`）保持向后兼容：M4-M5 已编译的 Module JSON 无此字段时不报错，状态机直接跳到 feynman_intro。

### 5.3 Challenge schema 独立 vs 继承 quizItemSchema

**决策**：新建独立 `challengeQuizItemSchema`，复用 `distractorItemSchema`。

**理由**：quizItemSchema 的 id 正则 `/^concept-\d+:slot-\d+$/` 和 conceptId 正则 `/^concept-\d+$/` 不适用于 Challenge 题（id 格式 `challenge-N`，conceptId 固定 `'challenge'`）。独立 schema 可精确校验 Challenge 特有约束（involvedConceptIds ≥ 2、仅 choice/sorting、ladderLevel 固定 3）。

### 5.4 Challenge retry 策略

**决策**：复用 `/api/regenerate`，合成上下文 Concept 传入。

**理由**：`/api/regenerate` 调用 quiz Agent 生成单题。Challenge 题不绑定单个 Concept，因此合成一个包含全部 Concept name/definition/keyPoints 的虚拟 Concept 作为上下文。返回的 quiz 在客户端重写 id/conceptId 保持 slot 一致性。虽非完美（quiz Agent prompt 面向单概念），但可工作且避免新建 API。

### 5.5 .env.local 自动加载机制

**决策**：`EnvConfigLoader` 组件 + `/api/env-config` 端点。

**理由**：Next.js 自动加载 `.env.local` 到 `process.env`（服务端），但客户端 Zustand store 无法直接读取。通过 API 端点在服务端读取环境变量返回给前端，前端在 hydration 后检查 LocalStorage——如果已有配置则不覆盖（手动配置优先），否则自动填充。

---

## 6. 与 M7 的衔接

M6 交付给 M7 内测的输入：

1. **完整学习流程**：导入 → 编译 → Concept → Challenge → Feynman → 完成（含所有 FR-05 验收标准）
2. **正式完成页**：内测用户看到的最后一个页面，含 Challenge 得分 + 待复习概念入口 + 历史 Module + 清空进度
3. **技术债清零**：M4-M5 Review 的所有保留项已修复，内测不会有已知 bug
4. **Settings 页**：内测用户可在 UI 中配置 LLM，也可通过 `.env.local` 自动加载
5. **开发者指南**：`docs/dev-guide.md` 覆盖从零到走通全流程的完整步骤

### M7 待办

- 内测用户反馈收集 + bug 修复
- Playwright E2E 扩展（含 Challenge 阶段）
- W6 断点续编验证（手动刷新恢复测试）
- Challenge Agent 跨概念题质量评估（≥ 5 次手动评估）
- 生产部署（Vercel + 环境变量配置）

---

## 7. 修订记录

| 版本 | 日期 | 修订 | 作者 |
|------|------|------|------|
| 1.0 | 2026-07-08 | 初稿。W1-W5 Must + W7 Should 全部完成，含技术债清零 + Settings 页 + .env.local 自动加载 + 开发者指南 | Sisyphus |
