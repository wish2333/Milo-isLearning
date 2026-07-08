# M7 Review — 内测计划 + 编译稳定性 + 本地判分

> **M7 Review V1.0**
> 状态：Done | 日期：2026-07-08
> 对应计划：[`M7-Plan.md`](./M7-Plan.md) V1.0
> 上下文：M6 已交付完整学习闭环（Challenge + 完成页 + Settings + 开发者指南），本阶段补齐 M7 内测计划，并修复进入内测前暴露出的编译稳定性、运行时判分和质量门禁问题

---

## 0. 结论

M7 本次提交完成了 4 类交付：M7 内测计划文档、编译流水线稳定性修复、运行时确定性判分、本地质量门禁清零。它不是完整内测结项，而是 M7 启动前的工程收口：让编译请求能稳定发起，让 LLM 输出更少被过紧 schema 拒绝，让选择题/排序题/填空题不再为确定性判分调用 LLM。

**核心成果**：
1. 新增 M7 内测计划：部署、埋点、评分组件、E2E 扩展、编译质量验证、断点续编、20 人内测执行路径
2. 修复 `/learn/compiling` dev 模式下 React Strict Mode 双挂载导致唯一编译请求被 abort 的问题
3. 等待 settings-store persist 水合完成后再读取 LLM 配置，避免刷新编译页时误跳 Settings
4. 放宽 Concept / Module / Mission / Quiz / Challenge / Feynman schema 中过紧的硬校验，降低 LLM 合理输出被拒绝的概率
5. 在 mapper 层自动修复 choice 题 `options[0] !== answer`，把答案选项移动到第 1 位，前端仍会打乱展示
6. 新增 `evaluateAnswer()` 本地评估模块，Concept / Challenge 作答不再调用 `/api/feedback` 判分
7. `feedback.md` 降级为 legacy feedback 文案说明，不再定义为运行时裁判入口
8. 编译 API、Agent runner、pipeline 日志统一为 lint 允许的 `console.info/warn/error`
9. `bun run lint`、`bun run typecheck`、`bun run test` 全部通过，153 个 vitest 单测全过

---

## 1. 交付物清单

### 1.1 M7 文档

| 文档 | 状态 | 说明 |
|------|------|------|
| `docs/M7-Plan.md` | Done | M7 内测 + 优化 + 部署计划，覆盖 W1-W7 Must 与 W8-W10 Should |
| `docs/M7-Dev.md` | Done | 记录 Provider API Key 自动填充、配置缓存、W9 编译稳定性修复过程 |
| `docs/M7-Review.md` | Done | 本文档，汇总自上次提交至今的所有代码与文档改动 |

### 1.2 编译稳定性修复

| 项 | 状态 | 关键文件 |
|----|------|---------|
| Strict Mode 双挂载修复 | Done | `app/learn/compiling/page.tsx`：主 effect 不再在 cleanup 中 abort，改由独立 unmount cleanup 处理 |
| settings-store 水合门控 | Done | `app/learn/compiling/page.tsx`：使用 `useSettingsStore.persist.hasHydrated()` / `onFinishHydration()` 等待配置就绪 |
| SSE 端点日志增强 | Done | `app/api/compile/route.ts`：输出请求到达、请求体解析、SSE enqueue、结束耗时、异常与关闭日志 |
| Agent 重试日志增强 | Done | `compiler/agents/_runner.ts`：每次 empty content / invalid JSON / schema violation 都立即输出原因 |
| pipeline stage 日志增强 | Done | `compiler/pipeline/pipeline.ts`：输出 stage_enter、attempt、耗时、重试与失败原因 |

### 1.3 Schema 与 mapper 放宽

| 文件 | 修改 |
|------|------|
| `schemas/concept.ts` | `name` 20→50，`definition` 30→75，`keyPoint` 15→40 |
| `schemas/module.ts` | `title` 20→50，`intro` 40→100，`goal` 30→75 |
| `schemas/mission.ts` | 删除 expressionLevel 单调非递减硬校验，保留 prompt 侧建议 |
| `schemas/quiz.ts` | distractors min 3→1；移除 `options[0] === answer` 和 usedCount ≥ 3 硬校验 |
| `schemas/challenge-batch.ts` | 同步放宽 distractors 与 options[0] 校验，保留 Challenge 跨概念约束 |
| `schemas/feynman.ts` | Step 6 作为占位允许省略 options/explanation；explanation max 200→500；rubric 条目 max 20→80 |
| `agents/mappers.ts` | `assembleQuiz` / `assembleChallengeQuiz` 自动把 answer 对应选项移动到 options[0]；`assembleFeynmanTask` 对缺省 explanation 兜底为空字符串 |

### 1.4 运行时本地判分

| 项 | 状态 | 关键文件 |
|----|------|---------|
| 本地评估模块 | Done | `lib/runtime/evaluate-answer.ts` |
| 聚焦单测 | Done | `lib/runtime/__tests__/evaluate-answer.test.ts` |
| ConceptView 去 LLM 判分 | Done | `components/learn/ConceptView.tsx`：提交后直接 `evaluateAnswer(quiz, userAnswer)` |
| ChallengeView 去 LLM 判分 | Done | `components/learn/ChallengeView.tsx`：提交后直接 `evaluateAnswer(quiz, userAnswer)` |
| Feedback prompt 降级 | Done | `compiler/prompts/feedback.md`：标记 legacy compatibility only，不再承担运行时判分职责 |

### 1.5 Env Config Loader 修正

| 文件 | 修改 |
|------|------|
| `components/EnvConfigLoader.tsx` | 始终请求 `/api/env-config` 并保存所有 provider 的 apiKeys；默认 config 仅在用户尚未手动配置时自动填充 |

---

## 2. 文件统计

| 类别 | 修改 | 新增 | 说明 |
|------|------|------|------|
| docs/ | 0 | 3 | M7-Plan、M7-Dev、M7-Review |
| app/api/ | 1 | 0 | compile SSE 端点日志增强 + any 清理 |
| app/learn/ | 1 | 0 | compiling 页 Strict Mode + hydration 修复 |
| components/ | 1 | 0 | EnvConfigLoader 始终加载 apiKeys |
| components/learn/ | 2 | 0 | Concept / Challenge 本地判分 |
| lib/runtime/ | 0 | 2 | evaluate-answer 纯函数 + 单测 |
| compiler/agents/ | 2 | 0 | runner 日志增强；mapper 自动修复 choice options |
| compiler/pipeline/ | 1 | 0 | stage 日志增强 |
| compiler/prompts/ | 2 | 0 | feedback 降级；feynman Step 6 占位说明 |
| compiler/schemas/ | 6 | 0 | schema 放宽与 Step 6 兼容 |
| **合计** | **16 修改** | **5 新增** | |

---

## 3. 问题修复与根因

### 3.1 `/learn/compiling` 无请求发出

**现象**：页面显示“准备中…”，Network 面板看不到 `POST /api/compile`。

**根因**：Next.js dev 模式下 React Strict Mode 会 mount → unmount → remount。第一次 mount 启动 fetch 后，cleanup 立即 abort；第二次 mount 因 `startedRef.current === true` 直接跳过，导致唯一请求被取消。

**修复**：主 effect 的 cleanup 不再 abort；用 `controllerRef` 保存当前 controller，并在独立 unmount cleanup 中 abort。

### 3.2 刷新编译页误跳 Settings

**现象**：刷新 `/learn/compiling` 时 settings-store 还没完成 persist hydration，`config` 初始为 null，页面误判为未配置。

**修复**：添加 `storeReady`，等待 `useSettingsStore.persist.hasHydrated()` 或 `onFinishHydration()` 后再执行编译 effect。

### 3.3 Schema 过紧导致 LLM 重复重试

**现象**：mission / quiz-batch / feynman stage 因合理但不完全贴合 prompt 的输出反复触发 Zod 重试。

**根因**：Zod 把教学建议当成硬约束，如 expressionLevel 单调、distractors ≥ 3 且 used ≥ 3、Step 6 必须有完整 options/explanation。

**修复原则**：prompt 保留建议，Zod 只保留运行时必须约束；能自动修复的结构问题放到 mapper 层修复。

### 3.4 选择题判分不应调用 LLM

**现象**：编译产物已经包含 `quiz.answer`、`explanation`、options/distractors，Concept / Challenge 运行时仍调用 `/api/feedback` 判定选择题与排序题正确性。

**根因**：Feedback Agent 同时承担“评分”和“反馈文案”两种职责，导致确定性比较被错误外包给 LLM。

**修复**：新增 `evaluateAnswer()` 本地评估。Choice / Sorting 使用 `userAnswer === quiz.answer`，Fill Blank 使用已有 `isFillBlankCorrect()` 标准化匹配。Concept / Challenge 不再调用 `/api/feedback` 判分。

### 3.5 Lint 质量门禁

**问题**：`compile/route.ts` 存在 `any` 和多处 `console.log` warning；runner/pipeline 也有 `console.log` warning。

**修复**：利用 `CompileEvent` discriminated union 读取 `event.stage`，移除 `any`；将信息日志统一为 lint 允许的 `console.info`。

---

## 4. 验证结果

| 检查项 | 结果 |
|--------|------|
| ESLint (`bun run lint`) | 0 错误，0 警告 |
| TypeScript (`bun run typecheck`) | 0 错误 |
| Vitest (`bun run test`) | 153 passed (11 files) |
| Runtime 聚焦测试 | `evaluate-answer.test.ts` 4 passed |
| Runtime 相邻测试 | `lib/runtime/__tests__` 47 passed |

### 新增测试覆盖

| 测试 | 覆盖 |
|------|------|
| `evaluate-answer.test.ts` | choice 正确/错误、sorting 严格顺序、fill_blank 标准化匹配 |

---

## 5. 关键设计决策回顾

### 5.1 本地判分 vs Feedback Agent 判分

**决策**：Choice / Sorting / Fill Blank 运行时判分全部本地化。

**理由**：编译期已经产出标准答案。运行时 LLM 判分会引入延迟、成本、网络失败和不确定性。LLM 如仍使用，只应做非阻塞反馈文案或编译后质量审查。

### 5.2 删除硬校验 vs 自动修复

**决策**：`options[0] !== answer` 不再让 Zod 拒绝，而是在 mapper 层自动修复。

**理由**：前端会打乱 options，运行时判分依赖 `answer` 字符串，不依赖 LLM 输出时的 options 顺序。只要 answer 存在于 options 中，移动到 index 0 是无损修复。

### 5.3 Step 6 继续保留在 Feynman steps 数组

**决策**：steps 仍要求 6 项，但 Step 6 作为元数据占位，只严格要求 `order=6`。

**理由**：domain 层和前端约定 FeynmanTask 有 6 个步骤；开放输出实际由 `finalPrompt` 渲染，不应该因 Step 6 的 unused fields 阻断整个 Feynman Agent 输出。

### 5.4 Compile 日志保留

**决策**：保留编译 pipeline 的信息日志，但使用 `console.info`。

**理由**：M7 内测前仍需要快速定位真实 LLM 编译卡点。完全删除日志会降低可观测性；改成 lint 允许级别后质量门禁保持干净。

---

## 6. 与后续 M7 内测的衔接

本次提交让 M7 内测前置条件更稳：

1. 编译页 dev 模式可正常发出请求，不再被 Strict Mode 掐断
2. 编译 schema 更贴近真实 LLM 输出，减少无意义重试
3. 运行时答题判分不再依赖 LLM，降低内测成本和失败面
4. lint/typecheck/test 全绿，适合进入部署与 E2E 扩展

### 仍待 M7 后续完成

| 项 | 状态 |
|----|------|
| Vercel 部署与公网验证 | 待做 |
| 埋点系统接入 | 待做 |
| 完成页评分组件 | 待做 |
| Playwright E2E 扩展到 Challenge | 待做 |
| ≥5 次真实 LLM 编译质量验证 | 待做 |
| 断点续编手动验证 | 待做 |
| 20 人内测与反馈收集 | 待做 |

---

## 7. 修订记录

| 版本 | 日期 | 修订 | 作者 |
|------|------|------|------|
| 1.0 | 2026-07-08 | 初稿。记录 M7 计划文档、W9 编译稳定性、本地判分、schema 放宽和质量门禁清理 | Sisyphus |
