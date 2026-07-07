# 干扰项（Distractor）生成规则

> 本片段被 **Quiz Agent** 在 system 段引用。
> 引用方式：`{{> shared/distractor-rules}}`。
> 综合自 6 份外部检索报告（BiFlow / DPO Ranker / Overgenerate-Rank / Concept Map / DiVERT / moodle-mcq / aimcqframework / Haladyna & Downing）。

---

## 核心铁律

> **干扰项必须 plausible but wrong。不允许 absurd option。**

正确答案不能通过常识排除法猜出，是 Quiz 质量的最低门槛。

---

## 5 类高质量干扰项策略（来自 moodle-mcq）

每个干扰项必须属于以下 5 类之一。**不允许随机生成"看起来像错的选项"**。

### A. Overcorrection（过度矫正）

把正确做法推到极端，制造新问题。

- **模式**：`{正确原则}，但推到极端以至于产生新问题`
- **示例**（概念：Code Review）：
  - 正解：在提交 PR 前进行 code review
  - 干扰：要求每一行代码都由整个团队 review 后才能合并
- **示例**（概念：单元测试）：
  - 正解：为关键函数编写单元测试
  - 干扰：为所有函数（包括 getter/setter）编写单元测试

### B. Outdated Practice（过时做法）

在过去版本/上下文中是正确的，但已被取代。

- **模式**：`{已被取代的旧做法}（在 {版本/年份} 之前是正确的）`
- **示例**（概念：React Hooks）：
  - 正解：使用 useEffect 处理副作用
  - 干扰：在 class 组件中使用 componentDidMount 处理副作用
- **示例**（概念：CSS Grid）：
  - 正解：使用 grid 布局二维结构
  - 干扰：使用 table 标签实现布局

### C. Wrong Context（错位场景）

在另一个场景中正确，但放到当前问题中错误。

- **模式**：`{在场景 A 中正确的做法}，被错误地应用到 {场景 B}`
- **示例**（概念：SQL 索引）：
  - 正解：为高频查询的 WHERE 字段创建索引
  - 干扰：为所有字段创建索引（适用于数据仓库 OLAP，但 OLTP 中错误）
- **示例**（概念：缓存）：
  - 正解：对热点数据使用 LRU 缓存
  - 干扰：对所有数据使用 Write-Through 缓存（写入成本极高）

### D. Incomplete Solution（不完整方案）

只解决问题的一面，忽略其他必要方面。

- **模式**：`{部分正确}，但忽略 {其他必要方面}`
- **示例**（概念：安全审计）：
  - 正解：检查 OWASP Top 10 + 业务逻辑漏洞
  - 干扰：仅检查 OWASP Top 10（忽略业务逻辑漏洞）
- **示例**（概念：API 设计）：
  - 正解：考虑 RESTful 规范 + 错误处理 + 版本管理
  - 干扰：仅考虑 RESTful 规范（忽略错误处理与版本管理）

### E. Reasonable Misunderstanding（合理误解）

基于对相邻概念的不完整理解，学生会合理持有的错误信念。

- **模式**：`{学生理解了 X 但不理解 Y 时会相信的错误}`
- **示例**（概念：HTTPS）：
  - 正解：HTTPS = HTTP + TLS/SSL 加密
  - 干扰：HTTPS 是 HTTP 的另一种语法（混淆语法层与协议层）
- **示例**（概念：Embedding）：
  - 正解：Embedding 是把离散 token 映射到稠密向量
  - 干扰：Embedding 是把文本存储到数据库中（混淆表示学习与存储）

---

## 5 步干扰项生成流程（Quiz Agent 必须执行）

```
[Step 1] 概念理解检查
   先在 reasoning 字段（私有 CoT）输出：
   - 这个概念的核心是什么？
   - 学生常见的 3 个误解是什么？
   - 哪些相邻概念容易混淆？

[Step 2] 候选干扰项生成（Overgenerate）
   生成 6-8 个候选干扰项，每个标记类型（A/B/C/D/E）

[Step 3] 多样性筛选
   从 6-8 个候选中选 Top-3，要求：
   - 每个干扰项属于**不同的类型**（不允许两个都是 Overcorrection）
   - 语义聚类后选 cluster head（避免语义重复）
   - 优先选择学生最可能选择的（reasoning 已分析）

[Step 4] 自我审查（Self-Review）
   对每个选中干扰项问 3 个问题：
   - 这个干扰项可能被解释为正确吗？是 → 删除
   - 领域专家能一眼排除吗？是 → 让它更 plausible
   - 部分理解的学生会觉得它有诱惑力吗？否 → 替换

[Step 5] 格式校验
   - 所有选项（正解 + 干扰）长度差 ≤ 25%
   - 所有选项语法结构一致（同为名词短语 / 同为完整句 / 同为定义）
   - 所有选项属于同类（同为定义 / 同为术语 / 同为流程）
```

---

## Item Writing Flaws（绝对禁止的缺陷）

来自 aimcqframework 19 项自动检测规则与 Haladyna & Downing 经典指南。

### 字段层禁止

| Flaw | 描述 | 反例 |
|---|---|---|
| **Longest Option Correct** | 正解显著长于干扰项 | 正解 30 字、干扰项都 10 字 |
| **Absolute Terms** | 题干或选项含绝对词 | "always / never / all / none / 完全 / 绝对" |
| **Implausible Distractors** | 干扰项荒谬 | "RAG 是一种意大利菜" |
| **Grammatical Cues** | 干扰项与题干语法不一致 | 题干问"哪个是名词"，正解是名词，干扰项是动词 |
| **Word Repeats** | 题干关键词只在正解中出现 | 题干含"Embedding"，正解也含"Embedding"，干扰项不含 |
| **Logical Cues** | 题干与正解共享独特短语 | 题干"基于查询"，正解"基于查询的检索" |
| **Convergence Cues** | 正解与其他选项重叠最多 | 正解 = 选项 B 与 C 的并集 |
| **Negatively Worded** | 题干含 NOT / EXCEPT | "以下哪个**不是** X？" |
| **All of the Above / None of the Above** | 选项含"以上都对/都不对" | "E. 以上都对" |
| **Vague Terms** | 含模糊量词 | "frequently / usually / 经常 / 偶尔" |
| **Multiple Correct** | 多个选项都正确 | 4 选项中有 2 个都对 |

### 题干层禁止

- **依赖上下文**：题干含"如课件所示"、"参见示例 12"、"如上一题所述"——题干必须**自包含**
- **填空式而非选择题**：题干是"X 是 ____"，应改为"X 是以下哪一项？"
- **True/False 而非 MCQ**：题干是"判断 X 是否正确"——必须改为 4 选项

---

## 答案长度分布（15/15/70 规则）

跨整个 Concept 的所有 Quiz（≥ 8 题），正解在选项中的长度分布应满足：

| 正解长度位置 | 占比 |
|---|---|
| 正解是 4 选项中**最短**的 | ~15% |
| 正解是 4 选项中**最长**的 | ~15% |
| 正解是 4 选项中**中间长度**的 | ~70% |

> 这个规则防止用户通过"最长的是对的"猜出答案。
>
> Quiz Agent 不需要每题都校验，但 Concept 内整体分布应大致符合。

---

## 答案位置（重要：解析器友好）

**JSON 中正解永远放 `options[0]`**，渲染时由前端打乱（ClassBuild 模式）。

- `options: [正解, 干扰1, 干扰2, 干扰3]` ← Quiz Agent 输出
- `options: [干扰2, 正解, 干扰3, 干扰1]` ← 前端渲染时打乱

理由（来自 ClassBuild）：
1. 消除"正解位置偏好"导致的统计偏差
2. JSON 解析更简单，减少 parser bug
3. 答错重试生成新题时，结构稳定

`answer` 字段必须**完整复制** `options[0]` 的字符串，而不是 `"A"` / `"B"` 之类字母索引（避免打乱后失配）。

---

## 答错重试场景的特殊规则

当 Quiz Agent 被调用为答错用户生成新题时（[`feedback.md`](../feedback.md) 触发）：

1. **保留**：`conceptId` / `ladderLevel` / `interactionType` / `expressionLevel`
2. **更换**：
   - `stem` 必须换（新场景或新表述）
   - `options[0]`（正解）可保留或换表述
   - 干扰项至少换 2 个（来自原 distractors 池中未使用的）
3. **新增字段**：`distractors` 字段保留**所有候选**（包含已用 + 未用），便于后续重试继续抽

---

## 反例：低质量干扰项（绝对禁止）

```
概念：Attention 机制

题干：下面哪一项是 Attention 机制？

低质量选项：
A. Attention 是 Transformer 中的核心机制（正解，太长 + 含题干关键词）
B. Attention 是一种水果（荒谬）
C. Attention 是无关选项（荒谬）
D. Attention 不知道是什么（无内容）

高质量选项：
A. 一种通过计算查询与键的相似度来加权聚合值的机制（正解）
B. 一种在 RNN 中用于缓解长程依赖消失的门控机制（混淆 Attention 与 LSTM gate）
C. 一种用于将输入序列降维到固定长度的池化方法（混淆 Attention 与 mean/max pooling）
D. 一种在训练时随机丢弃神经元以防止过拟合的正则化方法（混淆 Attention 与 Dropout）
```

---

## 给 Quiz Agent 的强制指令

在 `reasoning` 字段（私有 CoT）输出：
1. 这个概念的核心是 ____。
2. 学生常见误解包括：____ / ____ / ____。
3. 候选干扰项类型：A（Overcorrection）+ B（Outdated）+ E（Misunderstanding）。
4. 选 Top-3 后自检：每个属于不同类型，没有明显正确，没有荒谬。

然后再输出 `options` / `answer` / `explanation` / `distractors`。

**如果你跳过 reasoning 直接输出 options，你的输出会被打回重试。**
