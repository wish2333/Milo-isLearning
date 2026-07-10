# M4-M5 Review — 学习循环 + 费曼闭环

> **M4-M5 Review V1.0**
> 状态：Done | 日期：2026-07-08
> 对应计划：[`M4-M5-Plan.md`](./M4-M5-Plan.md) V1.0
> 上下文：M3（Knowledge Compiler 闭环）已完成，本里程碑交付前端学习体验全链路

---

## 0. 结论

M4-M5 全部 8 项 Must 工作项（W1-W8）已完成。从粘贴 Markdown 到看到掌握度报告，全流程可在浏览器走通。

**核心成果**：
1. 状态机驱动的学习流程：`module_intro → concept → feynman_intro → feynman_step → feynman_final → done` 全态覆盖
2. 三种 Quiz 交互组件（Choice / Sorting / FillBlank）+ Feedback Agent 评分 + retry/force-advance 策略
3. Feynman 6 步序列（4 Choice + 1 FillBlank + 1 开放输出 Rubric 评分）
4. LocalStorage 持久化层（5 Zustand stores + repository + quota eviction）
5. 3 个 API 路由（feedback / regenerate / feynman-eval）
6. 149 个 vitest 单测全过，Playwright E2E happy path 通过，tsc 0 错，eslint 0 错 0 警告

**代码审查修复**：审查发现 5 个可操作问题（1 HIGH + 4 MEDIUM），已全部修复。详见 §3。

---

## 1. 交付物清单

### 1.1 Must 项

| 项 | 状态 | 关键文件 |
|----|------|---------|
| W1 状态机+持久化 | Done | `lib/runtime/`（fill-blank + retry-policy + mastery 纯函数，43 单测）；`lib/persistence/`（repository + local-storage + quota，14 单测）；`lib/state/`（5 Zustand stores + useHydrated hook） |
| W2 导入+编译中 | Done | `app/learn/import/page.tsx`（Markdown 输入 + 字数校验）；`app/learn/compiling/page.tsx`（SSE 流式进度 + CRLF 兼容 + Module 持久化） |
| W3 概览+导言 | Done | `app/learn/overview/page.tsx`（Concept 清单 + 预计时长）；`app/learn/module/[id]/page.tsx`（7 态状态机路由器） |
| W4 Quiz+Concept | Done | `components/quiz/`（ChoiceQuiz + SortingQuiz + FillBlankQuiz + QuizRenderer + FeedbackPanel）；`components/learn/ConceptView.tsx`（作答→反馈→retry/advance 完整流程） |
| W5 Feedback+Regenerate | Done | `app/api/feedback/route.ts`（Feedback Agent 评分）；`app/api/regenerate/route.ts`（单题 quiz Agent 重新生成） |
| W6 Feynman 序列 | Done | `components/learn/FeynmanIntroView.tsx`；`FeynmanStepView.tsx`（Step 1-5，fill_blank 标准化匹配）；`FeynmanFinalView.tsx`（Step 6 开放输出 + Rubric 评分 + 范文） |
| W7 Feynman-Eval+Done | Done | `app/api/feynman-eval/route.ts`；`app/learn/done/page.tsx`（Mastery 报告 + 概念掌握度条） |
| W8 集成测试+E2E | Done | 57 个 M4-M5 新增单测（fill-blank 19 + retry-policy 16 + mastery 8 + quota 14）；`e2e/smoke.spec.ts`（全流程 Playwright E2E） |

### 1.2 Should 项

| 项 | 状态 | 说明 |
|----|------|------|
| W9 Module Challenge | 推迟到 M6 | 状态机已预留 `challenge` 态分支，插入成本低 |
| W10 断点续编 | 部分就绪 | 持久化层 + useHydrated 已支持刷新恢复，需手动验证 |

### 1.3 新增依赖

| 包 | 版本 | 用途 |
|----|------|------|
| `@playwright/test` | ^1.61.1 | E2E 测试框架 |

---

## 2. 文件统计

| 类别 | 文件数 | 说明 |
|------|--------|------|
| lib/runtime/ | 3 + 3 tests | 纯函数（fill-blank / retry-policy / mastery） |
| lib/persistence/ | 3 + 1 test | 持久化层（repository / local-storage / quota） |
| lib/state/ | 6 | Zustand stores + index + useHydrated hook |
| components/quiz/ | 5 | Quiz 组件库 |
| components/learn/ | 5 | 学习视图组件 |
| app/learn/ | 5 | 页面（import / compiling / overview / module / done） |
| app/api/ | 3 | API 路由（feedback / regenerate / feynman-eval） |
| e2e/ | 2 | E2E fixture + smoke test |
| **合计新增** | **37 文件** | |

---

## 3. 代码审查发现与修复

### 3.1 已修复（Review 期间）

| # | 严重度 | 文件 | 问题 | 修复 |
|---|--------|------|------|------|
| 1 | HIGH | `api/regenerate/route.ts` | quiz-batch fallback 必然失败：schema 要求 min 6 题，传入单 placeholder 无法通过验证 | 移除 fallback，仅用单题 quiz Agent（5 次重试已足够） |
| 2 | HIGH | `FeynmanStepView.tsx:45` | fill_blank 步骤用裸 `trim()` 比较，大小写/全角差异误判为错 | 改用 `isFillBlankCorrect()` 标准化匹配（全角→半角 + 小写 + 空白折叠） |
| 3 | MEDIUM | `ChoiceQuiz.tsx:41` | `useMemo` 缺少 `quiz.options` 依赖，retry 后显示旧选项 | 补充 `quiz.options` 到依赖数组 |
| 4 | MEDIUM | `compiling/page.tsx:108` | SSE 解析仅处理 `\n\n` 分隔，CRLF 环境下事件丢失 | 添加 `\r\n` → `\n` 规范化 |
| 5 | MEDIUM | `ConceptView.tsx:88` | 提交无防抖，双击可创建重复 AttemptRecord | 添加 `phase !== 'answering'` 提前返回守卫 |

### 3.2 已知保留项（不阻塞，推迟处理）

| # | 严重度 | 文件 | 问题 | 计划 |
|---|--------|------|------|------|
| 6 | MEDIUM | `ConceptView.tsx` | attemptVersion 在 API 调用前后两次读取 `getNextAttemptVersion`，理论上存在并发竞态 | 当前单线程 UI 下不会触发；若引入并发可改为快照式读取 |
| 7 | MEDIUM | `FillBlankQuiz.tsx` | 多 `____` 标记共享单个 input | 后端当前只生成单空格题；V2 支持多空格时重构 |
| 8 | LOW | `FeynmanFinalView.tsx:23` | `MIN_WORDS`/`MAX_WORDS` 实际比较的是字符数 | 中文场景下 `字` = 字符，行为正确；命名待 V2 英文支持时修正 |
| 9 | LOW | `SortingQuiz.tsx:59` | 拖拽中用箭头按钮可导致 sourceIndex 过时 | 极端边缘 case；arrow 按钮禁用拖拽可修复 |
| 10 | LOW | `compiling/page.tsx:164` | handleRetry 用 `window.location.reload()` 硬刷新 | 功能正确但不够优雅；M6 可改为 React 状态重置 |

### 3.3 安全审查

| 项 | 状态 | 说明 |
|----|------|------|
| API Key 传输 | 可接受 | BYOK 架构：用户 API Key 从 LocalStorage → HTTPS POST body → 服务端透传给 LLM → 不落盘。服务端无日志记录 request body 的中间件 |
| 输入校验 | 通过 | 3 个 API 路由均验证必填字段存在性 + 类型检查；runAgent 内部有 Zod schema 校验 |
| XSS | 通过 | 无 `dangerouslySetInnerHTML`；用户输入仅作为 text 渲染 |
| LocalStorage 容量 | 通过 | quota.ts 实现 4.5MB 预警 + max 3 历史 Module 淘汰策略 |

---

## 4. 验证结果

| 检查项 | 结果 |
|--------|------|
| TypeScript (`tsc --noEmit`) | 0 错误 |
| ESLint | 0 错误, 0 警告 |
| Vitest 单测 | 149 passed (10 files) |
| Next.js Build | Compiled successfully |
| Playwright E2E | 1 passed (全流程 smoke) |

### E2E 覆盖路径

```
概览 → Module 导言 → Concept Quiz 1（答对 advance）
→ Concept Quiz 2（答错 → retry → 换题 → 答对 advance）
→ Feynman 导言 → Step 1-4（Choice） → Step 5（FillBlank）
→ Step 6（开放输出 → Rubric 评分 → 范文展示）
→ 完成页（Mastery 报告）
```

---

## 5. 关键设计决策回顾

### 5.1 状态机手写 vs XState

**决策**：手写 discriminated union + 转移函数。正确——7 个状态、~10 条转移规则，TypeScript exhaustive check 在编译期捕获非法转移，无需 XState 的可视化/时间旅行。

### 5.2 Zustand persist + useHydrated

**问题**：Zustand v5 persist 中间件在 Next.js App Router 下异步水合，首帧渲染时 `currentModule = null`，导致概览页过早重定向到导入页。

**修复**：引入 `useHydrated` hook，在 `useEffect` 中设 `hydrated = true`，重定向检查增加 `hydrated &&` 前置条件。这是标准 Next.js 客户端水合模式。

### 5.3 Fill Blank 双策略

Feedback Agent 语义判断为主，`fill-blank.ts` 标准化精确匹配为辅。当 Agent 返回 `retry` 但标准化匹配命中时，覆盖为 `advance`。不处理反向（Agent 返回 `advance` 但标准化不命中）——Agent 是主判官。

### 5.4 Regenerate 策略

原计划 quiz Agent + quiz-batch fallback。审查发现 quiz-batch schema 要求 min 6 题，单 placeholder 无法通过验证。移除 fallback，仅用单题 quiz Agent（`runAgent` 内部已有 5 次重试）。

---

## 6. 与 M6 的衔接

M4-M5 交付给 M6 的输入：

1. **Module Challenge 状态机分支**：`progress-store` 已预留 `challenge` 态 + `advance()` 分支，M6 只需填业务逻辑
2. **Quiz 组件库**：Challenge 题直接复用 ChoiceQuiz + SortingQuiz
3. **Feedback API**：Challenge 答错重试直接调 `/api/regenerate`
4. **Mastery 计算**：M6 追加 Challenge 题 AttemptRecord，`computeMastery` 自然纳入
5. **完成页骨架**：M6/M7 的正式完成页基于当前 done 页扩展（复习入口、历史列表）

---

## 7. 修订记录

| 版本 | 日期 | 修订 | 作者 |
|------|------|------|------|
| 1.0 | 2026-07-08 | 初稿。W1-W8 Must 全部完成，含代码审查修复 | Sisyphus |
