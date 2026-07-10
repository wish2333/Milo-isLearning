# M2 阶段评审纪要（M2-Review）

> **里程碑**：M2 — Prompt 工程闭环（W2-3）
> **评审日期**：2026-07-07
> **评审形式**：自审 + 工程验证（typecheck / build / test 实测）
> **评审依据**：[`PRD.md §14`](./PRD.md)、[`Technical-Specification.md §16/§13.2`](./Technical-Specification.md)、[`Prompt-Engineering.md`](./Prompt-Engineering.md)、[`prompt-evaluation.md`](./prompt-evaluation.md)
> **前置里程碑**：[`M1-Review.md`](./M1-Review.md)（M1 已签字结项）

---

## 0. 文档位置

```
M1-Review.md                     M1 评审纪要（已签字）
   │
   ▼
M2-Review.md  ← 本文档          M2 评审纪要（验收 + 决议 + 签字）
   │
   ▼
M2.5-Plan.md                     M2→M3 过渡计划（真实 LLM 联调 + 工程基建）
   │
   ▼
M3 启动                          Knowledge Compiler 闭环
```

本纪要签字后，M2 视为正式结项，M2.5（过渡）与 M3（编译器串联）可启动。

---

## 1. 验收基准统一

| 来源 | M2 交付定义 | 验收口径 |
|------|------------|---------|
| PRD §14 | 7 个 Agent 的 Prompt + JSON Schema 校验，单 Agent 单测通过 | 单 Agent 单测通过 |
| Tech Spec §16 | 7 Agent Prompt 模板 / Zod Schema / 单 Agent 单测（**含 mock LLM**） | （同上，明确 mock） |
| Tech Spec §13.2 | 每个 Agent 准备 3-5 个固定输入，断言 Schema 通过 + 业务约束 + 评分稳定性；LLM 调用录制（mock）保证可重复 | mock 可重复 |
| Prompt-Eng §12 | M2 末 A/B 测试三变量（模型/语言/thinking） | **M2 末验证项，非验收门** |

**统一基准**：M2 硬验收 = mock LLM 单测通过（Tech Spec §16 明确「含 mock LLM」）。真实 LLM 联调、A/B 决策、业务约束达成率属"M2 末验证"，归入 [`M2.5-Plan.md`](./M2.5-Plan.md)，不阻断 M2 验收。

---

## 2. 交付物核对（实测证据）

### 2.1 M1 超前交付（M2 范围，已在 M1 完成）

| 交付物 | 状态 | 证据 |
|--------|------|------|
| 9 个 Prompt 模板 `.md` + 4 个 `_shared/` 片段 | 完成 | [`src/lib/compiler/prompts/`](../src/lib/compiler/prompts)，M1 已交付 |
| 9 个 Zod Schema（含 superRefine 跨字段校验） | 完成 | [`src/lib/compiler/schemas/`](../src/lib/compiler/schemas)，M1 已交付 |

### 2.2 M2 本里程碑交付（本次新增）

| # | 交付物 | 状态 | 证据 |
|---|--------|------|------|
| 1 | **Prompt 模板加载器** | 完成 | [`prompts/loader.ts`](../src/lib/compiler/prompts/loader.ts)（116 行）：fs 读取 + 递归 `{{> shared/*}}` partial 展开（带 visiting 栈循环检测）+ `{{> schema/<kind>}}` 注入 |
| 2 | **Prompt 构建器 buildPrompt** | 完成 | [`prompts/builder.ts`](../src/lib/compiler/prompts/builder.ts)（106 行）：白名单变量替换（保护 `_shared/distractor-rules.md` 的 `{中文}` 示例）+ system/user 切分 |
| 3 | **schemaToPromptHint 实现** | 完成 | [`schemas/index.ts`](../src/lib/compiler/schemas/index.ts)：用 `zod-to-json-schema` 替换 M1 的 TODO |
| 4 | **Agent 调用运行器 runAgent** | 完成 | [`agents/_runner.ts`](../src/lib/compiler/agents/_runner.ts)（102 行）：buildPrompt → provider.chat → JSON.parse → Zod 校验，含 1 次重试 + `AgentOutputError`（对齐 Tech Spec §4.3） |
| 5 | **Agent 调用配置表** | 完成 | [`agents/config.ts`](../src/lib/compiler/agents/config.ts)（50 行）：9 Agent 的 temperature/maxTokens/disableThinking（对齐 Prompt-Eng §7.2/§7.3） |
| 6 | **错误与工具** | 完成 | [`agents/errors.ts`](../src/lib/compiler/agents/errors.ts)（75 行）：`AgentOutputError` + `safeParseJSON` + `formatZodIssues` |
| 7 | **单 Agent 单测（mock LLM）** | 完成 | [`builder.test.ts`](../src/lib/compiler/prompts/__tests__/builder.test.ts)（10 测试）+ [`runner.test.ts`](../src/lib/compiler/agents/__tests__/runner.test.ts)（11 测试） |
| 8 | **Next.js 生产包追踪** | 完成 | [`next.config.ts`](../next.config.ts)：`outputFileTracingIncludes` 把 `.md` 模板纳入 serverless 函数包 |

---

## 3. 静态验证（实测）

| 检查 | 命令 | 结果 |
|------|------|------|
| TypeScript 严格类型检查 | `bun run typecheck`（`tsc --noEmit`） | **零错误** |
| 单元测试 | `bun run test`（`vitest run`） | **51/51 通过**（M1 基线 30 + 本次新增 21：builder 10 + runner 11），1.46s |
| Next.js 生产构建 | `bun run build` | **通过**（5 个静态页，shared JS 102KB，首页 3.46KB） |

测试明细：
- `providers/__tests__/openai-compat.test.ts`：22（M1）
- `schemas/__tests__/smoke.test.ts`：8（M1）
- `prompts/__tests__/builder.test.ts`：**10（M2 新增）**
- `agents/__tests__/runner.test.ts`：**11（M2 新增）**

验证执行时间：2026-07-07，commit 基线见签字栏。

---

## 4. 五原则合规检查（PRD §16.2）

| 原则 | M2 落实点 | 合规 |
|------|----------|------|
| **P1** Quiz 永远不是目的 | `feynman.md` 模板（M1）+ builder 正确渲染 6 步结构；runAgent 对 feynman Agent 走同一闭环 | 是 |
| **P2** 永远降低表达成本 | builder 白名单替换保护 `_shared/distractor-rules.md` 的 `{中文}` 示例不被误伤（单测断言 `{正确原则}` 保留）；config 给 Quiz 0.7 温度保多样性 | 是 |
| **P3** 每一道题让用户成功 | `feedback` schema（M1）禁用负面词；runAgent 重试不惩罚 LLM，校验失败给可读 hint；config 给 Feedback 0.1 温度保评分稳定 | 是 |
| **P4** 不让用户思考"如何回答" | builder 正确注入 quiz schema（含 `options[0]=answer` 约束）；单测断言 schema 字段进 system 段 | 是 |
| **P5** 输出自由度逐渐增加 | `mission.md`/`feynman.md`（M1）层级递增约束通过 builder 渲染进 prompt；runAgent 对 mission 用 0.2 低温保编排稳定 | 是 |

**合规结论**：Prompt 模板层（M1）+ 渲染/调用闭环层（M2）双重合规。运行时业务约束达成率（真实 LLM 输出是否符合 P2/P3）待 M2.5 真实联调验证。

---

## 5. NFR 状态

| NFR | M2 状态 |
|-----|---------|
| NFR-P1 编译 ≤ 60s | 设计完成（M1）；M2 提供 runAgent 重试机制减少编译期 retry 拖时；实测留待 M3 |
| NFR-P2 Feedback ≤ 1.5s | 设计完成；config 给 Feedback `glm-5-turbo`/0.1 温度/1024 maxTokens；实测留待 M2.5/M4 |
| NFR-R2 Agent 失败重试 2 次 | **M2 实现**：runAgent 实现"1 次原始 + 1 次重试"，对齐 PRD §6.4 NFR-R4 |
| NFR-R4 JSON Schema 强制校验 | **M2 实现**：runAgent 每次 provider.chat 后必过 `safeParseJSON` + `schema.safeParse`，失败抛 `AgentOutputError` |

---

## 6. 风险跟踪与决议

### 6.1 闭环的跟踪项（M2 已解决）

| 跟踪项（来自 M1-Review §6.2） | M2 处置 |
|-------------------------------|---------|
| `schemas/index.ts:schemaToPromptHint` 为 TODO | **已实现**（用 `zod-to-json-schema`） |
| partial 展开循环引用风险（实施期发现） | **已解决**：loader 加 visiting 栈循环检测（实施期 bug，单测覆盖） |
| partial 正则漏配 `>`（实施期发现） | **已解决**：字符类扩为 `[\w/<>-]+`（实施期 bug，单测覆盖） |

### 6.2 转入 M2.5 的跟踪项

| 项 | 转入 | 依据 |
|----|------|------|
| snake_case → camelCase 映射层 | M2.5 W5 | M1-Review §6.1 原定"M2 末在 _runner 建立"；经评估映射层属 assemble 逻辑，归 M3，但 mapper 函数 + 单测提前到 M2.5 |
| 代码质量门禁（prettier/eslint/husky） | M2.5 W6 | M1-Review §6.2「建议 M2 起补」；M2 聚焦闭环未补 |
| 真实 LLM 联调 + A/B 三变量 | M2.5 W1-W4 | Tech Spec §17.2 开放问题 1/2；Prompt-Eng §12 |
| Prompt 模板版本管理（PROMPT_VERSION） | M2.5 W7 | Prompt-Eng §12.4 |

### 6.3 残留风险

- **真实 LLM Schema 通过率未知**：mock 是 100%，真实 DeepSeek/GLM 可能显著低。M2.5 W4 实测，若 < 80% 触发 Prompt 调优。
- **enable_thinking 默认开（GLM）**：M2 config 设了 `disableThinking:true` 字段但 provider 层未透传（W3 未做）。当前 runAgent 未实际注入 `enable_thinking:false`，真实调用时 GLM 默认开 thinking 可能影响 JSON 稳定性。M2.5 W3 优先解决。

---

## 7. 决议与签字

### 7.1 决议

| 编号 | 决议 | 依据 |
|------|------|------|
| **M2-R-01** | M2 验收基准 = mock LLM 单测通过（Tech Spec §16 明确「含 mock LLM」） | 本纪要 §1 |
| **M2-R-02** | M2 全部交付物达标（8 项新增 + M1 超前 2 项），**M2 正式通过** | 本纪要 §2 |
| **M2-R-03** | 真实 LLM 联调、A/B 决策、业务约束达成率归入 M2.5，不阻断 M2 验收 | 本纪要 §1/§6.2 |
| **M2-R-04** | M2.5（过渡）与 M3（编译器串联）可启动；M3 集成测试待 M2.5 W4 决策锁定模型组合 | [`M2.5-Plan.md §6`](./M2.5-Plan.md) |
| **M2-R-05** | 实施期发现的 2 个 bug（loader 循环引用 / partial 正则漏配）已闭环，单测覆盖 | 本纪要 §6.1 |
| **M2-R-06** | git commit + tag `m2-review` 作为 M2 版本基线 | 用户 2026-07-07 指示 |

### 7.2 签字

| 角色 | 姓名 | 日期 | 状态 |
|------|------|------|------|
| 产品负责人 | wish2333 | 2026-07-07 | 已确认 |
| 工程负责人 | wish2333 | 2026-07-07 | 已确认（typecheck / build / test 实测通过） |
| AI/Prompt 工程师 | wish2333 | 2026-07-07 | 已确认（9 Agent IO 闭环单测通过） |

> 当前为单人项目，三角色合并。

### 7.3 版本基线

| 项 | 值 |
|----|----|
| Git Commit | （见 `git log`，本纪要对应的 commit） |
| Git Tag | `m2-review` |
| 远端仓库 | <https://github.com/wish2333/Milo-isLearning> |
| 默认分支 | `main` |

---

## 8. M2.5 / M3 启动条件确认

| 条件 | 状态 |
|------|------|
| M2 全部交付物达标 | 是（§2） |
| M2 评审签字完成 | 是（§7.2） |
| 版本基线建立（commit + tag） | 是（§7.3） |
| M2.5 范围明确 | 是（[`M2.5-Plan.md`](./M2.5-Plan.md) §1，6 项 Must + 3 项 Should） |
| M3 范围明确 | 是（Tech Spec §16：`/api/compile` SSE + pipeline + 输入 Markdown → 输出合法 Module） |
| M2.5/M3 起点状态 | runAgent 闭环就位（mock 验证）；真实 LLM 链路、映射层、质量门禁待 M2.5 建立 |

**结论**：**M2.5 与 M3 可启动**。建议 M2.5 先做 W6（质量门禁）+ W3（extraBody）+ W1（fixtures）+ W2（eval 脚本），跑出 W4 A/B 决策后再进 M3 集成测试。

---

## 9. 附录

### 9.1 评审执行摘要

- 评审对象：M2 里程碑全部交付物（Tech Spec §16 严格基准）
- 验证手段：交付物盘点 + 静态验证（typecheck / build / test 三项实测零失败） + 五原则合规检查
- 关键发现：M2 闭环层（loader/builder/runner/config/errors）全部就位，21 个新单测覆盖 IO 闭环 + 重试 + 错误；实施期发现并修复 2 个真实 bug（loader 循环引用、partial 正则漏配）
- 决议：**M2 通过，M2.5 与 M3 启动**

### 9.2 修订记录

| 版本 | 日期 | 修订 | 作者 |
|------|------|------|------|
| 1.0 | 2026-07-07 | 初稿，M2 评审通过 | wish2333 |

---

> **文档结束**
>
> 本纪要签字即视为 M2 正式结项。后续对 M2 交付物的修改应：
> 1. 通过新评审（修订本纪要或追加 M2.1 纪要）
> 2. 不违反规格书五条产品原则与第九章心理学基础
> 3. 记录到对应文档修订记录表
