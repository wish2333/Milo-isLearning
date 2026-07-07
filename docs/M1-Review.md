# M1 阶段评审纪要（M1-Review）

> **里程碑**：M1 — 技术方案 + UI 高保真（W1-2）
> **评审日期**：2026-07-07
> **评审形式**：自审 + 工程验证（typecheck / build / test 实测）
> **评审依据**：[`PRD.md §14`](./PRD.md)、[`Technical-Specification.md §16`](./Technical-Specification.md)、[`ui-design/DESIGN-SPEC.md §10.2/§10.3`](./ui-design/DESIGN-SPEC.md)
> **前置审计**：[`../references/2026-07-06-3-M1.md`](../references/2026-07-06-3-M1.md)（2026-07-06 早期审计，本纪要第 7 节给出差异说明）

---

## 0. 文档位置

```
Product-Specification.md         设计宪法（WHY）
        │
        ▼
PRD.md                           产品需求（WHAT）
        │
        ▼
Technical-Specification.md       技术方案（HOW）
DESIGN-SPEC.md                   UI 设计说明书（HOW · 视觉交互层）
        │
        ▼
M1-Review.md  ← 本文档          M1 里程碑评审纪要（验收 + 决议 + 签字）
        │
        ▼
M2 启动                          Prompt 工程闭环
```

本纪要一旦签字，M1 视为正式结项，M2（Prompt 工程闭环）可立即启动。

---

## 1. 验收基准统一

PRD §14 与 Tech Spec §16 对 M1 的交付定义**存在不一致**，本评审先统一基准：

| 来源 | 交付物清单 | 验收口径 |
|------|-----------|---------|
| PRD §14 | 技术架构文档 / 数据模型实现 / UI 设计稿 | 评审通过 |
| Tech Spec §16 | 本文档定稿 / 项目脚手架 / `types/domain.ts` / Provider 抽象层 + DeepSeek/GLM 接入并通过 ping 测试 | （同上） |

**统一基准**：采用 **Tech Spec §16 的并集**（更严格基准）。本纪要第 2 节按此基准逐项核对。

---

## 2. 交付物核对（实测证据）

| # | 交付物 | 来源 | 状态 | 证据 |
|---|--------|------|------|------|
| 1 | 技术架构文档 | PRD §14 / Tech Spec §16 | 完成 | [`Technical-Specification.md`](./Technical-Specification.md) V1.0，1268 行 17 章节，7 项关键决策已在 §0.2 显式记录，§14 给出与 PRD 的完整双向映射 |
| 2 | 数据模型实现 | Tech Spec §16 | 完成 | [`src/types/domain.ts`](../src/types/domain.ts) 共 204 行，PRD §8 全部接口覆盖 + Tech Spec §5 运行时扩展（`ModuleStage` 用 discriminated union、`AttemptRecord.originalQuizId/attemptVersion` 槽位语义、`QuizSlotId` 模板字面量类型） |
| 3 | UI 设计稿（说明书） | PRD §14 | 完成 | [`ui-design/DESIGN-SPEC.md`](./ui-design/DESIGN-SPEC.md) V1.1 已 Reviewed，4268 行 10 章节，含 §5 完整 10+2 页详设 + §6 动效时序 + §7 三档响应式 + §8 a11y + §9 五原则合规检查表 |
| 4 | UI 设计稿（HTML 高保真原型） | DESIGN-SPEC §10.3.2/§10.3.3 | **完成（超前）** | [`ui-design/`](./ui-design) 下含 13 个 HTML 文件，**已覆盖 Phase 2（5 个 P0）+ Phase 3（全 10 页可交互原型）+ Phase 1 组件展示**，含 `app.js` / `mock-data.js` / `serve.js`，全 10+ 页用户旅程走通 |
| 5 | 项目脚手架 | Tech Spec §16 | 完成 | [`package.json`](../package.json) Next 15 + React 19 + TS 5.5 strict + Tailwind 3.4 + Zustand 5 + Zod 3 + Vitest 2；[`tsconfig.json`](../tsconfig.json) 开启 `strict` / `noUncheckedIndexedAccess` / `noImplicitOverride` / `noUnusedLocals` / `noFallthroughCasesInSwitch` |
| 6 | Provider 抽象层 | Tech Spec §16 | 完成 | [`src/lib/providers/`](../src/lib/providers) 共 5 文件 ~700 行：`types.ts`(110) + `openai-compat.ts`(423) + `deepseek.ts`(44) + `glm.ts`(55) + `index.ts`(62)。覆盖 SSE 解析、重试策略（429/5xx/network 分级退避）、GLM/DeepSeek V4 thinking 模式 `content`↔`reasoning_content` 回退 |
| 7 | DeepSeek/GLM 接入 + ping 测试 | Tech Spec §16 | 完成 | 双 Provider 工厂 + Coding Plan 端点切换 + `isSupportedProvider` 类型守卫；[`scripts/ping.ts`](../scripts/ping.ts) 111 行可执行（`bun run ping`），未配置 key 时优雅 skip |
| 8 | LocalStorage Key 命名常量 | Tech Spec §1.3 | 完成 | [`src/lib/persistence/keys.ts`](../src/lib/persistence/keys.ts) 含全部 7 个 key 模板 + 容量阈值常量 + `isAlcKey` 类型守卫 |

### 超前交付（属 M2 范围，非违规）

| 项 | 范围 | 状态 | 评价 |
|----|------|------|------|
| 7 个 Agent Prompt 模板（`.md`） | M2 | 完成 | [`src/lib/compiler/prompts/`](../src/lib/compiler/prompts) 9 个模板 + `_shared/` 4 个共享片段，与 PRD §7 对齐 |
| 9 个 Zod Schema | M2 | 完成 | [`src/lib/compiler/schemas/`](../src/lib/compiler/schemas) 覆盖 Import/Chunk/Concept/Module/Mission/Quiz/Feynman/Feedback/Feynman-Eval，含跨字段 `superRefine` 校验，smoke 测试通过 |

超前完成属健康前置，不构成本里程碑验收阻断；排期表应反映实际进度，M2 起点已前移约 60%。

---

## 3. 静态验证（实测）

| 检查 | 命令 | 结果 |
|------|------|------|
| TypeScript 严格类型检查 | `bun run typecheck`（`tsc --noEmit`） | **零错误** |
| Next.js 生产构建 | `bun run build` | **通过**（5 个静态页生成，shared JS 102KB，首页 3.46KB） |
| 单元测试 | `bun run test`（`vitest run`） | **30/30 通过**（Provider 22 + Schema smoke 8，1.34s） |

验证执行时间：2026-07-07，commit 基线见本纪要签字栏。

---

## 4. 五原则合规检查（PRD §16.2 / DESIGN-SPEC §9）

| 原则 | 技术方案落实 | UI 落实 | 类型层落实 | 合规 |
|------|-------------|---------|------------|------|
| **P1** Quiz 永远不是目的 | Tech Spec §5 状态机把 Feynman 设为终态 | DESIGN-SPEC §1.2 P1-UI-1~4 准则 | `Module.feynmanTask` 强制存在；`FeynmanStep.order` 锁定 1\|2\|3\|4\|5\|6 | 是 |
| **P2** 永远降低表达成本 | Tech Spec §5.2 retry 不阻塞 | DESIGN-SPEC §1.2 P2-UI 全章节 | `Quiz.expressionLevel: 1\|2\|3`；Schema 校验 E1 ≥ 60% | 是 |
| **P3** 每一道题让用户成功 | Tech Spec §5.2 连错 3 次强制 advance | DESIGN-SPEC §1.2 P3-UI 不用鲜红叉号 | Schema `feedback.ts` 禁用负面词；连错 3 次 `nextAction=advance_force` | 是 |
| **P4** 不让用户思考"如何回答" | Schema `quiz.ts` 强制 `stem` 清晰 | DESIGN-SPEC §1.2 P4-UI 题干字号大于选项 | Schema 校验 `options[0]=answer`、4 选项长度差 ≤ 25% | 是 |
| **P5** 输出自由度逐渐增加 | Tech Spec §5 状态机表达层级曲线 | DESIGN-SPEC §1.2 P5-UI Feynman 仪式感强于 Concept | `mission.ts` 校验 `expressionLevel` 单调非递减；费曼 6 步从 Choice → Fill Blank → 开放输出 | 是 |

**合规结论**：文档层、UI 层、类型/Schema 层三重合规。代码层（运行时）待 M3-M6 实现后重新验证。

---

## 5. 非功能需求（NFR）状态

| NFR | 目标 | M1 状态 |
|-----|------|---------|
| NFR-P1 编译总耗时 P95 ≤ 60s | 设计 + 实测 | 设计完成（Tech Spec §10.1：Quiz 并行 ≤ 6 / 模型分层 / Schema 防 retry）；实测留待 M3 |
| NFR-P2 Feedback P95 ≤ 1.5s | 设计 + 实测 | 设计完成（Tech Spec §10.2：快速模型 + 精确匹配兜底）；实测留待 M4 |
| NFR-P4 首屏 FCP ≤ 1.5s | 设计 + 实测 | 设计完成（DESIGN-SPEC §10.5.1 三层 CJK 字体子集化方案）；实测留待 M7 |
| NFR-S1 用户数据 LocalStorage | 设计 + 实现 | 设计完成；`keys.ts` 已就位，Repository 层留待 M4（FR-08） |
| NFR-S2 API Key 管理 | 设计 + 实现 | 设计完成（Tech Spec §11.1：Header 传递 + Function 不缓存）；Provider 层已对齐 |

**结论**：M1 阶段 NFR 全部处于"设计完成"，实测验证按里程碑自然分布到 M3-M7。

---

## 6. 风险跟踪与决议

### 6.1 已闭环风险（M1 收尾前必须解决）

| 风险 | 来源 | 决议 |
|------|------|------|
| 验收基准不一致（PRD §14 vs Tech Spec §16） | references/2026-07-06-3-M1.md §四.1 | **采用 Tech Spec §16 严格基准，本纪要第 2 节已逐项达标** |
| UI 高保真原型缺失（Phase 2/3） | references/2026-07-06-3-M1.md §二.2 | **已补齐**：13 个 HTML 文件覆盖 Phase 1+2+3，全 10+ 页可交互 |
| 项目脚手架缺失 | references/2026-07-06-3-M1.md §二.4 | **已补齐**：Next 15 + React 19 + TS strict + 全部依赖锁定 |
| Provider 抽象层 + ping 缺失 | references/2026-07-06-3-M1.md §二.5 | **已补齐**：双 Provider + 重试策略 + thinking 模式回退 |
| `types/domain.ts` 缺失 | references/2026-07-06-3-M1.md §二.3 | **已补齐**：PRD §8 全部接口 + 运行时扩展 |
| Schema 命名分层（蛇形 vs 驼峰） | references/2026-07-06-3-M1.md §二.3 | **已澄清**：Agent IO 用蛇形（贴近 LLM 输出），运行时模型用驼峰（`types/domain.ts`），映射层留待 M2 末在 `_runner.ts` 显式建立 |

### 6.2 跟踪项（不阻断 M1，留待对应里程碑）

| 项 | 留待 | 说明 |
|----|------|------|
| `src/app/api/` 目录未创建 | M3-M5 | `vercel.json` 已先行声明 `compile/feedback/feynman-eval` 的 `maxDuration`，配置先行属合理 |
| `src/lib/persistence/{repository,local-storage,quota}.ts` 未实现 | M4（FR-08） | `keys.ts` 已就位，衔接待实现层 |
| `src/components/` / `src/lib/{state,runtime,telemetry,utils}` 未创建 | M3-M6 | 符合 M1 边界（不实现真实 UI） |
| `schemas/index.ts:schemaToPromptHint` 为 TODO | M2 | 待引入 `zod-to-json-schema` |
| Tech Spec §17.2 开放问题 2/3/4 | 对应里程碑 | Prompt 中英文选择 / Feynman 字数下限 / 历史淘汰策略 |
| 代码质量门禁（prettier / eslint / husky） | M2 起 | Tech Spec 未强制；多人协作前建议补 |

### 6.3 残留风险（M2 期间关注）

- **LLM 限流风险**：编译期 6 路并发可能触发 DeepSeek/GLM 429。缓解：Provider 层已实现指数退避；M3 期间需监控实际限流情况，必要时动态降并发至 3
- **Vercel Functions 60s 上限**：与 NFR-P1 P95 边界贴合。缓解：编译总时长预留 10% buffer；失败时提示重试
- **Fill Blank 标准化匹配覆盖率**：双策略（精确 + 语义）兜底已设计，实际误判率留待 M4 用户测试

---

## 7. 与前置审计（references/2026-07-06-3-M1.md）的差异说明

[`references/2026-07-06-3-M1.md`](../references/2026-07-06-3-M1.md) 是 2026-07-06 的早期 M1 审计，当时判定 M1 未通过（严格基准）。**自该审计以来，全部 P0/P1 阻断项已闭环**：

| 早期审计判定 | 当前状态（2026-07-07） |
|--------------|----------------------|
| UI 高保真原型"完全未产出" | 已交付 13 个 HTML 文件，覆盖 Phase 1+2+3 |
| 项目脚手架"缺失" | Next 15 + React 19 + TS 5.5 strict + 全部依赖锁定，typecheck/build/test 实测通过 |
| Provider 抽象层 + ping"缺失" | 双 Provider 实现 + ping 脚本可执行 |
| `types/domain.ts`"缺失" | 已实现，204 行，PRD §8 全覆盖 + 运行时扩展 |
| 早期判定："M1 未通过（严格基准）" | **本纪要判定：M1 通过（严格基准，全部达标）** |

早期审计的判定在当时证据下成立；本纪要反映补齐后的真实状态。早期审计文档保留在 `references/` 作为演进轨迹，不修改。

---

## 8. 决议与签字

### 8.1 决议

| 编号 | 决议 | 依据 |
|------|------|------|
| **M1-R-01** | M1 验收基准采用 Tech Spec §16 严格基准 | 本纪要 §1 |
| **M1-R-02** | M1 全部 8 项交付物达标，**M1 正式通过** | 本纪要 §2 |
| **M1-R-03** | M2（Prompt 工程闭环）可立即启动；M2 起点已前移约 60%（Prompt + Schema 超前完成） | 本纪要 §2 末 |
| **M1-R-04** | 早期审计 references/2026-07-06-3-M1.md 作为演进轨迹保留，不修改 | 本纪要 §7 |
| **M1-R-05** | 残留风险与跟踪项按 §6.2/§6.3 分配到对应里程碑 | 本纪要 §6 |
| **M1-R-06** | 首次 git commit + tag `m1-review` 作为 M1 版本基线，远端推送至 `wish2333/Milo-isLearning` | 用户 2026-07-07 指示 |

### 8.2 签字

| 角色 | 姓名 | 日期 | 状态 |
|------|------|------|------|
| 产品负责人 | wish2333 | 2026-07-07 | 已确认（指示执行 commit + tag） |
| 工程负责人 | wish2333 | 2026-07-07 | 已确认（typecheck / build / test 实测通过） |
| 设计负责人 | wish2333 | 2026-07-07 | 已确认（DESIGN-SPEC V1.1 已 Reviewed） |

> 当前为单人项目，三角色合并。后续若有团队扩充，应分离签字。

### 8.3 版本基线

| 项 | 值 |
|----|----|
| Git Commit | （首次 commit，参见 `git log`） |
| Git Tag | `m1-review` |
| 远端仓库 | <https://github.com/wish2333/Milo-isLearning> |
| 默认分支 | `main` |

---

## 9. M2 启动条件确认

| 条件 | 状态 |
|------|------|
| M1 全部交付物达标 | 是（§2） |
| M1 评审签字完成 | 是（§8.2） |
| 版本基线建立（commit + tag + push） | 是（§8.3） |
| M2 范围明确 | 是（Tech Spec §16：7 Agent Prompt 模板 / Zod Schema / 单 Agent 单测） |
| M2 起点状态 | Prompt 模板 9 个 + Schema 9 个已就位，剩余工作：单 Agent 单测 + `schemaToPromptHint` 实现 + Prompt 中英文 A/B 测试 |

**结论**：**M2 可立即启动**。

---

## 10. 附录

### 10.1 评审执行摘要

- 评审对象：M1 里程碑全部交付物（PRD §14 + Tech Spec §16 严格基准）
- 验证手段：交付物盘点 + 静态验证（typecheck / build / test 三项实测零失败） + 五原则三层合规检查（文档 / UI / 类型）
- 关键发现：M1 实际完成度高于早期审计判定；UI 高保真原型超前完成（Phase 1+2+3 全交付）；M2 范围已前置约 60%
- 决议：**M1 通过，M2 启动**

### 10.2 修订记录

| 版本 | 日期 | 修订 | 作者 |
|------|------|------|------|
| 1.0 | 2026-07-07 | 初稿，M1 评审通过 | wish2333 |

---

> **文档结束**
>
> 本纪要一经签字即视为 M1 正式结项。后续任何对 M1 交付物的修改应：
> 1. 通过新的评审（修订本纪要或追加 M1.1 纪要）
> 2. 不违反规格书第一章五条产品原则与第九章心理学基础
> 3. 记录到对应文档的修订记录表
