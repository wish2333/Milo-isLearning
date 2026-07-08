# M7 工作计划（内测 + 优化 + 部署）

> **M7 Plan V1.0**
> 状态：Draft | 日期：2026-07-08
> 定位：PRD §14 第七个正式里程碑
> 范围：部署上线 + 埋点分析 + 20 人内测 + 质量验证 + Bug 修复优化
> 验收：20 人内测完成，核心指标达基线 60%，编译失败率 < 5%
>
> 承接：[M6-Review](./M6-Review.md) 交付的完整学习流程（含 Challenge + 完成页 + Settings + 开发者指南）

---

## 0. 定位与约束

M7 是 MVP 验证的最终阶段。M1-M6 交付了完整的功能闭环，M7 的任务是**让真实用户用起来，收集数据，验证 PRD §1.3 的核心假设**：

> 用户是否愿意走完一条"Markdown → 编译 → Quiz 阶梯 → 费曼"的路径，并在走完后感到自己真的学会了。

三大目标：

1. **可访问**：部署到公网，内测用户无需本地开发环境即可使用
2. **可度量**：接入埋点系统，收集 PRD §11.4 的 10 个核心事件，计算 §11.1-11.3 的北极星 / 核心 / 过程指标
3. **可迭代**：基于内测反馈修复 bug、调优 Prompt、优化体验

**不在范围内**：
- 用户账号 / 云端同步（V2）
- 自适应难度（V4）
- 多 Module 课程（V2）
- PDF / 网页输入（V3）

---

## 1. 已就位的基础设施（M1-M6 遗产）

### 1.1 功能闭环

| 环节 | 状态 | 关键文件 |
|------|------|---------|
| Markdown 导入 | Done | `app/learn/import/page.tsx` |
| 编译 Pipeline（8 阶段） | Done | `lib/compiler/pipeline/pipeline.ts` |
| Concept 学习（Choice/Sorting/FillBlank） | Done | `components/quiz/` + `components/learn/ConceptView.tsx` |
| Module Challenge（跨概念综合题） | Done | `components/learn/ChallengeView.tsx` |
| 费曼 6 步 | Done | `components/learn/Feynman*.tsx` |
| 完成页（Mastery + 复习入口 + 历史） | Done | `app/learn/done/page.tsx` |
| Settings（LLM 配置 + .env.local 自动加载） | Done | `app/settings/page.tsx` + `EnvConfigLoader` |

### 1.2 API 端点

| 端点 | 用途 |
|------|------|
| `POST /api/compile` | 编译 Markdown → Module（SSE 流式） |
| `POST /api/feedback` | 答题评分 |
| `POST /api/regenerate` | 答错换题 |
| `POST /api/feynman-eval` | 费曼最终输出评分 |
| `POST /api/ping` | LLM 连接测试 |
| `GET /api/env-config` | .env.local 配置读取 |

### 1.3 测试与质量

- 149 个 vitest 单测全过
- tsc 0 错误，eslint 0 错误 0 警告
- M4-M5 Review §3.2 技术债全部清零
- Playwright E2E happy path 通过（不含 Challenge）

### 1.4 文档

- `docs/dev-guide.md` — 开发者指南
- `docs/M6-Review.md` — M6 交付审查
- `docs/PRD.md` §11 成功指标 + §11.4 埋点事件清单

---

## 2. 范围

### 2.1 包含（Must）

| # | 工作项 | 来源 | 交付物 |
|---|--------|------|--------|
| W1 | **Vercel 部署 + 环境配置** | PRD §14 M8 前置 | Vercel 项目创建 + 环境变量配置 + 域名绑定 + 部署验证 |
| W2 | **埋点系统接入** | PRD §11.4 | 10 个核心事件的客户端埋点 + 事件上报 + 数据看板 |
| W3 | **用户评分组件** | PRD §11.2 | 完成页弹出 5 分制评分 + `rating_submitted` 事件 |
| W4 | **E2E 测试扩展** | M6-Review §6 | Playwright E2E 含 Challenge 阶段全流程 smoke |
| W5 | **编译质量验证** | M6-Review §6 / PRD §13.1 | ≥ 5 次真实 LLM 编译 + Challenge 题跨概念质量抽检 + Prompt 调优 |
| W6 | **断点续编验证** | M6-Review §6 | 手动刷新恢复测试 + 修复发现的问题 |
| W7 | **内测执行 + 反馈收集** | PRD §14 | 20 人内测 + 反馈问卷 + Bug 列表 + 指标统计 |

### 2.2 包含（Should，资源允许时）

| # | 工作项 | 说明 |
|---|--------|------|
| W8 | **性能优化** | 编译 P95 耗时优化（Challenge Agent 耗时评估）、首屏加载优化 |
| W9 | **错误体验优化** | 编译失败页改进（错误码 → 可操作建议）、离线提示 |
| W10 | **SEO + 分享 Meta** | OG 标签 + 页面 title/description 优化 |

### 2.3 不包含

- 用户账号系统（V2）
- 云端进度同步（V2）
- 自适应难度（V4）
- 多 Module 课程（V2）
- 付费 / 订阅（V2+）

---

## 3. 交付物详情

### W1 Vercel 部署 + 环境配置

**步骤**：

1. `vercel.json` 已存在，确认配置（Next.js preset + 函数超时）
2. 在 Vercel 创建项目，关联 Git 仓库
3. 配置环境变量（Vercel Dashboard → Settings → Environment Variables）：
   - `DEFAULT_LLM_PROVIDER` = sensenova（或 deepseek）
   - `DEFAULT_LLM_MODEL` = deepseek-v4-flash
   - `SENSENOVA_API_KEY` = [内测用 Key]
   - `NEXT_PUBLIC_APP_VERSION` = 0.1.0-m7
4. 部署 + 验证：
   - 访问部署 URL
   - Settings 页确认 .env.local 自动加载生效
   - 执行一次完整编译 + 学习流程

**注意事项**：
- Vercel Serverless 函数超时：免费版 10s，Pro 版 60s。编译流程可能超时——需要确认 SSE 流式传输是否在 Vercel 上正常工作
- 如果 SSE 超时：考虑升级 Pro 或改用 Edge Runtime

### W2 埋点系统接入

**方案选择**：使用轻量级客户端埋点，不引入第三方分析平台（MVP 阶段最小化依赖）。

**新建文件**：

```
src/lib/analytics/
├── events.ts          # 事件类型定义（对齐 PRD §11.4）
├── tracker.ts         # 事件上报器（console + 可扩展）
└── useAnalytics.ts    # React hook（页面 PV 自动埋点）
```

**事件清单**（PRD §11.4）：

```typescript
type AnalyticsEvent =
  | { event: 'page_view'; page: 'home' | 'import' | 'compiling' | 'overview' | 'learn' | 'feynman' | 'done' }
  | { event: 'compile_start'; sourceId: string; contentLength: number }
  | { event: 'compile_complete'; sourceId: string; moduleConceptCount: number; durationMs: number }
  | { event: 'compile_failed'; sourceId: string; stage: string; error: string }
  | { event: 'quiz_attempt'; quizId: string; ladderLevel: number; expressionLevel: number; score: number; attemptCount: number; durationMs: number }
  | { event: 'quiz_advance'; quizId: string; nextAction: 'advance' | 'retry' }
  | { event: 'feynman_step_complete'; moduleId: string; stepOrder: number; score: number }
  | { event: 'feynman_final_submit'; moduleId: string; finalScore: number; rubricHits: number }
  | { event: 'mastery_update'; moduleId: string; moduleCompletion: number; conceptMasteryAvg: number }
  | { event: 'module_complete'; moduleId: string; totalDurationMs: number; masteryScore: number }
  | { event: 'rating_submitted'; moduleId: string; score: 1 | 2 | 3 | 4 | 5 }
```

**上报策略**：
- MVP 阶段：`console.log` 输出（`TELEMETRY_BACKEND=console`，已在 .env.example 中）
- 后续可扩展：接入 Vercel Analytics / PostHog / 自建端点
- 不阻断用户流程：`tracker.track()` 是 fire-and-forget，异常静默

**埋点接入点**：

| 事件 | 接入位置 |
|------|---------|
| `page_view` | `useAnalytics` hook，在各页面组件挂载时自动触发 |
| `compile_start` | `app/learn/compiling/page.tsx` — streamCompile 开始时 |
| `compile_complete` | `app/learn/compiling/page.tsx` — 收到 complete 事件时 |
| `compile_failed` | `app/learn/compiling/page.tsx` — 收到 error 事件时 |
| `quiz_attempt` | `components/learn/ConceptView.tsx` + `ChallengeView.tsx` — addAttempt 后 |
| `quiz_advance` | `components/learn/ConceptView.tsx` + `ChallengeView.tsx` — handleAdvance/handleRetry 时 |
| `feynman_step_complete` | `components/learn/FeynmanStepView.tsx` — 记录得分时 |
| `feynman_final_submit` | `components/learn/FeynmanFinalView.tsx` — handleFinish 时 |
| `mastery_update` | `app/learn/done/page.tsx` — mastery 计算后 |
| `module_complete` | `app/learn/done/page.tsx` — 页面加载时 |
| `rating_submitted` | W3 评分组件 — 用户提交评分时 |

### W3 用户评分组件

**新建文件**：`components/learn/RatingPrompt.tsx`

**设计**：
- 在完成页（`done/page.tsx`）底部弹出
- 5 分制评分（1=没学到什么，5=完全掌握了）
- 提交后触发 `rating_submitted` 事件
- 提交后隐藏，不重复弹出（LocalStorage 标记 `alc:rating:{moduleId}`）
- 不强制——用户可以跳过

### W4 E2E 测试扩展

**修改文件**：`e2e/smoke.spec.ts`

**扩展内容**：
- 现有 E2E 覆盖到 Feynman → Done
- 新增：Concept 末题完成后验证 Challenge 阶段出现
- 新增：Challenge 题作答（答对 advance + 答错 retry）
- 新增：完成页验证 Challenge 得分显示
- 新增：完成页验证待复习概念入口
- 新增：完成页验证历史 Module 列表

### W5 编译质量验证

**验证项**：

| # | 验证内容 | 方法 | 通过标准 |
|---|---------|------|---------|
| 1 | 编译成功率 | 运行 ≥ 5 次真实编译（不同 Markdown） | 失败率 < 5% |
| 2 | Challenge 题跨概念质量 | 人工抽检每道题是否真正涉及 ≥ 2 Concept | ≥ 80% 合格 |
| 3 | 编译耗时 | 测量 P95（从 compile_start 到 compile_complete） | P95 < 120s |
| 4 | Quiz 答题正确率 | 统计首次 Attempt 的 score 分布 | 70-85% 均值 |
| 5 | LLM 输出格式合规率 | 统计 Zod 校验通过率（含重试后） | ≥ 95% |

**Prompt 调优**：
- 如果 Challenge 题跨概念质量不达标：调优 `challenge-batch.md` prompt，增加正反例
- 如果编译失败率 > 5%：分析失败 stage + error code，针对性修复

### W6 断点续编验证

**测试场景**：

| # | 场景 | 预期行为 |
|---|------|---------|
| 1 | 编译中页刷新 | SSE 连接断开，编译状态丢失（预期行为，非 bug） |
| 2 | Concept 学习中刷新 | progress-store 从 LocalStorage 恢复，回到刷新前的题目 |
| 3 | Challenge 学习中刷新 | 同上，回到刷新前的 Challenge 题 |
| 4 | Feynman 步骤中刷新 | 同上，回到刷新前的 Feynman step |
| 5 | 完成页刷新 | 保持在完成页（stage = done） |
| 6 | 清空 LocalStorage 后刷新 | 回到首页，提示重新配置 |

**修复**：如果场景 2-5 未能正确恢复，排查 Zustand persist 配置 + useHydrated 使用。

### W7 内测执行 + 反馈收集

**内测招募**：
- 人数：20 人（PRD §14）
- 画像：技术学习者 / 知识工作者
- 方式：发放 Vercel URL + 简要使用说明
- 时长：1-2 周收集期

**反馈收集**：

| 渠道 | 内容 |
|------|------|
| 内测问卷 | 5 分制主观掌握感评分（PRD §11.2）+ 开放反馈 |
| 埋点数据 | PRD §11.1-11.3 全部指标 |
| Bug 报告 | 通过 GitHub Issues 或表单收集 |

**指标统计**（PRD §11.1-11.2 基线 60%）：

| 指标 | 目标 | 基线 60% |
|------|------|---------|
| Module 完成率 | ≥ 40% | ≥ 24% |
| Feynman Final 提交率 | ≥ 60% | ≥ 36% |
| 平均答题正确率 | 70-85% | 42-51% |
| 用户主观掌握感评分 | ≥ 4/5 | ≥ 2.4/5 |
| 次日回访率 | ≥ 25% | ≥ 15% |

---

## 4. 关键设计决策

### 4.1 埋点方案：自建 console vs 第三方平台

**决策**：MVP 阶段用 console.log + 可扩展接口，不引入第三方。

**理由**：
- 内测阶段用户量小（20 人），第三方分析平台免费额度绰绰有余但引入依赖
- `tracker.ts` 设计为可扩展：后续只需替换 `backend` 从 console 到 Vercel Analytics / PostHog
- 保持 BYOK 架构一致：不引入新的服务端依赖

### 4.2 部署平台：Vercel vs 自建

**决策**：Vercel。

**理由**：
- Next.js 原生支持，零配置部署
- SSE 流式传输在 Vercel Serverless 上需验证（免费版 10s 超时可能不够）
- 环境变量管理方便（Dashboard 配置）
- 如果 SSE 超时：升级 Pro（60s）或改用 Edge Runtime

### 4.3 评分组件：强制 vs 可跳过

**决策**：可跳过。

**理由**：PRD P2 原则"永远降低表达成本"——评分本身是一种表达负担。用户可以跳过评分直接退出。已评分的 Module 不再弹出（LocalStorage 标记）。

### 4.4 内测 LLM 配置：BYOK vs 统一 Key

**决策**：统一 Key（内测期间），正式发布后 BYOK。

**理由**：
- 内测用户多为非技术人员，要求其自行注册 LLM API Key 门槛过高
- 内测期间在 Vercel 环境变量中配置统一 Key，用户无需配置即可使用
- 正式发布后切换为 BYOK（用户自带 Key），Settings 页已支持

---

## 5. 工作分解与依赖

```
W1 Vercel 部署 ──► W7 内测执行
                      │
W2 埋点系统 ──► W3 评分组件 ──► W7
                      │
W4 E2E 扩展 ──────────┤
                      │
W5 编译质量验证 ──────┤
                      │
W6 断点续编验证 ──────┘
```

**建议顺序**：
1. **W1 Vercel 部署**先行（内测的前置条件）
2. **W2 埋点系统**（数据收集的基础设施）
3. **W3 评分组件**（依赖 W2 的 `rating_submitted` 事件）
4. **W4 E2E 扩展** + **W5 编译质量验证** + **W6 断点续编验证**（可并行）
5. **W7 内测执行**（依赖 W1-W6 全部就绪）

**工作量预估**（粗估，单人）：

| 工作项 | 预估天数 |
|--------|---------|
| W1 Vercel 部署 | 0.5-1 天 |
| W2 埋点系统 | 2-3 天 |
| W3 评分组件 | 0.5 天 |
| W4 E2E 扩展 | 1 天 |
| W5 编译质量验证 | 2-3 天（含 Prompt 调优） |
| W6 断点续编验证 | 0.5-1 天 |
| W7 内测执行 + 反馈 | 1-2 周（含等待用户反馈） |
| W8-W10 Should 项 | 1-2 天 |
| **合计** | **~3-4 周（含内测等待期）** |

---

## 6. 验收标准

| 验收项 | 目标 | 验证 |
|--------|------|------|
| Vercel 部署可访问 | URL 可正常打开 + 全流程走通 | 手动验证 |
| 埋点事件覆盖 | PRD §11.4 的 10 个事件全部接入 | 代码审查 + console 日志验证 |
| 评分组件 | 完成页弹出评分 + 提交后不重复 | 手动验证 |
| E2E 含 Challenge | Playwright 全流程 smoke 通过 | `bun run e2e` |
| 编译成功率 | 失败率 < 5% | ≥ 5 次真实编译 |
| Challenge 题质量 | ≥ 80% 题目真正涉及 ≥ 2 Concept | 人工抽检 |
| 断点续编 | 刷新后恢复到正确阶段 | 手动测试 6 个场景 |
| 内测完成 | 20 人内测完成 | 反馈问卷回收 ≥ 10 份 |
| 核心指标达基线 60% | PRD §11.1-11.2 各指标 ≥ 目标的 60% | 埋点数据统计 |
| 编译失败率 | < 5% | `compile_failed` / `compile_start` |
| 类型安全 | tsc --noEmit 0 错 | `bun run typecheck` |
| Lint | 0 错 0 警告 | `bun run lint` |

---

## 7. 风险

| 风险 | 等级 | 缓解 |
|------|------|------|
| Vercel Serverless SSE 超时（免费版 10s） | 高 | 升级 Pro（60s）；或改用 Edge Runtime；或改为非流式编译（前端轮询） |
| 内测用户不愿自行配置 LLM Key | 高 | 内测期间统一 Key（Vercel 环境变量），用户无需配置 |
| Challenge 题跨概念质量不达标（题干实际只涉及 1 Concept） | 中 | W5 人工抽检 + Prompt 调优 + Schema `involvedConceptIds: min(2)` 校验 |
| 编译耗时超预期（P95 > 120s） | 中 | 评估 Challenge Agent 额外耗时；必要时用 lightweight 模型 |
| 内测反馈数据不足（回收率低） | 中 | 问卷精简（≤ 5 题）；完成页评分组件降低门槛 |
| 统一 Key 被滥用（超出限额） | 低 | 内测人数控制 20 人；监控 API 用量 |

---

## 8. 与 M8 的衔接

M7 交付给 M8 公测的输入：

1. **可访问的公网 URL**：Vercel 部署稳定运行
2. **数据驱动的优化**：基于内测埋点数据修复了 Top bug + 调优了 Prompt
3. **核心指标验证**：北极星指标（Module 完成率）达基线 60%，可决策是否公测
4. **BYOK 切换就绪**：Settings 页 + .env.local 自动加载已支持用户自带 Key
5. **E2E 覆盖**：Playwright 全流程含 Challenge 通过

### M8 待办（公测发布）

- 切换为 BYOK 模式（移除统一 Key）
- 正式域名绑定
- 北极星指标监测看板
- 用户反馈持续收集通道
- V2 功能规划（基于内测数据）

---

## 9. 修订记录

| 版本 | 日期 | 修订 | 作者 |
|------|------|------|------|
| 1.0 | 2026-07-08 | 初稿。W1-W7 Must + W8-W10 Should。承接 M6-Review §6 | Sisyphus |
