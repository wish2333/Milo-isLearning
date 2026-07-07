# Quiz Ladder 层级定义

> 本片段被 **Mission Agent** 和 **Quiz Agent** 在 system 段引用。
> 引用方式：`{{> shared/ladder-level-explanation}}`。
> 对应 PRD §10.2：MVP 阶段不含 Association，仅保留 3 层。

---

## Quiz Ladder：每个 Concept 内的微循环

Quiz Ladder 是单个 Concept 内 Quiz 的认知层级序列。**不是题目越来越难，而是用户在每个认知层级都有一次低摩擦的成功体验**。

MVP 阶段保留 3 层：

### Level 1：Recognition（识别）

- **认知目标**：让用户"认出"概念的特征
- **典型题干**："下面哪一个属于 X？" / "下面哪一项是 X 的定义？"
- **干扰项来源**：同领域相邻概念、相似术语、近义定义
- **选项要求**：所有选项必须是同类（同为定义、同为术语、同为流程名）
- **用户负担**：零输入（纯点击）

### Level 2：Discrimination（辨别）

- **认知目标**：让用户在**多个相似项**中分辨正误
- **典型题干**：
  - "下面四个 X 示例，哪一个写错了？"
  - "X 与 Y 的关键区别是什么？"
  - "下面关于 X 的说法，哪个是不准确的？"
- **干扰项来源**：常见误解、近义概念、部分正确的陈述
- **选项要求**：必须包含一个"关系反转"型干扰项（如把"X 导致 Y"反转为"Y 导致 X"）
- **用户负担**：零输入（纯点击）

### Level 3：Application（应用）

- **认知目标**：让用户把概念**迁移到新场景**
- **典型题干**：
  - "下面哪个场景最适合用 X？"
  - "在情境 S 中，应该采用 X 还是 Y？为什么？"
  - "如果遇到问题描述为 P，应该用 X 的哪个步骤？"
- **干扰项来源**：
  - 错误的流程应用（公式 / 步骤用错）
  - 对的场景但错的方法
  - 部分正确但缺少关键步骤
- **选项要求**：每个干扰项代表**一种**独立的常见错误
- **用户负担**：零输入（纯点击，MVP）；V1.1 引入"短句补全"

---

## 层级分布约束（Mission Agent 必须遵守）

| 层级 | 在 Concept 内的占比 |
|---|---|
| Level 1 Recognition | 30-40% |
| Level 2 Discrimination | 30-40% |
| Level 3 Application | 20-30% |

> Association 层（Spec §2.4 Level 3）在 MVP 合并到 Discrimination 或 Application。V2 恢复。

---

## 层级递进原则

1. **Concept 内的前 2 题**必须是 Level 1（确保开局成功）。
2. 层级递进**对用户无感**：UI 不显示当前层级标签（PRD §10.4）。
3. 层级递进**对内容有感**：题干从"认出"变为"辨别"变为"应用"——用户感到知识在被深加工，但不感到难度断崖。

---

## 层级与表达层级的映射

Quiz Ladder（认知层级）与 Expression Level（表达层级）是**正交**的两个维度：

| 维度 | 控制 | MVP 范围 |
|---|---|---|
| Quiz Ladder | 题目的"认知深度" | 3 层 |
| Expression Level | 用户的"回答自由度" | 3 级（详见 [`expression-level-explanation.md`](./expression-level-explanation.md)） |

**所有 Quiz Ladder 层级在 MVP 阶段都可以是 Expression Level 1（Choice）**。即使用户在 Level 3 Application，也可以用纯点击完成（"下面哪个场景最适合 X？"）。

---

## 给 Mission Agent 的指令

生成 QuizSeries 占位符时，每个占位符的 `ladderLevel` 字段必须严格遵循上述分布。Mission Agent **不生成题目内容**，只生成占位符（含 `ladderLevel` 标签），由 Quiz Agent 根据占位符生成具体题目。

## 给 Quiz Agent 的指令

接收占位符的 `ladderLevel` 后，**必须按上述层级指导**设计题干：
- `ladderLevel: 1` → 题干用"认出"型
- `ladderLevel: 2` → 题干用"辨别"型，含关系反转干扰项
- `ladderLevel: 3` → 题干用"应用"型，每个干扰项代表一种独立错误

不允许"明明 ladderLevel=3 但题干问'X 是什么'"——这是 Level 1 的题。
