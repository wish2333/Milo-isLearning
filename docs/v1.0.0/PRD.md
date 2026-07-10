# AI Learning Compiler 产品需求文档（PRD）

> **Product Requirements Document V2.0 — MVP+**
> 版本：2.0 | 状态：Active | 日期：2026-07-10
> 对应规格说明书：[`../v0.1.0/Product-Specification.md`](../v0.1.0/Product-Specification.md) V1.0
> 本 PRD 在 V1.0 MVP 基础上，基于 PRD-Report 审计结论修订，正式纳入实现中涌现的合理偏离与新增产品决策。
<!-- REVISED V2.0: 版本升级至 V2.0，状态改为 Active，引用规格书路径更新 -->

---

## 0. 文档说明

### 0.1 本文档的位置

```
产品规格说明书 (Product Spec)
   └── 定义 WHY 与设计宪法（哲学、原则、心理学基础）
        │
        ▼
产品需求文档 (PRD)  ← 本文档
   └── 定义 WHAT：MVP 要交付哪些功能、达到什么标准
        │
        ▼
技术方案 / UI 设计 / Prompt 工程 / 排期
   └── 定义 HOW
```

PRD 不重复规格书的哲学论述，只在关键决策处引用其章节作为依据。当本文档与规格书冲突时，**以规格书为准**（规格书第一章五条原则与第九章心理学基础是不可违反的宪法）。

### 0.2 读者

- **产品 / 设计**：用于确认范围、用户故事、验收标准
- **前端 / 全栈工程师**：用于功能开发、交互实现、数据建模
- **AI / Prompt 工程师**：用于 Agent 输入输出契约、Prompt 约束
- **QA**：用于测试用例设计与验收

### 0.3 术语

继承规格书[附录 A 术语表](../v0.1.0/Product-Specification.md#附录-a术语表)。本 PRD 额外引入：

| 术语 | 定义 |
|------|------|
| 课程（Course） | MVP 中等于单个 Module（一次编译产出一个 Module） |
| 编译（Compile） | Knowledge Compiler 将 Markdown 转化为 Module 树的离线过程 |
| 题序（Quiz Series） | 单个 Concept 内按 Quiz Ladder 编排的 Quiz 序列 |
| 表达层级（Expression Level） | Quiz 的表达自由度，1-3 级（MVP 仅支持 1-3） |
| Attempt | 用户对一道 Quiz 的一次作答记录 |
| Must / Should / Could | MoSCoW 优先级模型 |
| 蒙对标注（Guessed Flag） | 用户自报"猜对"的标记，影响掌握度计算 |
| 复习槽（Review Slot） | 跨概念间隔重复中，从先前概念注入的复习题 |
| 错题本（Wrong Question Book） | 错题与蒙对题的 Markdown 导出文件 |

---

## 1. 背景与目标

### 1.1 背景

规格书[第一章 1.1](../v0.1.0/Product-Specification.md#11-学习产品的问题) 指出：现有学习产品（视频、阅读、AI 聊天、Quiz 工具）都没有解决一个核心问题——**学习最大的障碍不是知识本身，而是表达成本（Expression Cost）**。

用户放弃学习，往往不是看不懂，而是被要求"用自己的话解释"时大脑空白。这一片刻的空白是所有学习产品失去用户的临界点。

### 1.2 产品使命（引自规格书 §1.2）

> 将任何知识自动编译为一条低摩擦、高掌握度的学习路径。

### 1.3 MVP 要验证的唯一假设

> **用户是否愿意走完一条"Markdown → 编译 → Quiz 阶梯 → 费曼"的路径，并在走完后感到自己真的学会了。**

MVP 不追求功能完整，只追求**核心体验闭环的验证**。任何不直接服务于该假设的功能，一律推迟到 V2+。

### 1.4 MVP 不做的事（与规格书 §5.1 "不包含"对齐）

- PDF / 网页 / 视频输入
- 多 Module 课程（一次编译只产出一个 Module）
- Concept Graph / 依赖图 / 难度图
- Adaptive Learning / IRT / BKT / DKT
- Today's Mission / 每日任务
- 用户账号 / 云端同步 / 多端登录
- 付费 / 订阅 / 商业化

> **关于 Spaced Repetition**：V1.0 标注为不做，V2.0 引入**跨概念间隔重复**（NP-10）作为轻量实现，专注于同一 Module 内概念间的错题重温。全量 Spaced Repetition 系统仍推迟到 V4+。
<!-- REVISED V2.0: NP-10 跨概念间隔重复作为轻量例外引入 -->

---

## 2. 目标用户与场景

### 2.1 目标用户画像

**主要用户 P1：进阶学习者**
- 已具备某领域基础知识，正在学习更深层概念（如已懂 Python 在学 RAG、已懂 React 在学 React Fiber）
- 痛点：看完了教程但说不出来；记住了名词但无法组织成解释
- 期望：用最低心理负担完成"理解 → 表达"的转化

**主要用户 P2：技术内容消费者**
- 日常阅读大量 Markdown 文档（开源项目 README、技术博客、论文笔记）
- 痛点：读完即忘，没有有效的内化手段
- 期望：把任意一篇文档"编译"成可练习的路径

**次要用户 S1：教师 / 内容创作者**
- 希望把自己的讲义快速转化为学生可练习的交互式内容
- MVP 不为此画像做专门优化，但产品天然兼容该用途

### 2.2 核心使用场景

| 场景 | 触发 | 行为 | 期望结果 |
|------|------|------|---------|
| 文档内化 | 读完一篇 RAG 讲义 | 粘贴 Markdown → 编译 → 走完 Module | 能用自己的话向同事解释 RAG |
| 概念巩固 | 学完 Transformer 注意力机制 | 粘贴相关段落 → 编译 → 走完 Module | 能完整解释 Self-Attention |
| 学习自检 | 怀疑自己没真正理解某概念 | 粘贴文档 → 走到费曼步骤 | 通过费曼输出暴露理解盲区 |

### 2.3 反向场景（Non-Goals，明确不服务）

- 语言单词学习（多邻国已做得足够好）
- 应试刷题（考研、考证题库）
- 长视频课程替代
- 实时问答 / 搜索引擎替代

### 2.4 设计 Token：字体平衡

<!-- NEW V2.0: NP-08 字体平衡优化 -->
V2.0 对 CSS 字号 Token 进行平衡调整，以 `--text-lg: 22px` 为不动 pivot，小字放大、大字缩小，形成平滑梯度：

| Token | V1.0 值 | V2.0 值 | 用途 |
|-------|---------|---------|------|
| `--text-xs` | 12px | **15px** | 徽章/计数器/元信息 |
| `--text-sm` | 14px | **16px** | 导航链接/次要正文 |
| `--text-base` | 16px | **17px** | 正文/按钮/输入框 |
| `--text-md` | 18px | **19px** | 选项文字/反馈文案 |
| `--text-lg` | 22px | **22px** | 模块导言/页面副标题（pivot，不动） |
| `--text-xl` | 28px | **26px** | 题干/Section 标题 |
| `--text-2xl` | 36px | **32px** | 概念名/完成页分数 |
| `--text-3xl` | 48px | **42px** | Module 标题/概览页 |
| `--text-4xl` | 64px | **54px** | 首页 hero/完成页主标题 |

**调整依据**：中文笔画密集，12px 几乎不可读；学习场景无需 64px 的大字。调整后范围从 [12, 64]（5.33×）压缩至 [15, 54]（3.60×），兼顾可读性与视觉紧凑度。

---

## 3. 用户故事（User Stories）

采用 `As a <角色>, I want <行为>, so that <价值>` 格式。每条标注优先级（M=Must, S=Should, C=Could）。

### 3.1 知识导入

- **US-01 [M]**：作为学习者，我想粘贴一段 Markdown 文本或上传 `.md` 文件，以便系统将其编译为可练习的内容。
- **US-02 [M]**：作为学习者，我想看到导入内容的字数 / 预估编译时长，以便判断是否值得等待。
- **US-03 [S]**：作为学习者，当我的 Markdown 格式不规范（标题层级混乱、混合 HTML）时，我想系统仍然能处理，而不是报错。

### 3.2 编译

- **US-04 [M]**：作为学习者，我想点击"开始编译"后看到进度反馈（如"正在切分知识块 → 提取概念 → 生成练习"），以便我知道系统在工作。
- **US-05 [M]**：作为学习者，编译完成后我想看到课程概览（Module 标题、包含的概念数、预计学习时长），以便决定是否开始。
- **US-06 [S]**：作为学习者，当编译失败（如内容过短、无有效概念）时，我想看到可理解的错误提示与修改建议。

### 3.3 Concept 学习循环

- **US-07 [M]**：作为学习者，我想看到 Module 导言（"完成本模块后，你能……"），以便明确学习目标。
- **US-08 [M]**：作为学习者，我想用**一次点击**作答一道 Quiz（纯选择题），以便以最低心理负担开始。
- **US-09 [M]**：作为学习者，我想在作答后**立即**看到对错反馈与解释，以便即时校准理解。
- **US-10 [M]**：作为学习者，当我答错时，我想看到解释并继续推进到下一题，不会被惩罚或卡住。错题记入薄弱点队列，供后续跨概念复习巩固。（Challenge 阶段保留换题重试机制）
  <!-- REVISED V2.0: 简化自"自动获得同类型新题"，与当前实现对齐 -->
- **US-11 [M]**：作为学习者，我想看到当前 Concept 的进度（如 3/8 题），以便知道还有多远。
- **US-12 [S]**：作为学习者，我想看到当前 Quiz 属于哪个认知层级（识别 / 辨别 / 联想 / 应用）的可视化指示，以便感知难度上升（**注**：此条需谨慎，避免破坏"无感"原则，详见 §10.4）。

### 3.4 Module Challenge

- **US-13 [M]**：作为学习者，在所有 Concept 完成后，我想遇到 3-5 道**跨概念综合题**，以便感受概念之间的关联。
- **US-14 [S]**：作为学习者，Module Challenge 的题目应明显比单 Concept 题更具综合性，让我产生 Aha Moment。

### 3.5 Module Feynman

- **US-15 [M]**：作为学习者，我想先完成 4 步**低摩擦选择**题（解释开头 / 方向 / 例子 / 最佳完整解释），以便在不知不觉中内化解释的结构。
- **US-16 [M]**：作为学习者，第 5 步我想做一道**短句补全**（填半句话），以便过渡到自主输出。
- **US-17 [M]**：作为学习者，最后一步我想用自己的话**完整解释**整个 Module 的目标，并获得 AI 基于关键点的评分。
- **US-18 [M]**：作为学习者，费曼最终输出后，我想看到我遗漏了哪些关键点（gaps），以及一份示例范文，以便对照学习。
- **US-19 [S]**：作为学习者，我想在费曼最终输出可以选择"再来一次"重写，而不是只允许提交一次。

### 3.6 掌握度与完成

- **US-20 [M]**：作为学习者，我想看到 Module 整体完成度（百分比）和每个 Concept 的掌握度，以便感知进步。
- **US-21 [M]**：作为学习者，Module 全部完成（含费曼）后，我想看到完成页（祝贺 + 掌握度总结 + 重新学习入口），以便获得闭环感。
- **US-22 [S]**：作为学习者，我想在中途退出后下次回到同一 Module 时**恢复进度**（基于 LocalStorage），而不必从头开始。

### 3.7 全局体验

- **US-23 [M]**：作为学习者，我想在任何时候看到"下一题"按钮是清晰可点的，以便永远知道"再点一下就好"。
- **US-24 [M]**：作为学习者，我想在任何时刻都能看到当前处于 Module 的哪个阶段（Concept A / Challenge / Feynman），以便有方位感。

### 3.8 错题复习

<!-- NEW V2.0: NP-09, NP-10, NP-11, NP-12 -->
- **US-25 [S]**：作为学习者，当我答对但又觉得自己是"蒙对"时，我想在反馈面板标注"蒙对的"，以便系统不将此题计入真实掌握度。
- **US-26 [S]**：作为学习者，我想在完成 Module 后导出我的错题本（Markdown 格式），以便离线复习。
- **US-27 [S]**：作为学习者，我想在一个独立页面集中重刷一个 Module 的所有错题，打乱顺序、不影响主进度。
- **US-28 [S]**：作为学习者，当我在学习下一个 Concept 时，我想看到前面概念中错题的复习题出现，以便巩固薄弱点。

---

## 4. 功能需求（Functional Requirements）

每条需求给出：**描述 / 优先级 / 输入 / 输出 / 约束 / 验收标准**。

### FR-01 知识导入（Knowledge Import）

| 项 | 内容 |
|----|------|
| 优先级 | **Must** |
| 描述 | 用户通过粘贴文本或上传 `.md` 文件提供原始知识材料 |
| 输入 | Markdown 文本（粘贴，上限 20000 字符）或 `.md` 文件（单文件，上限 500KB） |
| 输出 | `KnowledgeSource` 对象（见 §8 数据模型） |
| 约束 | - MVP 仅支持 Markdown，不支持 PDF/网页/视频<br>- 文本下限 200 字符（过短无法编译）<br>- 文件编码限定 UTF-8<br>- 不做格式严格校验，Import Agent 容错处理 |
| 验收 | AC1: 粘贴 200-20000 字符 Markdown 可正常进入编译流程<br>AC2: 上传 ≤500KB 的 `.md` 文件可正常处理<br>AC3: 粘贴 < 200 字符时显示"内容过短，请补充至 200 字以上"<br>AC4: 上传非 `.md` 文件时按钮禁用并提示<br>AC5: 含 HTML 标签、混乱标题层级的 Markdown 仍可编译（容错） |

### FR-02 Knowledge Compiler（知识编译）

| 项 | 内容 |
|----|------|
| 优先级 | **Must** |
| 描述 | 离线运行 Knowledge Compiler，将 Markdown 编译为单个 Learning Module |
| 输入 | `KnowledgeSource` |
| 输出 | `Module`（含 `concepts[]`、每个 Concept 的 `QuizSeries`、`feymanTask`） |
| 约束 | - MVP 编译产物为**单个 Module**（多 Module 推迟）<br>- Module 内 Concept 数量限定 **2-5 个**（过少无法形成 Module Feynman 价值，过多超出 MVP 编译能力）<br>- 每个 Concept 的 QuizSeries 包含 **8-15 道 Quiz**，覆盖 Recognition / Discrimination / Application 三个层级（MVP 不含 Association，详见 §10.2）<br>- 编译总耗时 ≤ 60 秒（含全部 Agent 调用）<br>- 编译过程中显示阶段化进度<br>- Quiz 生成采用 **quiz-batch 架构**：每个 Concept 一次 LLM 调用生成全部 8-15 道 Quiz，而非逐题并行调用<br>  <!-- REVISED V2.0: quiz-batch 架构替换逐题并行，LLM 调用次数降 90% --> |
| 验收 | AC1: 任意 1000-10000 字符的结构良好 Markdown 可在 60s 内编译完成<br>AC2: 编译产物的 Concept 数 ∈ [2, 5]<br>AC3: 每个 Concept 的 Quiz 数 ∈ [8, 15]<br>AC4: 编译产物的 JSON 结构符合 §8 数据模型定义<br>AC5: 编译失败时（无有效概念）显示明确错误提示<br>AC6: 进度反馈覆盖至少 4 个阶段：切分 → 提取概念 → 生成练习 → 设计费曼 |

### FR-03 Quiz 交互系统（Quiz Interaction）

| 项 | 内容 |
|----|------|
| 优先级 | **Must** |
| 描述 | 用户以三种交互类型作答 Quiz：Choice（选择）、Sorting（排序）、Fill Blank（填空） |
| 输入 | 用户作答动作（点击选项 / 拖拽排序 / 输入文本） |
| 输出 | `AttemptRecord`（含 userAnswer、score、gaps、next_action） |
| 约束 | - **Choice**：4 选项单选，一次点击作答<br>- **Sorting**：3-5 个选项拖拽排序（MVP 桌面端用拖拽，移动端用上下箭头）<br>- **Fill Blank**：填入 1-3 个关键词，答案匹配采用"标准化后精确匹配 + 语义相似度 ≥ 0.85"双策略<br>- 表达层级分布：Level 1（纯选择）占 60% 以上，Level 2（选择+排序）占 20%，Level 3（选择+填空）占 20%（**保证低摩擦主导**）<br>- 前 2 题**必须**是 Level 1 Choice（确保开局成功）<br>- 单题作答时间中位数应 < 15 秒（用于运行时监控） |
| 验收 | AC1: Choice 题一次点击即可提交，提交后立即显示反馈<br>AC2: Sorting 题支持拖拽与点击两种方式调整顺序<br>AC3: Fill Blank 题对大小写、首尾空格、全半角不敏感<br>AC4: 同一 Concept 内前 2 题为 Level 1 Choice<br>AC5: 表达层级分布统计符合约束<br>AC6: 单题反馈即时（<10ms，本地判分） |

### FR-04 反馈与重试机制（Feedback & Retry）

<!-- REVISED V2.0: 反映实际实现的简化设计 -->

| 项 | 内容 |
|----|------|
| 优先级 | **Must** |
| 描述 | **Concept 循环**：答对进入下一题；答错显示解释与解析，记录薄弱点后推进到下一题（即"答错→看解析→继续"）。**Challenge 阶段**：保留完整换题重试机制（retry） |
| 输入 | 用户答案 + 原 Quiz |
| 输出 | `score` / `gaps` / `next_action` / 反馈文案 |
| 约束 | - 答对（score ≥ 80）→ `next_action=advance`，进入下一题<br>- 答错（score < 80）→ `next_action=advance`（不阻塞），显示解释 + AdaptivePlanPanel（提示"已记录薄弱点"）<br>- **不生成新题**，不改变题号；错题记入薄弱点队列，供跨概念复习（见 §9.6）<br>- 反馈文案 ≤ 50 字，鼓励性语气（"差一点！关键在于……"）<br>- 解释需同时说明"为什么对"和"为什么错"<br>- 不惩罚、不扣分、不显示失败感强的视觉元素<br>- **Challenge 阶段**（FR-05）保留完整的换题重试链路（`/api/regenerate` + `replaceCurrentQuiz()`），不受此约束 |
| 验收 | AC1: 答对直接进入下一题，无中间环节<br>AC2: 答错显示解释 + "继续下一步"按钮（非"换题重试"）<br>AC3: 薄弱点被记录到 adaptive 队列<br>AC4: 反馈文案符合鼓励性语气要求<br>AC5: Challenge 阶段答错仍可换题重试 |

### FR-05 Module Challenge（模块挑战）

| 项 | 内容 |
|----|------|
| 优先级 | **Should** |
| 描述 | 所有 Concept 完成后，出现 3-5 道跨概念综合题 |
| 输入 | Module 内全部 Concept 信息 |
| 输出 | 3-5 道 Choice / Sorting 综合题 |
| 约束 | - 题干必须**显式涉及 ≥ 2 个 Concept**（如"Embedding 与检索的关系是？"）<br>- 全部为 Choice / Sorting（不在 Challenge 阶段引入 Fill Blank，避免负担突增）<br>- 题数 ∈ [3, 5]<br>- 反馈机制：**保留完整 retry 链路**（换题重试），与 FR-04 的 Concept 循环不同 |
| 验收 | AC1: Challenge 题在所有 Concept 完成后解锁<br>AC2: 每道题题干涉及 ≥ 2 个 Concept<br>AC3: 题数 ∈ [3, 5]<br>AC4: 答错可换题重试 |

### FR-06 Module Feynman（模块费曼）

| 项 | 内容 |
|----|------|
| 优先级 | **Must** |
| 描述 | 6 步费曼任务序列：4 步选择 + 1 步短句补全 + 1 步完整输出 |
| 输入 | `Module`（含全部 Concept 与 goal） |
| 输出 | `FeynmanTask`（含 6 个 Step + Rubric） |
| 约束 | - **Step 1-4**：Choice 题（4 选项），分别对应"解释开头 / 解释方向 / 举例 / 最佳完整解释判断"<br>- **Step 5**：Fill Blank，补全一句话（≤ 30 字）<br>- **Step 6（Final）**：开放文本输出，建议字数 100-500 字<br>- Step 1-4 答错**不强制重试**（费曼脚手架应保持低焦虑），显示解释后进入下一步<br>- Step 6 评分基于 Rubric（3-5 个关键点），每点命中=满分，部分命中=半分，未提及=0 分<br>- Step 6 允许"重写一次"（最多 2 次提交）<br>- Rubric 关键点必须是 Concept 级别的核心，不是细节<br>- Step 4 的 4 个完整解释选项必须**真实不同质量**（优秀 / 良好 / 一般 / 错误），让用户内化判断标准 |
| 验收 | AC1: 费曼序列包含恰好 6 步<br>AC2: Step 1-4 为 4 选项 Choice，Step 5 为 Fill Blank，Step 6 为开放输出<br>AC3: Step 6 提交后显示 Rubric 各关键点的命中情况<br>AC4: Step 6 显示基于 Rubric 的总分（0-100）<br>AC5: Step 6 显示一份高质量示例范文<br>AC6: Step 1-4 答错不阻塞，进入下一步<br>AC7: Step 6 可重写一次<br>AC8: Step 4 的 4 选项质量明显分层 |

### FR-07 掌握度追踪（Mastery Tracking）

| 项 | 内容 |
|----|------|
| 优先级 | **Must** |
| 描述 | 运行时追踪用户在 Module 内的掌握度，基于简单答对率 |
| 输入 | 全部 `AttemptRecord` |
| 输出 | `Mastery` 对象 |
| 约束 | - MVP 不使用 IRT/BKT/DKT，仅用简单答对率<br>- `conceptMastery` = 该 Concept 内所有 Quiz 的"首次答对率"（重试不计入分子，但计入分母以反映难度）<br>- `moduleCompletion` = 已完成的 Quiz 数 / 总 Quiz 数（含费曼 Step 1-6）<br>- `feynmanScore` = Step 6 的 Rubric 总分<br>- 掌握度实时更新，每答一题刷新<br>- 数据持久化到 LocalStorage（FR-08）<br>- **蒙对标注影响**：首次答对但 `guessed===true` 的 Attempt 不计入掌握数（详见 FR-09） |
| 验收 | AC1: 每次作答后掌握度数值更新<br>AC2: conceptMastery 计算逻辑符合定义<br>AC3: Module 完成时 moduleCompletion = 100%<br>AC4: 费曼 Step 6 未提交时 feynmanScore = null，提交后更新 |

### FR-08 进度持久化（Progress Persistence）

| 项 | 内容 |
|----|------|
| 优先级 | **Should** |
| 描述 | 基于 LocalStorage 持久化用户进度，支持中断后恢复 |
| 输入 | `Module` / `Mastery` / `AttemptRecord[]` |
| 输出 | 持久化到浏览器 LocalStorage |
| 约束 | - LocalStorage key 命名：`alc:module:{id}` / `alc:mastery:{moduleId}` / `alc:attempts:{quizId}`<br>- 单 Module 数据总量 ≤ 5MB（LocalStorage 上限）<br>- 提供"清空进度重学"入口<br>- **不自动删除用户 Module；容量超限时仅提示用户导出或手动删除**（`ensureCapacity()` 退化为 no-op）<br>  <!-- REVISED V2.0: 添加"不自动删除"约束（NP-04） --><br>- 不做跨设备同步（MVP） |
| 验收 | AC1: 刷新页面后进度恢复<br>AC2: 关闭浏览器重开后进度恢复<br>AC3: "清空进度"按钮可重置 Module 到初始状态<br>AC4: LocalStorage 数据超 4.5MB 时提示用户导出或手动删除（非自动淘汰） |

### FR-09 "蒙对"自报标注（Guessed Self-Report）

<!-- NEW V2.0: NP-09 -->

| 项 | 内容 |
|----|------|
| 优先级 | **Should** |
| 描述 | 用户答对后可在反馈面板自报"蒙对的"，标记该次 Attempt 为猜测，不计入真实掌握度 |
| 输入 | `AttemptRecord`（用户点击"蒙对"按钮触发 `guessed=true`） |
| 输出 | 更新后的 `AttemptRecord.guessed: true` |
| 约束 | - 仅在 `score=100`（答对）时显示"蒙对"自报按钮<br>- 按钮样式低调（灰色、小字），不鼓励滥用<br>- 答错时不需要此按钮（答错本身就是错题）<br>- 标记后按钮变为"已标记蒙对"（不可撤销？经产品确认后可提供撤销）<br>- `computeConceptMastery` 计算时，`guessed===true` 的 slot **不计入**掌握数<br>- 输出 `masteryExcludingGuessed` 与 `mastery` 并行，UI 展示排除猜测后的真实掌握度<br>- `AnswerHistoryList` 中蒙对的题显示"（蒙）"标记 |
| 验收 | AC1: 答对后反馈面板显示"蒙对的"按钮<br>AC2: 点击后 AttemptRecord.guessed = true<br>AC3: 掌握度面板排除蒙对题后数值降低<br>AC4: 历史记录中蒙对题有对应标记 |

### FR-10 错题本 Markdown 导出（Wrong Question Book Export）

<!-- NEW V2.0: NP-11 -->

| 项 | 内容 |
|----|------|
| 优先级 | **Should** |
| 描述 | 在历史页提供"导出错题本"按钮，输出结构化 Markdown 文件 |
| 输入 | `Module` + 该 Module 的全部 `AttemptRecord[]` |
| 输出 | Markdown 文件（.md）供下载 |
| 约束 | - 排序规则：按概念分组 → 组内按错误次数降序 → 先真正错题（score<80），后蒙对题（guessed=true）<br>- 格式包含：题干 / 用户答案 / 正确答案 / 解析 / 错误次数<br>- 文件名格式：`错题本_{moduleTitle}_{date}.md`<br>- 纯函数实现（`collectWrongQuestions`），不涉及 UI 状态 |
| 验收 | AC1: 历史页有"导出错题本"按钮<br>AC2: 输出的 Markdown 包含指定格式的全部字段<br>AC3: 导出文件可正常打开阅读 |

### FR-11 重刷错题独立页面（Wrong Question Review）

<!-- NEW V2.0: NP-12 -->

| 项 | 内容 |
|----|------|
| 优先级 | **Should** |
| 描述 | 独立页面 `/learn/review/[moduleId]` 加载指定 Module 的所有错题 + 蒙对题，打乱顺序供用户重做 |
| 输入 | `moduleId`（路由参数） |
| 输出 | 重刷会话：打乱的错题队列 + 本地判分 + 正确率统计 |
| 约束 | - 从 `attempts-store` 筛选所有 `score<80` 或 `guessed=true` 的 slot<br>- 打乱顺序呈现<br>- 判分结果写入 `attempts-store`（`attemptVersion` 递增），但**不干扰主进度**<br>- `computeMastery` 忽略 `attemptVersion>0`（重刷不影响首次答对率）<br>- 完成后显示"本轮正确率"<br>- 使用独立轻量 `review-store`（非持久化），不走 `progress-store` 状态机 |
| 验收 | AC1: 题库页/历史页有进入重刷页面的入口<br>AC2: 只包含错题和蒙对题<br>AC3: 每题可作答并立即判分<br>AC4: 完成显示正确率<br>AC5: 不影响 Module 主进度 |

### FR-12 跨概念间隔重复（Cross-Concept Spaced Repetition）

<!-- NEW V2.0: NP-10 -->

| 项 | 内容 |
|----|------|
| 优先级 | **Should** |
| 描述 | 在概念切换时，将前一概念的错题（score<80 或 guessed=true）注入下一概念的队列尾部；做对的题在隔一个概念后重现一次 |
| 输入 | `ModuleStage.concept` + `AttemptRecord[]` |
| 输出 | `reviewSlots: string[]`（注入复习题 slotId 列表） |
| 约束 | - 复习题作为额外 slot **插入正常题队列之后**，不替换原有题号<br>- UI 需区分"新题 N/M"与"复习题"<br>- 复习题答对 → 不再重现；答错 → 继续携带到下一概念<br>- 复习尝试的 `attemptVersion>0`，不计入首次答对率<br>- 遵循顺序流契约（§9.5）——不改变主线路由 |
| 验收 | AC1: Concept N 答错的题在 Concept N+1 尾部出现<br>AC2: Concept N 首次答对的题在 Concept N+2 重现一次<br>AC3: 复习题标注为"复习"而非"新题"<br>AC4: 复习答对后不再出现 |

---

## 5. 详细用户流程（User Flows）

### 5.1 主流程：从导入到完成

```
[首页]
  │  （智能路由：空→导入页，未完成→继续，已完成→题库）
  ▼
[导入页] 粘贴/上传 Markdown
  │  (字数校验 200-20000)
  ▼
[编译中页] 显示阶段化进度
  │  (失败 → 错误页 → 返回导入页)
  ▼
[课程概览页] 显示 Module 标题 / 概念数 / 预计时长 / [开始学习] 按钮
  │
  ▼
[Module 导言页] "完成本模块后，你能……"
  │
  ▼
[Concept A 学习循环] ───────────────────────────┐
  │  Quiz 1 (Level 1 Choice)          (答错)    │
  │  → 反馈 → 下一题                  → 看解析  │
  │  Quiz 2 (Level 1 Choice)          → 继续    │
  │  ...                                         │
  │  Quiz N (Level 3 Fill Blank)                 │
  │  Concept A 完成 → 薄弱点/正确题注入 N+1/N+2 │
  ▼                                              │
[Concept B 学习循环] (同上 + 可能含复习题)       │
  ▼                                              │
[Concept C 学习循环] (同上)                      │
  ▼                                              │
[Module Challenge] 3-5 道综合题                  │
  ▼                                              │
[Module Feynman]                                 │
  │  Step 1: Choice (解释开头)                   │
  │  Step 2: Choice (解释方向)                   │
  │  Step 3: Choice (举例)                      │
  │  Step 4: Choice (最佳解释判断)               │
  │  Step 5: Fill Blank (补全一句)               │
  │  Step 6: 完整输出 → Rubric 评分              │
  │  → 显示 gaps + 示例范文                      │
  ▼                                              │
[完成页] 祝贺 + 掌握度总结 + [重学]             │
                                                 │
           (Concept 答错) ───────────────────────┘
           → 显示解释 → 记录薄弱点 → 继续下一题

           (Challenge 答错)
           → 显示解释 → 可选"换一道题"重试
```
<!-- REVISED V2.0: Concept 答错分支改为"看解析→继续"，Challenge 保留换题重试 -->

### 5.2 单题交互流程（细化）

```
展示 Quiz（题干 / 选项 / 进度 / 所属 Concept）
  │
  ▼
用户作答（点击/拖拽/输入）
  │
  ▼
[本地判分] → evaluateAnswer()  ←── 非 LLM 调用
  │
  ├─ score ≥ 80 ───→ 显示肯定反馈（≤ 50 字）
  │                   │   └─ 可自报"蒙对"
  │                   ▼
  │                 更新 Mastery
  │                   │
  │                   ▼
  │                 进入下一题（next_action=advance）
  │
  └─ score < 80 ───→ 显示解释（为什么对/为什么错）
                      │   + AdaptivePlanPanel
                      ▼
                    更新 Mastery（计入分母，不计入分子）
                      │
                      ▼
                    薄弱点记录到 adaptive 队列
                      │
                      ▼
                    "继续下一步" → advance()
                      │
                      └─ (Challenge 阶段) → 可选"换一道题"
```
<!-- REVISED V2.0: 移除 Feedback Agent LLM 判分路径，替换为本地 evaluateAnswer()；移除"生成同类型新题"和"连续 3 次强制 advance"分支 -->

### 5.3 编译流程（离线）

```
[用户点击"开始编译"]
  │
  ▼
Import Agent (清洗/标准化)
  │  → 显示进度 25%
  ▼
Chunk Agent (语义切分)
  │  → 显示进度 40%
  ▼
Concept Agent (提取 2-5 个概念)
  │  → 显示进度 55%
  ▼
Module Agent (聚类为单 Module，生成 intro/goal)
  │  → 显示进度 65%
  ▼
Mission Agent (为每个 Concept 编排 Quiz Series 占位符)
  │
  ▼
Quiz Agent ×N (按 concept 批量生成 8-15 题/Concept，非逐题)
  │  → 显示进度 80%
  ▼
Feynman Agent (生成 6 步费曼 + Rubric)
  │  → 显示进度 100%
  ▼
[跳转课程概览页]
```
<!-- REVISED V2.0: Quiz Agent 标注为按 concept 批量生成（quiz-batch） -->

---

## 6. 非功能需求（Non-Functional Requirements）

### 6.1 性能（NFR-P）

| 编号 | 指标 | 目标 |
|------|------|------|
| NFR-P1 | 编译总耗时（含全部 Agent） | P50 ≤ 30s, P95 ≤ 60s |
| NFR-P2 | 单题判分响应 | **即时（<10ms）**（本地 `evaluateAnswer()`，非 LLM 调用） |
| NFR-P3 | 答错后新题生成耗时（Challenge 阶段） | P95 ≤ 3s |
| NFR-P4 | 页面首屏加载（FCP） | ≤ 1.5s |
| NFR-P5 | 单题交互响应（点击→反馈显示） | ≤ 100ms（不含 AI 评估） |
| NFR-P6 | LocalStorage 写入 | ≤ 50ms |

<!-- REVISED V2.0: NFR-P2 从 P95 ≤ 1.5s 更新为即时（<10ms），反映本地判分改造 -->

### 6.2 可用性（NFR-U）

| 编号 | 指标 | 目标 |
|------|------|------|
| NFR-U1 | 浏览器兼容 | Chrome/Edge ≥ 100, Firefox ≥ 100, Safari ≥ 15, 移动端 iOS Safari 15+/Android Chrome 100+ |
| NFR-U2 | 响应式 | 桌面（≥ 1024px）/ 平板（768-1023px）/ 手机（< 768px）三档断点 |
| NFR-U3 | 离线可用 | 编译完成后，学习循环可在纯离线状态进行（判分本地化，仅 FillBlank 语义兜底和 Feynman 评分需联网） |
| NFR-U4 | 可访问性 | 关键交互支持键盘导航；颜色对比度 ≥ AA（WCAG 2.1） |

### 6.3 可靠性（NFR-R）

| 编号 | 指标 | 目标 |
|------|------|------|
| NFR-R1 | 编译成功率 | ≥ 95%（对合法 Markdown 输入） |
| NFR-R2 | AI Agent 调用失败处理 | 单 Agent 失败自动重试 4 次（MAX_ATTEMPTS=5）；仍失败则显示明确错误，不崩溃 |
| NFR-R3 | 进度丢失防护 | 每次作答后立即写 LocalStorage；崩溃后可从最近一题恢复 |
| NFR-R4 | JSON Schema 校验 | 所有 Agent 输出强制 JSON Schema 校验（`safeParseJSON + schema.safeParse`），失败则重试 |

### 6.4 成本（NFR-C）

| 编号 | 指标 | 目标 |
|------|------|------|
| NFR-C1 | 单次编译 LLM 调用成本 | ≤ $0.20（按 DeepSeek 或同等模型估算） |
| NFR-C2 | 单次完整学习（含编译+全 Module）总成本 | ≤ $0.30（本地判分后运行时成本趋近于零） |
| NFR-C3 | 部署成本 | 纯前端静态部署（Vercel 免费档），零后端 |

### 6.5 安全与隐私（NFR-S）

| 编号 | 指标 | 目标 |
|------|------|------|
| NFR-S1 | 用户数据存储 | 全部 LocalStorage，不上传服务器（除 LLM API 调用） |
| NFR-S2 | LLM API Key 管理 | 用户自带 Key（DeepSeek / GLM / SenseNova / OpenAI 兼容），不存储在服务端 |
| NFR-S3 | 用户输入内容 | 仅用于本次编译，不做训练、不做日志 |

---

## 7. AI Agent 规格（输入/输出契约）

本节为各 Agent 的接口契约。Prompt 工程文档另立，本 PRD 只定义 IO 与约束。

### 7.1 Import Agent

| 项 | 内容 |
|----|------|
| 输入 | 原始 Markdown 字符串 |
| 输出 | 标准化文本（统一标题层级、去除冗余 HTML、合并多余空行） |
| 约束 | 不修改语义内容；保留代码块；保留列表结构 |

### 7.2 Chunk Agent

| 项 | 内容 |
|----|------|
| 输入 | 标准化文本 |
| 输出 | `Chunk[]`，每个 Chunk = `{ id, text, heading }` |
| 约束 | 单 Chunk 长度 200-800 字符；按 H2/H3 标题切分优先，其次按段落 |

### 7.3 Concept Agent

| 项 | 内容 |
|----|------|
| 输入 | `Chunk[]` |
| 输出 | `Concept[]`，每个 Concept = `{ id, name, definition, type, keyPoints[], parentChunkId }` |
| 约束 | - 总 Concept 数 ∈ [2, 5]<br>- 单 Chunk 提取 ≤ 2 个 Concept<br>- `definition` ≤ 30 字<br>- `keyPoints` 每条 ≤ 15 字，共 2-4 条<br>- `type` ∈ `fact` / `procedure` / `theory` |
| 输出 JSON Schema | 见规格书 [§7.2 Concept Agent Prompt](../v0.1.0/Product-Specification.md#concept-agent-prompt) |

### 7.4 Module Agent

| 项 | 内容 |
|----|------|
| 输入 | `Concept[]` |
| 输出 | `Module`（不含 QuizSeries 与 FeynmanTask，由后续 Agent 填充） |
| 约束 | - `title`：≤ 20 字，概括核心主题<br>- `intro`：≤ 40 字，"完成本模块后，你能……"句式<br>- `goal`：≤ 30 字，费曼目标（如"解释 X 是什么、为什么需要它"）<br>- `concepts` 按"理解顺序"线性排列（基础概念在前） |

### 7.5 Mission Agent

| 项 | 内容 |
|----|------|
| 输入 | `Module`（含 concepts） |
| 输出 | 为每个 Concept 生成 `QuizSeries` 的**占位符**（specify ladderLevel / interactionType / expressionLevel，不生成具体题目） |
| 约束 | - 每个 Concept 的占位符数 ∈ [8, 15]<br>- 层级分布：Recognition 30-40%, Discrimination 30-40%, Application 20-30%（MVP 不含 Association）<br>- 表达层级分布：Level 1（Choice）≥ 60%，Level 2（Sorting）≤ 20%，Level 3（Fill Blank）≤ 20%<br>- **前 2 个占位符必须**是 `{ladderLevel: 1, interactionType: choice, expressionLevel: 1}` |

### 7.6 Quiz Agent（quiz-batch 架构）

<!-- REVISED V2.0: 更新为 quiz-batch 架构描述 -->
| 项 | 内容 |
|----|------|
| 输入 | **全部 Concept 的占位符** + 对应 Concept 信息（非逐个执行，而是按 Concept 批量调用） |
| 输出 | 每个 Concept 的完整 `Quiz[]` 数组：`[{ id, conceptId, ladderLevel, expressionLevel, interactionType, stem, options[], answer, explanation, distractors[] }]` |
| 约束 | - **每 Concept 一次 LLM 调用**生成全部 8-15 道 Quiz（非逐题并行）<br>- `stem` 清晰，用户无需思考"题目要我做什么"<br>- Choice 题：4 选项，1 正确 + 3 干扰<br>- 干扰项必须 **plausible but wrong**（来自常见误解或相近概念），不允许荒谬选项<br>- 正确答案不能通过常识排除法猜出<br>- `explanation` 同时说明"为什么对"和"为什么错"<br>- `distractors` 字段列出干扰项特征<br>- 输出 JSON 符合规格书 [§7.2 Quiz Agent Prompt](../v0.1.0/Product-Specification.md#quiz-agent-prompt) |
| 容错 | 若批量生成部分 quiz 校验失败，使用 `salvageQuizBatch()` 提取合格项，不整体废弃 |

### 7.7 Feynman Agent

| 项 | 内容 |
|----|------|
| 输入 | `Module`（含全部 Concept 与 goal） |
| 输出 | `FeynmanTask`：`{ steps[6], finalPrompt, rubric[] }` |
| 约束 | - Step 1-4：Choice，4 选项<br>- Step 1 题干："如果让你解释 {goal}，第一句话应该是什么？"<br>- Step 2 题干："接下来应该解释什么方向？"<br>- Step 3 题干："如果对方没懂，你会举什么例子？"<br>- Step 4 题干："下面四个完整解释，哪一个最好？" — 4 选项质量分层（优秀/良好/一般/错误）<br>- Step 5：Fill Blank，"请补充一句话：____"，空白处需填 ≤ 30 字<br>- `finalPrompt`：基于 `module.goal` 的开放任务<br>- `rubric`：3-5 个关键点，每点 ≤ 20 字，必须是 Concept 核心而非细节<br>- 输出 JSON 符合规格书 [§7.2 Feynman Agent Prompt](../v0.1.0/Product-Specification.md#feynman-agent-prompt) |

### 7.8 Feedback Agent（运行时 — 遗产兼容）

<!-- REVISED V2.0: 标注为 legacy compatibility only -->
| 项 | 内容 |
|----|------|
| 状态 | **⚠️ Legacy — 仅用于 FillBlank 语义兜底和旧版兼容** |
| 输入 | `Quiz` + `userAnswer` |
| 输出 | `{ score, gaps[], next_action, feedback_text }` |
| 约束 | - 不再作为常规判分调用；Concept/Challenge 循环使用 `evaluateAnswer()` 本地判分（见 §7.10）<br>- 保留作为 FillBlank 标准化匹配失败后的语义兜底<br>- `feedback.md` prompt 已降级 |
| 性能 | P95 响应 ≤ 1.5s（仅语义兜底时调用） |

### 7.9 Feynman Evaluator（运行时，Step 6 专用）

| 项 | 内容 |
|----|------|
| 输入 | `finalPrompt` + `rubric[]` + 用户完整输出文本 |
| 输出 | `{ score, rubricResults[], gaps[], sampleAnswer }` |
| 约束 | - `score` = 各 rubric 点命中得分之和（每点满分=100/rubric长度，部分命中=半分）<br>- `rubricResults`：`[{ point, hit: full|partial|none, comment }]`<br>- `gaps`：`hit=none` 的 rubric 点列表<br>- `sampleAnswer`：AI 生成的高质量范文（150-300 字）<br>- 评分相对宽容：只要用户表达触及关键点的核心含义即视为 hit，不要求字面一致 |

### 7.10 Local Evaluator（本地判分）

<!-- NEW V2.0: NP-02 本地判分架构 -->
| 项 | 内容 |
|----|------|
| 输入 | `Quiz` + `userAnswer` |
| 输出 | `{ score, gaps[], next_action }`（本地计算，非 LLM 调用） |
| 约束 | - **Choice**：`userAnswer === quiz.answer` 精确比较；score ∈ {0, 100}<br>- **Sorting**：`userAnswer.split(',')` 逐位与 `quiz.answer` 比较；全对=100，否则=0<br>- **Fill Blank**：标准化后精确匹配（trim + toLowerCase + 全角转半角 + 去标点）；通过=100，否则尝试语义相似度 ≥ 0.85（LLM 兜底）<br>- `next_action`：score ≥ 80 → `advance`，< 80 → `advance`（始终推进，不阻塞）<br>- **性能**：即时（<10ms），无网络调用 |
| 实现 | `runtime/evaluate-answer.ts` |

---

## 8. 数据模型（Data Model）

继承规格书 [§6 数据结构](../v0.1.0/Product-Specification.md#第六章-数据结构)。MVP 实现以下 TypeScript 接口（可直接用于前端类型定义）：

```typescript
// ============ 编译产物（持久化） ============

interface KnowledgeSource {
  id: string
  type: 'markdown'
  content: string
  createdAt: number
}

interface Module {
  id: string  // 本地分配的唯一 ID（module-${nanoid()}），非 LLM 输出值
  // REVISED V2.0: 注释更新——Module.id 由 assignLocalModuleIdentity() 分配
  sourceId: string
  title: string
  intro: string
  goal: string
  concepts: Concept[]
  feynmanTask: FeynmanTask
  order: number  // MVP 固定为 1
}

interface Concept {
  id: string
  moduleId: string
  name: string
  definition: string
  type: 'fact' | 'procedure' | 'theory'
  keyPoints: string[]
  quizSeries: QuizSeries
  order: number
}

interface QuizSeries {
  conceptId: string
  quizzes: Quiz[]
}

interface Quiz {
  id: string
  conceptId: string
  ladderLevel: 1 | 2 | 3  // MVP: 1=Recognition, 2=Discrimination, 3=Application
  expressionLevel: 1 | 2 | 3  // 1=Choice, 2=Sorting, 3=Fill Blank
  interactionType: 'choice' | 'sorting' | 'fill_blank'
  stem: string
  options?: string[]
  answer: string
  explanation: string
  distractors: string[]
}

interface FeynmanTask {
  moduleId: string
  steps: FeynmanStep[]  // 恰好 6 个
  finalPrompt: string
  rubric: string[]
}

interface FeynmanStep {
  order: number  // 1-6
  type: 'choice' | 'fill_blank'
  stem: string
  options?: string[]
  answer: string
  explanation: string
}

// ============ 运行时数据（LocalStorage） ============

interface AttemptRecord {
  id: string
  quizId: string
  userAnswer: string
  score: number
  gaps: string[]
  nextAction: 'advance' | 'retry'
  timestamp: number
  guessed?: boolean  // 用户自报"蒙对"，影响掌握度计算（NP-09）
  // NEW V2.0: guessed 字段
}

interface FeynmanAttempt {
  moduleId: string
  stepResults: { stepOrder: number; score: number }[]
  finalOutput?: string
  finalScore?: number
  finalGaps?: string[]
  submittedAt: number
}

interface Mastery {
  moduleId: string
  moduleCompletion: number  // 0-100
  conceptMastery: { conceptId: string; mastery: number }[]
  feynmanCompleted: boolean
  feynmanScore?: number
}

interface ProgressState {
  moduleId: string
  currentStage: 'concept' | 'challenge' | 'feynman' | 'done'
  currentConceptIndex: number
  currentQuizIndex: number
  updatedAt: number
}

interface ModuleStage {
  kind: 'concept' | 'challenge' | 'feynman' | 'done'
  // concept 类型扩展：
  conceptIndex?: number
  quizIndex?: number
  reviewSlots?: string[]  // 从先前概念注入的复习题 slotId 列表（NP-10）
  // NEW V2.0: reviewSlots 字段
}
```

**LocalStorage Key 命名规范**：

| Key | Value |
|-----|-------|
| `alc:source:{sourceId}` | `KnowledgeSource` |
| `alc:module:{moduleId}` | `Module` |
| `alc:mastery:{moduleId}` | `Mastery` |
| `alc:attempts:{quizId}` | `AttemptRecord[]` |
| `alc:feynman:{moduleId}` | `FeynmanAttempt` |
| `alc:progress:{moduleId}` | `ProgressState` |

### 8.1 CompiledModulePackage（Module 导入导出格式）

<!-- NEW V2.0: NP-07 -->
定义 `.alc-module.json` V1 格式作为 Module 导出的标准交换格式：

```typescript
interface CompiledModulePackage {
  version: 1
  exportedAt: number
  source: KnowledgeSource
  module: Module
  qualityReport?: CompileQualityReport
  provider?: string
  model?: string
}
```

**安全约束**：
- `parseModulePackage()` 在解析阶段检测 JSON 中是否包含 `"apiKey"` 字符串
- 若包含则**拒绝导入**，并提示用户导出的 package 不含 API Key
- 此约束防止通过导入功能注入恶意或意外泄露的 Key

---

## 9. 交互与 UI 需求（UI/UX）

本节定义关键交互规则。详细视觉设计另立设计稿。

### 9.1 全局交互原则

1. **永远有"下一步"**：任何时刻用户都能看到清晰的下一步操作入口
2. **不惩罚**：答错不显示醒目红色叉号、不播放错误音效、不显示"失败"字样
3. **进度可见**：顶部始终显示当前 Concept / Challenge / Feynman 阶段与进度条
4. **最少认知负荷**：题干字体大于选项，关键动作按钮（"下一题"）永远在视线焦点

### 9.2 关键页面

| 页面 | 关键元素 |
|------|---------|
| 首页 | 标语 + 智能路由"开始学习"/"继续学习"/"前往题库"按钮 + 字数计数器 |
| 编译中页 | 阶段化进度条（4-5 个阶段）+ 预计剩余时间 |
| 课程概览页 | Module 标题 / intro / 概念列表（仅名称）/ 预计时长 / [开始学习] |
| Module 导言页 | 大字号显示 intro + goal + [进入第一个 Concept] |
| 学习页（核心） | 顶部进度条 + 当前 Concept 名 + Quiz 题干 + 选项 + 底部 [提交] |
| 反馈态 | 题干保留 + 选项标注对错（轻量色彩，非鲜红）+ 解释文案 + 答对时"蒙对"按钮 + [继续] |
| Module Challenge 页 | 视觉上与 Concept 学习页区分（如换主色调），强调"综合挑战"感；答错可"换一道题" |
| Feynman 步骤页 | 步骤指示器（1/6 ... 6/6）+ 与 Quiz 页类似交互 |
| Feynman 最终输出页 | 大文本输入框 + 字数提示 + [提交]；提交后显示 Rubric 评分卡 + gaps + 示例范文 |
| 完成页 | 祝贺文案 + Mastery 卡片（各 Concept 掌握度）+ [重新学习] + 5 星评分组件 |
| 错题重刷页 | 打乱顺序的错题队列 + QuizRenderer + 判分 + 结束时"本轮正确率"统计 |

### 9.3 关键交互动效

- 答对：选项轻量绿色高亮 + 短暂 (300ms) 的肯定微动效（如轻微缩放），不夸张
- 答错：错误选项轻量橙色（非红色）高亮 + 正确选项绿色高亮，无震动、无闪烁
- 阶段切换：Concept → Challenge → Feynman 之间用过渡动效强化"进展感"
- 费曼 Step 6 完成：成就感动效（如掌握度环形进度条满格动画）

### 9.4 移动端适配

- Choice 题选项改为全宽卡片，便于手指点击
- Sorting 题移动端用上下箭头替代拖拽
- Fill Blank 输入框自动唤起键盘
- 进度条移至顶部固定

### 9.5 顺序学习流契约（Sequential Learning Flow Contract）

<!-- NEW V2.0: NP-06 -->
**决策**：主学习流必须**顺序推进**（`progress-store.advance()`）。自适应重排只能作为**建议提示**，不能接管题号路由。

**约束**：
- `progress-store` 的 `advance()` 是唯一驱动学习流前进的机制
- `AdaptivePlanPanel` 可以展示"建议先复习 X 概念"等提示，但不改变 `currentConceptIndex` / `currentQuizIndex`
- UI 展示的题号（"第 3/8 题"）必须与实际题目一致
- Challenge 阶段的换题重试（`replaceCurrentQuiz()`）不改变题序计数

**理由**：自适应重排曾导致题号与实际题目脱节（M7.6 §3.1），违反 P4 原则（不让用户思考"如何回答"）。

### 9.6 跨概念间隔重复算法（Cross-Concept Spaced Repetition）

<!-- NEW V2.0: NP-10 -->
**机制**：

```
Concept N 结束（advance 到 conceptIndex+1）
  → 收集 Concept N 中 score<80 或 guessed=true 的 slot
  → 注入 Concept N+1 题队列尾部（作为额外复习 slot）
  → 用户在 Concept N+1 中先做新题，后做复习题
  → Concept N+1 结束时同样收集错题注入 N+2

同时：
  → Concept N 中首次做对的题（score≥80 且 guessed≠true）
  → 在 Concept N+2 队列中重现一次（确认掌握）
  → N+2 中再次答对则不再重现；答错则进入错题循环
```

**约束**：
- 遵循 §9.5 顺序流契约——复习题作为额外 slot **插入正常题队列之后**，不替换原有题号
- `computeMastery` 已忽略 `attemptVersion>0`，复习尝试不干扰首次答对率指标
- `quizIndex` 展示需区分"新题 N/M"与"复习题"，避免用户困惑

**冲突说明**：本机制与 FR-04 简化（Concept 内不换题）**共存无冲突**。FR-04 管"概念内不换题"，§9.6 管"跨概念旧题重现"。两者在不同维度运作。

---

## 10. 设计决策与权衡（Design Decisions）

记录 MVP 阶段的关键决策与理由，便于未来回顾。

### 10.1 为何 MVP 只支持单 Module

- **理由**：多 Module 引入"解锁顺序"、"跨 Module 综合"、"课程级 Mastery"等复杂度
- **代价**：用户一次学习只能内化一个主题
- **解耦点**：数据模型已为多 Module 预留（`Module.order` 字段），V2 仅需 UI 与编译逻辑扩展

### 10.2 为何 MVP 的 Quiz Ladder 不含 Association（层级 3）

- **规格书定义 4 层**：Recognition / Discrimination / **Association** / Application
- **MVP 决策**：合并 Association 到 Discrimination 或 Application，**只保留 3 层**
- **理由**：Association（"如果没有 X 会怎样"）与 Application（"哪个场景适合 X"）在用户感知上差异较小，合并可降低 Mission Agent 的编排复杂度，且仍能覆盖"识别→辨别→应用"的认知曲线
- **代价**：Concept 内 Quiz 多样性略降
- **V2 计划**：恢复 4 层，并引入更精细的层级可视化

### 10.3 为何 MVP 不做 Adaptive Learning

- **规格书原则**：用户应一直成功（70-85% 正确率）
- **MVP 策略**：用**静态编排**（Mission Agent 预先生成层级递进的 Quiz）+ **答错→看解析→继续**（简化自答错重试）近似实现，而非实时自适应
- **理由**：Adaptive 需要 IRT/BKT 模型与大量用户数据，MVP 阶段不具可行性
- **风险**：若编译产物难度偏高，可能突破 85% 上限；需通过 Prompt 调优与用户测试校准

### 10.4 为何不在 UI 显式展示 Quiz Ladder 层级

- **规格书 §2.4 强调**：用户应"不知不觉"完成认知层级跃迁
- **决策**：UI **不显示**当前 Quiz 属于 Recognition/Discrimination/Application
- **例外**：US-12 [S] 作为 Should 级别，可在后续版本通过 A/B 测试验证"显示层级是否提升还是降低动机"

### 10.5 Fill Blank 的答案匹配策略

- **决策**：标准化后精确匹配 + 语义相似度 ≥ 0.85 双策略，任一通过即判正确
- **标准化**：trim + toLowerCase + 全角转半角 + 去标点
- **语义相似度**：通过 LLM embedding 或调用 Feedback Agent 判断
- **理由**：纯精确匹配会误判同义词；纯语义匹配会放过明显错误

### 10.6 三层验证架构（Three-Layer Validation）

<!-- NEW V2.0: NP-03 -->
编译产物验证分三层，不应将教学建议当作 Schema 硬约束：

| 层 | 职责 | 示例 |
|----|------|------|
| **Schema 层** | 只保证可运行（字段存在、类型正确、不崩 UI） | `answer` 存在于 `options`；`explanation` 字段非空 |
| **Mapper 层** | 可无损修复的结构问题 | `answer` 未在 `options[0]` → 自动移动到 `options[0]`；缺省 `explanation` → 生成兜底文案 |
| **Quality 层** | 生成质量报告，不阻断编译 | expression 曲线分析、distractor 质量评估、跨概念覆盖检查 |

**决策理由**：
- Schema 层相当于类型安全护栏，失败的编译直接阻断
- Mapper 层是"自愈"层，处理 LLM 输出中可自动修正的格式问题
- Quality 层是纯信息层，报告给开发者/prompt 工程师改进，但不影响用户使用

---

## 11. 成功指标（Success Metrics）

### 11.1 北极星指标（MVP 阶段）

> **Module 完成率**：开始学习的用户中，完成全部 Concept + Challenge + Feynman Step 6 提交的比例。
>
> **目标**：≥ 40%

### 11.2 核心指标（继承规格书 §5.2）

| 指标 | 目标 | 衡量方式 |
|------|------|---------|
| Module 完成率 | ≥ 40% | 完成用户数 / 开始学习用户数 |
| Feynman Final 提交率 | ≥ 60%（已完成前置步骤的用户中） | Step 6 提交数 / 到达 Step 6 的用户数 |
| 平均答题正确率 | 70-85% | 全部 Attempt 的 score 均值 |
| 用户主观掌握感评分 | ≥ 4/5 | 完成页弹出 5 分制评分 |
| 次日回访率 | ≥ 25% | 完成用户次日回访比例 |

### 11.3 过程指标（用于诊断）

| 指标 | 关注点 |
|------|--------|
| 单 Concept 平均耗时 | 过长（> 5 分钟）说明 Quiz 难度偏高 |
| 单 Quiz 平均尝试次数 | > 1.5 次说明题目迷惑性过强或难度过高 |
| Feynman Step 1-4 答错率 | 应 < 30%，否则脚手架失效 |
| 编译失败率 | 应 < 5% |
| 用户首次答题放弃率 | 应 < 20%（前 2 题 Level 1 应保证低放弃） |
| 蒙对率（新增） | 观察基线，`guessed=true / score=100` 比值 |
| 错题本使用率（新增） | 错题本导出次数 / Module 完成数 |
| 重刷功能使用率（新增） | 重刷页面访问 / Module 完成数 |

### 11.4 埋点事件清单（最小集）

```
page_view: { page: 'home' | 'import' | 'compiling' | 'overview' | 'learn' | 'feynman' | 'done' | 'review' }
compile_start: { sourceId, contentLength }
compile_complete: { sourceId, moduleConceptCount, durationMs }
compile_failed: { sourceId, stage, error }
quiz_attempt: { quizId, ladderLevel, expressionLevel, score, attemptCount, durationMs, guessed }
quiz_advance: { quizId, nextAction }
feynman_step_complete: { moduleId, stepOrder, score }
feynman_final_submit: { moduleId, finalScore, rubricHits }
mastery_update: { moduleId, moduleCompletion, conceptMasteryAvg }
module_complete: { moduleId, totalDurationMs, masteryScore }
rating_submitted: { moduleId, score: 1-5 }
review_session_start: { moduleId, wrongQuestionCount }
wrong_book_exported: { moduleId, wrongCount, guessedCount }
```

---

## 12. 范围边界与排除项（Out of Scope）

继承规格书 [§5.1 不包含](../v0.1.0/Product-Specification.md#不包含)。MVP **明确不做**：

| 排除项 | 推迟版本 | 理由 |
|--------|---------|------|
| PDF / 网页 / 视频输入 | V3 | Pipeline 复杂度，MVP 聚焦 Markdown |
| 多 Module 课程 | V2 | MVP 验证单 Module 闭环 |
| Concept Graph / 依赖图 | V5 | 维护成本高，MVP 不需要 |
| Adaptive Learning | V4 | 需要用户画像与复杂模型 |
| Spaced Repetition（全量） | V4 | 需要长期记忆模型；跨概念间隔重复（§9.6）作为轻量例外已在 V2.0 中 |
| Today's Mission | V2 | 多邻国式体验，MVP 先验证单次闭环 |
| 用户账号 / 云端同步 | V2 | MVP 纯前端 LocalStorage |
| 社交 / 分享 / 排行榜 | V6 | 非核心 |
| 付费 / 订阅 | V2+ | 商业化不在 MVP 验证范围 |

### 12.X 全局导航组件规范（Global Navigation Component）

<!-- NEW V2.0: NP-13 -->
**组件名**：`GlobalNav`

**位置**：`/learn/layout.tsx`（覆盖所有 `/learn/*` 页面）；首页 `/` 和 `/settings` 使用精简版

**导航项**：
| 项 | 链接 | 所有 / 精简 |
|----|------|-------------|
| 首页 | `/` | 两者 |
| 我的题库 | `/learn/library` | 完整 |
| 导入新内容 | `/learn/import` | 完整 |
| 设置 | `/settings` | 两者 |

**行为规范**：
- 当前页面高亮
- 完整版（`/learn/*`）不含 stage badge 和 ModuleSwitcher（这些仅在学习页内部展示）
- 复用现有 `.alc-nav-top` 设计 token，不新增样式

**理由**：消除 8 个页面各自手写 `<header>` 的重复，确保导航体验一致。

---

## 13. 风险与依赖（Risks & Dependencies）

### 13.1 产品风险

| 风险 | 等级 | 缓解措施 |
|------|------|---------|
| 编译产物难度失控，正确率突破 85% 上限 | 高 | Prompt 调优 + 用户测试 + Mission Agent 层级分布约束（FR-02） |
| Feynman Step 6 提交率低于 60% | 高 | Step 1-5 脚手架充分铺垫；Step 6 允许重写；明确字数下限 100 字（非高门槛） |
| 用户感知"只是做题"，未感知表达自由度提升 | 中 | UI 在 Feynman 阶段强化"你正在自主表达"的感知；完成页展示"你从选择题走到了完整解释"的对比 |
| Fill Blank 答案匹配误判率高 | 中 | 双策略匹配（§10.5）；语义兜底；缓存已就位 |
| 单次编译成本超 $0.30 | 中 | 选择低成本模型（DeepSeek）；quiz-batch 批量生成；并行 Quiz Agent 调用 |
| LLM 供应商高负载导致编译耗时长 | 低 | 外部因素；代码层已有 chunked 并行（并发度 3）兜底 |

### 13.2 技术依赖

| 依赖 | 说明 |
|------|------|
| LLM API | DeepSeek / GLM / SenseNova / OpenAI 兼容，用户自带 Key |
| Next.js + React | 前端框架 |
| Vercel | 静态部署 |
| 浏览器 LocalStorage | 进度持久化（无后端依赖） |

### 13.3 设计依赖

| 依赖 | 说明 |
|------|------|
| 视觉设计稿 | 需基于 §9 交互需求产出高保真稿 |
| Prompt 工程文档 | 需基于 §7 Agent 契约产出可迭代 Prompt |

---

## 14. 里程碑与发布计划（Milestones）

> 时间为相对周次（W），非绝对日期。

### 14.1 开发里程碑

| 里程碑 | 周次 | 交付物 | 验收 |
|--------|------|--------|------|
| M0: PRD 评审通过 | W0 | 本文档定稿 | 评审签字 |
| M1: 技术方案 + UI 高保真 | W1-2 | 技术架构文档 / 数据模型实现 / UI 设计稿 | 评审通过 |
| M2: Prompt 工程闭环 | W2-3 | 7 个 Agent 的 Prompt + JSON Schema 校验 | 单 Agent 单测通过 |
| M3: Knowledge Compiler 闭环 | W3-5 | FR-01 + FR-02 可用 | 输入 Markdown → 输出合法 Module JSON |
| M4: 学习循环闭环 | W5-7 | FR-03 + FR-04 + FR-07 可用 | 走完 Concept A-C 全程 |
| M5: Feynman 闭环 | W7-8 | FR-06 可用 | 走完 6 步费曼 |
| M6: Module Challenge + 完成页 | W8 | FR-05 + 完成页 | 全流程串通 |
| M7: 内测 + 优化 | W9 | 20 人内测 | 核心指标达基线 60% |
| M8: 公测发布 | W10 | 上线 Vercel | 北极星指标监测 |

### 14.2 上线前发布路线图（Phase 1-5）

<!-- NEW V2.0: 补充上线前 Phase 1-5 路线图，来源 §8 PRD-Report -->

**Phase 1：可观测性 + 基础上线准备（1 周）**
| 工作项 | 交付物 |
|--------|--------|
| 埋点系统 | 10 个核心事件 + LocalStorage 批量上报 |
| 完成页评分组件 | 5 星评分 + LocalStorage 持久化 |
| Vercel 部署 | 生产环境 + 环境变量配置 + 域名 |
| Error Boundary | 全局错误兜底 + 友好错误页 |

**Phase 2：产品体验优化（2-3 周）**
| 子阶段 | 工作项 | 优先级 |
|--------|--------|--------|
| 2a 快速优化（~1 周） | 字体平衡 / 导航栏模块化 / 首页智能路由 / 蒙对标注 | 高 |
| 2b 学习工具（~1 周） | 错题本 Markdown 导出 / 重刷错题页面 | 中 |
| 2c 间隔重复（~1 周） | 跨概念错题重温系统 | 中 |

**Phase 3：内测验证（1-2 周）**
- 招募 20 名目标用户（P1 + P2）
- 准备 3 份测试 Markdown（RAG / React Fiber / 分布式系统）
- 核心指标达基线 60%（Module 完成率 ≥ 24%，Feynman 提交率 ≥ 36%，平均正确率 ≥ 60%）

**Phase 4：修复 + 打磨（1 周）**
- 内测 bug 修复
- 移动端响应式修复
- UI 打磨 + Prompt 调优

**Phase 5：公测发布（M8）**
- Vercel 生产环境最终验证
- 北极星指标监测面板
- 产品文档 / 使用指南公开

### 14.3 首页智能路由规范

<!-- NEW V2.0: NP-14 -->
首页"开始学习"按钮根据题库状态智能路由：

```
点击"开始学习"
  → listStoredModules(storage)
  → 空列表 → /learn/import（当前行为）
  → 非空且最近 Module 未完成 → /learn/module/{最近id}（继续学习）
  → 非空且最近 Module 已完成 → /learn/library（选择新 Module 或重新学习）
```

按钮文案动态变化：无题库 → "开始学习" / 有未完成 → "继续学习" / 全完成 → "前往题库"

**理由**：消除回访用户每次都要手动找题库的摩擦（NP-14）。

---

## 15. 开放问题（Open Questions）

需在 M1 前澄清的问题：

1. **LLM 提供商默认值**：MVP 是否默认使用某一特定 LLM（如 DeepSeek）？还是允许用户三选一？（建议：默认 DeepSeek，提供 GLM / SenseNova / OpenAI 兼容选项）
   1. 供应商自带 DeepSeek / GLMCodingPlan / SenseNova

2. **Markdown 字数上限**：20000 字符是否足够？是否需要支持长文档分批编译？（建议：MVP 固定 20000，超长提示用户分段）
   1. 按建议

3. **Feynman Step 6 最低字数**：是否设硬性下限？（建议：100 字，低于此提示"再多写一些以获得准确评分"，不强制阻断）
   1. 按建议

4. **是否支持"跳过 Concept"**：用户能否跳过当前 Concept 直接进入下一个？（建议：MVP 不允许跳过，强制走完全程以保证 Feynman 铺垫；V2 加入"已掌握跳过"）
   1. 按建议

5. **多语言支持**：MVP 是否支持中英文混合的 Markdown？（建议：支持，Prompt 设计时明确"输出语言跟随输入语言"）
   1. 按建议

6. **"蒙对"标注是否可撤销**：用户标记"蒙对"后能否取消？（建议：提供一次撤销机会，减少误操作焦虑）
   1. 待产品确认

7. **复习题标记方式**：跨概念复习题在 UI 中如何标记？（建议：在题号旁显示浅色"复习"徽标，与"新题"区分）
   1. 按建议


---

## 16. 附录

### 16.1 与规格书的映射关系

| PRD 章节 | 对应规格书章节 |
|---------|--------------|
| §1 背景与目标 | §1.1, §1.2, §5.1 |
| §2 目标用户 | （规格书未明确，PRD 推导） |
| §3 用户故事 | §4 学习流程 |
| §4 功能需求 | §2 Learning Engine, §3 AI Agent, §5 MVP |
| §5 用户流程 | §4 Learning Flow |
| §6 非功能需求 | §5.3 技术栈建议 |
| §7 AI Agent 规格 | §3 Agent Architecture, §7 Prompt 设计 |
| §8 数据模型 | §6 数据结构 |
| §9 交互与 UI | （规格书未细化，PRD 定义） |
| §10 设计决策 | §2.1-2.5, §5 |
| §11 成功指标 | §5.2 |
| §12 排除项 | §5.1 不包含 |

### 16.2 五条产品原则的落地点（合规检查表）

> 规格书 §1.3 的五条原则是设计宪法。任何 PRD 章节若违反以下任一条，应被否决。

| 原则 | 在本 PRD 的落地点 |
|------|-----------------|
| **P1: Quiz 永远不是目的** | FR-06 强制费曼作为 Module 终点；所有 Quiz 服务于费曼铺垫 |
| **P2: 永远降低表达成本** | FR-03 表达层级分布（Level 1 ≥ 60%）；FR-04 "答错→看解析→继续"摩擦更低；§9.1 全局交互原则 |
| **P3: 每一道题都让用户成功** | FR-03 前 2 题强制 Level 1；FR-04 薄弱点记录 + 跨概念复习；§9.3 不用鲜红叉号 |
| **P4: 不让用户思考"如何回答"** | FR-03 题干清晰约束；Quiz Agent Prompt 约束；§9.1 最少认知负荷；§9.5 顺序流契约保证题号一致 |
| **P5: 输出自由度逐渐增加** | FR-03 表达层级曲线；FR-06 费曼 6 步从 Choice 到完整输出；§9.6 跨概念重复由浅入深 |

### 16.3 修订记录

| 版本 | 日期 | 修订 | 作者 |
|------|------|------|------|
| 1.0 | 2026-07-06 | 初稿，对齐规格书 V1.0 | — |
| 2.0 | 2026-07-10 | 基于 PRD-Report 审计结论全面修订。主要变更：FR-04 简化为"答错→看解析→继续"；FR-08 新增不自动删除约束；新增 FR-09~FR-12（蒙对标注/错题本导出/重刷错题/跨概念间隔重复）；§7.6 Quiz Agent 更新为 quiz-batch；§7.8 Feedback Agent 标注为 legacy；新增 §7.10 Local Evaluator、§8.1 CompiledModulePackage、§9.5 顺序流契约、§9.6 间隔重复算法、§10.6 三层验证架构、§12.X 全局导航规范；§14 补充 Phase 1-5 路线图 + 首页智能路由规范；§2.2 新增字体平衡 Token 表；NFR-P2 更新为即时响应 | — |

---

> **文档结束**
>
> 本 PRD 定义了 AI Learning Compiler V2.0 的可实施需求，是 V1.0 的全面修订版。任何对本 PRD 的修改应：
> 1. 不违反规格书第一章五条产品原则
> 2. 不违反规格书第九章学习心理学基础
> 3. 经过产品 + 工程 + 设计三方评审
>
> 后续的技术方案、UI 设计稿、Prompt 工程文档均应从本 PRD 拆解。
