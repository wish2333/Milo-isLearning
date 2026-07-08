# 表达层级定义

> 本片段被 **Mission Agent** 和 **Quiz Agent** 在 system 段引用。
> 引用方式：`{{> shared/expression-level-explanation}}`。
> 对应规格书 §2.5 Expression Freedom Curve 与 PRD §7.5。

---

## Expression Level：用户的回答自由度

**这是产品最大的创新**：用户的回答方式从完全受限（100% 选择）到完全自由（完整费曼输出），连续、无感地提升。

**核心原则（P5：输出自由度逐渐增加）**：表达自由度的提升必须是**渐进的、连续的、无感的**，绝不允许出现断崖式跳跃。

MVP 阶段保留 3 级（规格书定义 7 级，MVP 收敛）：

### Level 1：Choice（纯选择）

- **交互类型**：4 选项单选，一次点击
- **用户负担**：零输入负担
- **使用比例**：占 Concept 内 Quiz 总数 ≥ 60%
- **强制要求**：Concept 内**前 2 题**必须是 Level 1
- **MVP 范围内的所有 Quiz Ladder 层级**都可以是 Level 1（包括 Application 层："下面哪个场景最适合 X？"）

### Level 2：Sorting（选择 + 排序）

- **交互类型**：3-5 个选项，按正确顺序拖拽（桌面）/ 上下箭头（移动端）
- **用户负担**：低碳负担（多次点击 + 序列判断）
- **使用比例**：≤ 20%
- **典型场景**：流程类概念（如"RAG 的步骤排序"）、因果链（"X 的执行顺序"）
- **关键约束**：
  - 选项数 ∈ [3, 5]
  - 必须存在唯一的正确顺序（不允许歧义）
  - 干扰项不存在（所有选项都必须进入排序）

### Level 3：Fill Blank（选择 + 填空）

- **交互类型**：选择题为主，少数题目填入一个明确短语
- **用户负担**：中等负担（输入一个概念短语）
- **使用比例**：≤ 20%
- **典型场景**：在小场景、因果链或对比关系中补全关键短语

#### Expression 3 Fill Blank

- 只允许 1 个空白。
- 空白答案必须是一个明确短语，而不是开放观点。
- `answer` 是最推荐标准答案。
- `acceptableAnswers` 必须包含 2-6 个可接受变体，并且包含 `answer`。
- `answerHint` 必须给出语境提示，帮助用户理解要补的是哪类概念，而不是背题。
- `evaluationMode` 默认使用 `semantic`，除非答案是唯一术语。
- 题干必须包含足够背景，让用户可通过理解推断答案。
- 禁止问题：`____ 是什么？`、`请填入概念名 ____`、要求背诵原句的题。
- 推荐问题：给出一个小场景或因果链，让用户补全关键关系。

---

## 表达层级分布约束（Mission Agent 必须遵守）

每个 Concept 的 QuizSeries 占位符中：

| Expression Level | 占比约束 |
|---|---|
| Level 1 Choice | ≥ 60% |
| Level 2 Sorting | ≤ 20% |
| Level 3 Fill Blank | ≤ 20% |

总数 ∈ [8, 15] 的占位符分布示例：

| 总数 | Level 1 | Level 2 | Level 3 |
|---|---|---|---|
| 8 | 5-8 | 0-1 | 0-1 |
| 10 | 6-10 | 0-2 | 0-2 |
| 15 | 9-15 | 0-3 | 0-3 |

---

## 表达层级的递进原则

1. **Concept 内 expressionLevel 单调非递减**：占位符序列从前往后，`expressionLevel` 字段只能保持或上升，不能下降。
   - 合法序列：`1, 1, 1, 2, 1, 3, 3, 1`（局部可平级或回退到 1）
   - **更严格的做法**：MVP 倾向于"主要在末尾升 Level"，让用户在 Concept 末尾才感受到表达自由度的提升
2. **Concept 之间**：可以平级，不需要每个 Concept 都升级（避免压力）。
3. **Module 末尾的 Feynman Step 5 Fill Blank** 是 Level 3 的高级形式（短句补全）——但 MVP 暂用关键词填空。
4. **Module 末尾的 Feynman Step 6 开放输出** 是 Module End 表达层级（最高自由度）——但 MVP 通过 Step 1-4 脚手架降低负担。

---

## Quiz Ladder 与 Expression Level 的正交关系

| | Expression 1 Choice | Expression 2 Sorting | Expression 3 Fill Blank |
|---|---|---|---|
| **Ladder 1 Recognition** | 合法（最常见组合） | 合法（少见） | 合法（罕见） |
| **Ladder 2 Discrimination** | 合法（常见） | 合法（流程对比题） | 合法（少见） |
| **Ladder 3 Application** | 合法（最常见组合） | 合法（流程排序应用） | 合法（关键词应用） |

**MVP 主推组合**：`(Ladder 1-3, Expression 1 Choice)`。这是产品 60%+ 的题。

---

## 给 Mission Agent 的指令

生成占位符时：
1. 严格控制每个 Concept 的 expressionLevel 分布符合上述约束
2. 前 2 个占位符**必须**是 `{ladderLevel: 1, interactionType: 'choice', expressionLevel: 1}`
3. expressionLevel 序列在 Concept 内单调非递减

## 给 Quiz Agent 的指令

接收占位符的 `expressionLevel` 后，**必须按上述层级指导**设计交互：
- `expressionLevel: 1` → 4 选项单选 Choice
- `expressionLevel: 2` → 3-5 选项 Sorting
- `expressionLevel: 3` → Fill Blank（短语级填空，必须输出 acceptableAnswers / answerHint / evaluationMode）

不允许"明明 expressionLevel=3 但题干要求用户写完整段落"——这超出 MVP 表达层级范围。
