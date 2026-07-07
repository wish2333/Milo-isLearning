# AI Learning Compiler 产品规格说明书

> **Product Specification V1.0**
> 版本：1.0 | 状态：Draft | 日期：2026-07-06

---

## 产品哲学（首页）

> 这个产品不是"AI 出题工具"，甚至也不只是"AI 学习助手"。
>
> 它真正解决的是一个几乎所有学习产品都没有解决的问题：
>
> **如何把开放式学习（理解、表达、迁移）拆解成一系列几乎零心理负担的微交互，并在用户几乎无感知的情况下，逐步提升其表达自由度，最终完成费曼式掌握。**

这一句话定义了整个产品的边界，也定义了它与一切现有 Quiz 工具、AI 出题器、课程平台的根本区别。

- 它不生成题库，它**编译训练系统**。
- 它不考用户，它**帮助用户表达**。
- 它不追求题目难度递增，它追求**表达自由度连续、无感地上升**。

本规格说明书是整个项目的设计基石。未来的 PRD、Prompt、Agent Workflow、UI、技术方案均从本文档拆解而来。

---

## 目录

- [第一章 产品定位（Why）](#第一章-产品定位why)
- [第二章 Learning Engine（学习引擎）](#第二章-learning-engine学习引擎)
- [第三章 AI Agent Architecture](#第三章-ai-agent-architecture)
- [第四章 Learning Flow（学习流程）](#第四章-learning-flow学习流程)
- [第五章 MVP（最小可行产品）](#第五章-mvp最小可行产品)
- [第六章 数据结构](#第六章-数据结构)
- [第七章 Prompt 设计](#第七章-prompt-设计)
- [第八章 产品路线图](#第八章-产品路线图)
- [第九章 Learning Psychology（学习心理学）](#第九章-learning-psychology学习心理学)

---

## 第一章 产品定位（Why）

### 1.1 学习产品的问题

今天市面上的学习产品，几乎都失败在同一个地方：**它们解决了知识的获取，却没有解决知识的内化**。

#### 1.1.1 视频课程的问题

视频课程是单向输出。用户"看完"不等于"学会"。Coursera、YouTube 教程、B 站课程的完课率普遍低于 10%。原因不是内容不好，而是**用户从未被要求输出**。没有输出的学习，只是信息的短暂停留。

#### 1.1.2 阅读的问题

阅读文档、博客、书籍，问题与视频类似——甚至更隐蔽。阅读给用户一种"我懂了"的错觉，因为文字流过大脑时产生了理解感。但理解感（Sense of Understanding）和真正掌握（Mastery）之间，隔着一道叫做**主动回忆**的墙。

#### 1.1.3 AI 聊天的问题

ChatGPT、Claude 这类工具让学习变得极其便利，但也极其虚假。用户可以问任何问题、得到任何答案，却从不被要求**自己组织语言**。AI 帮你想、帮你写、帮你总结——你的大脑成了旁观者。

#### 1.1.4 Quiz 产品的问题

现有的 Quiz 工具（无论是 Anki、Quizlet 还是各种 AI 出题器）解决了"输出"问题，却制造了新问题：

- **题目是孤立的**：100 道选择题之间没有结构，做完就忘。
- **题目只测不练**：题目告诉你"错了"，却不告诉你"如何变对"。
- **表达成本突然上升**：从纯选择题突然跳到"请解释这个概念"，用户的心理负担瞬间炸裂，于是放弃。
- **没有成长曲线**：第 1 题和第 100 题的交互方式完全一样，用户感受不到能力的成长。

#### 1.1.5 多邻国为什么成功

多邻国是至今为止最成功的语言学习产品，它的核心机制不是内容，而是：

- **每一题都让你成功**：你几乎不会"卡住"，因为题目足够简单、足够碎。
- **表达成本极低**：大部分时候你只需要点一下，不需要打字。
- **连续无感的进阶**：你感觉不到难度在上升，但回头看，你已经能读整句了。
- **Quiz 是脚手架，不是考试**：题目帮助你构建能力，而不是检验你是否合格。

但多邻国的成功局限于**语言学习**，因为语言的输出可以高度碎片化（选词、排序、填空）。对于概念性知识（RAG、Transformer、费曼学习法本身），目前没有任何产品做到了同等水平的体验。

#### 1.1.6 为什么 AI 时代需要新的学习方式

AI 让"生成题目"变得几乎免费。任何人可以让 GPT 生成 100 道选择题。但"生成题目"从来不是问题——**如何把知识编译成一条让人真正能走完、走完后真正掌握的训练路径**，才是问题。

AI 的真正价值不在于"出题更便宜"，而在于：**它可以理解知识的结构、理解用户的状态，从而动态编译出一条从零到掌握的连续路径**。这是传统教育产品做不到的。

#### 1.1.7 总结：学习最大的障碍

> **学习最大的障碍不是知识本身，而是表达成本（Expression Cost）。**

用户放弃学习，不是因为他看不懂，而是因为他被要求"写一段话解释这个概念"时，大脑空白了。那一片刻的空白，就是绝大多数学习产品失去用户的地方。

本产品的全部设计，都是为了让用户**永远不被表达的恐惧阻断**。

---

### 1.2 产品使命

> **将任何知识自动编译为一条低摩擦、高掌握度的学习路径。**
>
> 不是生成 Quiz，不是总结知识，而是 **Compile Knowledge into Mastery**。

这句话的每一部分都有精确含义：

| 关键词 | 含义 |
|--------|------|
| 任何知识 | 不限于语言，覆盖概念性、程序性、理论性知识 |
| 自动编译 | 用户只需提供原材料（Markdown/PDF），系统自动完成全部拆解与编排 |
| 低摩擦 | 用户在每一步的心理负担接近于零，永远"再点一下就好" |
| 高掌握度 | 走完路径后，用户能用自己的语言完整解释所学内容（费曼标准） |
| 学习路径 | 不是题库，是一条有起点、有终点、有节奏的路 |

### 1.3 产品原则

以下五条原则是整个产品设计的宪法。任何功能、任何 Prompt、任何 UI 决策，如果违反这五条原则中的任何一条，都应该被否决。

#### Principle 1：Quiz 永远不是目的

Quiz 是脚手架（Scaffold），不是终点。每一道题的存在，都是为了让用户在最终面对费曼表达时，已经具备了全部必要的心理准备。如果一道题不能服务于"帮助用户最终表达"，它就不应该存在。

#### Principle 2：永远降低表达成本

任何时候，如果可以在"让用户输入"和"让用户选择"之间选，优先选择。表达自由度的提升必须是**渐进的、连续的、无感的**，绝不允许出现断崖式跳跃。

#### Principle 3：每一道题都应该让用户成功

用户应该一直赢。错误不是惩罚，而是**提示系统降低下一题的表达要求**。一道题如果让超过 30% 的用户卡住超过 10 秒，这道题的设计就是失败的。

#### Principle 4：不让用户思考"如何回答"

用户的心智应该全部用于**知识本身**，而不是用于**理解题目的交互方式**。如果用户需要思考"这道题要我做什么"，这道题的交互设计就是失败的。

#### Principle 5：输出自由度逐渐增加

这是核心原则。整个学习路径的本质，不是知识难度递增，而是**表达自由度递增**。从 100% 选择题，到选择+排序，到填空，到短句补全，到一句话解释，到完整费曼——这条曲线必须连续、平滑、无感。

---

## 第二章 Learning Engine（学习引擎）

本章是整个产品最核心、最难被抄袭的部分。它定义了知识如何被"编译"成训练系统。

### 2.1 Knowledge Compiler（知识编译器）

Knowledge Compiler 是整个产品的发动机。它的职责是：

> **输入：原始知识材料（Markdown）**
> **输出：一棵结构化的 Learning Module 树**

编译过程分为以下几个阶段：

```
原始 Markdown
      │
      ▼
┌─────────────┐
│  Chunk      │  将长文切分为语义连贯的知识块
└─────────────┘
      │
      ▼
┌─────────────┐
│  Concept    │  从每个 Chunk 中提取原子概念
│  Extraction │  （Definition / Property / Example）
└─────────────┘
      │
      ▼
┌─────────────┐
│  Module     │  将概念聚类为 Learning Module
│  Grouping   │  （一个 Module = 一个可独立掌握的知识单元）
└─────────────┘
      │
      ▼
┌─────────────┐
│  Mission    │  为每个概念生成 Quiz Series（练习序列）
│  Generation │  每个 Quiz 遵循 Quiz Ladder
└─────────────┘
      │
      ▼
┌─────────────┐
│  Feynman    │  为每个 Module 生成 Module Feynman 任务
│  Design     │  （验证整个 Module 的心智模型）
└─────────────┘
```

**关键设计决策**：

- MVP 阶段**不构建 Graph**（依赖图、难度图）。Graph 的维护成本远高于生成成本，且 MVP 不需要。直接使用 **Linear Pipeline**：知识 → Concept → Module → Quiz Series → Feynman。
- 一个 Module 内的概念是**线性排列**的，Concept A → Concept B → Concept C，每个概念有自己的 Quiz Series（微循环），Module 结束有 Module Feynman。

### 2.2 Learning Module（学习单元）

Learning Module 是用户感知到的"一节课"。它是自包含的——用户走完一个 Module，就掌握了一个可独立解释的知识单元。

#### Module 的结构

```
Learning Module: 理解 RAG（检索增强生成）
│
├── Introduction（导言）
│     用一句话告诉用户这个 Module 会让他能解释什么。
│     "完成本模块后，你能向一个高中生解释 RAG 是什么、为什么需要它。"
│
├── Concept A: 什么是检索
│     └── Quiz Series（微循环，见 2.4 Quiz Ladder）
│
├── Concept B: 什么是 Embedding
│     └── Quiz Series
│
├── Concept C: 什么是 RAG 的完整流程
│     └── Quiz Series
│
├── Module Challenge（模块挑战）
│     混合三个概念的综合性 Quiz，检验概念间的关联
│
└── Module Feynman（模块费曼）
      "请向一个完全不懂 AI 的朋友解释 RAG 为什么会出现、它解决了什么问题。"
      此时用户已经完成了 30-50 道低摩擦 Quiz，心智模型已建立。
```

#### 为什么 Feynman 放在 Module 末尾而不是 Concept 末尾

费曼学习法验证的是**完整的心智模型（Mental Model）**，而不是单个概念的记忆。解释 RAG 需要同时调用"检索""Embedding""生成"三个概念，并将它们组织成一个连贯的叙事。这种组织能力只有在 Module 级别才能被训练和验证。

如果把费曼放在每个 Concept 之后，用户只是在做"概念复述"，而不是"知识组织"——前者是记忆，后者才是掌握。

### 2.3 Quiz as Interaction Primitive（Quiz 是交互原语，不是题型）

这是一个关键的认知转变：

> **传统视角**：Quiz 是一种题型（选择题、填空题、判断题）。
>
> **本产品视角**：Quiz 是一种**Interaction Primitive（交互原语）**——它是用户与知识之间**最低成本的交互方式**。

在这个视角下：

- 选择题 = 最低成本交互（一次点击）
- 排序题 = 低碳成本交互（多次点击 + 序列判断）
- 填空题 = 中等成本交互（输入 1-2 个词）
- 短句补全 = 中高成本交互（输入半句话）
- 开放解释 = 高成本交互（完整输出）

**Quiz 的本质不是"考"，而是"让用户以最低成本与知识发生一次有效接触"。**

未来的交互形式不限于上述几种——拖拽、连线、标注、选择+修正，任何能让用户"用最低心理负担完成一次知识接触"的形式，都属于 Quiz。

### 2.4 Quiz Ladder（练习阶梯）

Quiz Ladder 是每个 Concept 内部的微循环结构。它的核心思想是：

> **不是题目越来越难，而是用户在每个认知层级都有一次低摩擦的成功体验。**

一个 Concept 的 Quiz Series 包含以下层级（基于 Bloom 分类法的简化）：

```
Level 1: Recognition（识别）
  "下面哪一个属于 Few-shot Prompting？"
  → 纯选择，用户只需"认出来"

Level 2: Discrimination（辨别）
  "下面四个 Few-shot 示例，哪一个写错了？"
  → 选择，但需要在多个相似项中辨别

Level 3: Association（联想/语境）
  "如果没有 Few-shot，这个 Prompt 会出什么问题？"
  → 选择，但需要理解因果

Level 4: Application（应用）
  "下面哪个场景最适合用 Few-shot？"
  → 选择，但需要迁移到新场景
```

**关键点**：以上四个层级**全部是选择题**。用户在不知不觉中完成了"识别 → 辨别 → 理解 → 迁移"，但**从未需要自己输入一个字**。

这就是多邻国真正厉害的地方，也是本产品要复刻到概念性知识上的体验。

一个 Concept 通常包含 8-15 道 Quiz，覆盖上述四个层级，每个层级 2-4 题。

### 2.5 Expression Freedom Curve（表达自由度曲线）

> **这是本产品最大的创新，也是区别于一切现有学习产品的核心机制。**

#### 核心洞察

传统学习产品的设计维度是"知识难度"：题目从易到难。

本产品的设计维度是"表达自由度"：**用户的回答方式从完全受限（100% 选择）到完全自由（完整费曼输出），连续、无感地提升。**

#### 表达自由度的层级

```
Level 1: 100% Choice（纯选择）
  用户只需点击。零输入负担。

Level 2: Choice + Sorting（选择 + 排序）
  用户选择并排列选项。引入"序列"概念，但仍是点击。

Level 3: Choice + Fill Blank（选择 + 填空）
  选择题为主，少数题目填入 1-2 个关键词。

Level 4: Choice + Short Sentence（选择 + 短句补全）
  选择题为主，少数题目补全半句话。

Level 5: One Sentence（一句话解释）
  用户用一句话回答。第一次完整自主输出。

Level 6: Three Sentences（三句话解释）
  用户用三句话组织一个微型解释。

Module End: Complete Feynman（完整费曼输出）
  用户完整地解释整个 Module 的知识。
```

#### 为什么这条曲线是核心

1. **它解决了费曼学习法的落地难题**：费曼学习法很好，但"请解释这个概念"对初学者来说是一道不可逾越的墙。这条曲线把这道墙拆成了 7 级台阶，用户走完台阶时，墙已经不存在了。

2. **它让"进步"变得可感知**：用户能明确感受到"我从只需要点选，变成了能自己写句子"——这种表达能力成长的感知，比"我答对了更多题"强烈得多。

3. **它定义了产品节奏**：整个 Module 的节奏不是由知识难度决定的，而是由表达自由度决定的。这让产品体验有了**音乐性**——有起承转合，有渐强，有高潮（费曼）。

#### 费曼也可以被"编译"成 Quiz 序列

这是一个重要的延伸创新。Module 末尾的费曼任务，本身也可以被拆解为一条低摩擦的 Quiz 序列：

```
Feynman Step 1: "如果让你向朋友解释 Attention，第一句话应该是什么？"
  → A/B/C/D 选择

Feynman Step 2: "接下来应该解释什么？"
  → A 训练过程 / B 为什么需要 / C 数学公式 / D 历史背景（选择）

Feynman Step 3: "如果对方还是没懂，你会举什么例子？"
  → A/B/C/D 选择

Feynman Step 4: "下面四个完整解释，哪一个最好？"
  → A/B/C/D 选择

Feynman Step 5: "请补充一句话。"
  → 短句补全（Level 4）

Feynman Final: "现在请用你自己的话完整解释一遍。"
  → 完整输出（Module End）
```

到这一步，用户已经通过前 4 步**内化了解释的结构和节奏**，最后的自主输出几乎水到渠成。表达成本被极大地降低了。

> **产品真正编译的不是知识，而是表达负担（Expression Burden）。**

---

## 第三章 AI Agent Architecture

本章描述实现 Learning Engine 所需的 AI Agent 架构。每个 Agent 是一个有明确输入、输出和 Prompt 的处理单元。

### 3.1 Agent 流水线总览

```
原始知识（Markdown）
      │
      ▼
┌──────────────┐
│ Import Agent │  清洗、标准化输入格式
└──────────────┘
      │
      ▼
┌──────────────┐
│ Chunk Agent  │  语义切分，输出 Chunk[]
└──────────────┘
      │
      ▼
┌──────────────────┐
│ Concept Agent    │  从 Chunk 提取原子概念
│                  │  输出 Concept[]{name, definition, type}
└──────────────────┘
      │
      ▼
┌──────────────────┐
│ Module Agent     │  将概念聚类为 Module
│ (MVP: 线性排列)   │  输出 Module[]{concepts[], intro, goal}
└──────────────────┘
      │
      ▼
┌──────────────────┐
│ Mission Agent    │  为每个 Concept 生成 Quiz Series
│                  │  按 Quiz Ladder 的 4 个层级编排
└──────────────────┘
      │
      ▼
┌──────────────────┐
│ Quiz Agent       │  生成具体 Quiz 题目
│                  │  每题包含 stem/options/answer/explanation
└──────────────────┘
      │
      ▼
┌──────────────────┐
│ Feynman Agent    │  为 Module 生成费曼任务序列
│                  │  包含低摩擦阶梯 + 最终开放输出
└──────────────────┘
      │
      ▼
┌──────────────────┐
│ Feedback Agent   │  【运行时】评估用户答案
│  (Runtime)       │  输出 score + gaps + next_action
└──────────────────┘
      │
      ▼
┌──────────────────┐
│ Mastery Agent    │  【运行时】跟踪用户掌握度
│  (Runtime)       │  MVP: 简单计数（答对率）
└──────────────────┘
```

### 3.2 各 Agent 职责详解

#### Import Agent
- **输入**：用户上传的 Markdown 文本
- **输出**：标准化文本（去除格式噪声、统一标题层级）
- **MVP 范围**：仅支持 Markdown，不处理 PDF/网页/视频

#### Chunk Agent
- **输入**：标准化文本
- **输出**：`Chunk[]`，每个 Chunk 是一个语义连贯的段落
- **策略**：按标题层级 + 段落长度切分，确保每个 Chunk 聚焦一个主题

#### Concept Agent
- **输入**：`Chunk[]`
- **输出**：`Concept[]`，每个概念包含：
  - `name`：概念名（如"Attention"）
  - `definition`：一句话定义
  - `type`：概念类型（事实性 / 程序性 / 理论性）
  - `parent_chunk`：来源 Chunk
- **原则**：一个 Chunk 通常提取 1-3 个概念，不贪多

#### Module Agent
- **输入**：`Concept[]`
- **输出**：`Module[]`，每个 Module 包含：
  - `title`：模块标题
  - `intro`：一句话导言（"完成本模块后，你能……"）
  - `goal`：掌握目标（用于费曼验证）
  - `concepts[]`：该模块包含的概念（线性排列）
- **MVP 策略**：简单按主题相关性聚类，不构建依赖图

#### Mission Agent
- **输入**：`Module`（含其 `concepts[]`）
- **输出**：每个 Concept 的 `QuizSeries`，包含按 Quiz Ladder 编排的 Quiz 占位符
- **职责**：决定每个概念需要哪些层级的 Quiz、各层级几道

#### Quiz Agent
- **输入**：单个 Quiz 占位符（概念 + 层级 + 目标表达自由度）
- **输出**：完整的 Quiz 对象：
  - `stem`：题干
  - `options[]`：选项（选择题）
  - `answer`：正确答案
  - `explanation`：解释（用于答错后的即时反馈）
  - `interaction_type`：choice / sorting / fill_blank / sentence
- **核心约束**：选项必须有足够的迷惑性（distractor），不能让正确答案显而易见

#### Feynman Agent
- **输入**：`Module`
- **输出**：费曼任务序列：
  - 前 4-5 步：低摩擦选择/补全题（编译解释结构）
  - 最终步：开放输出任务
  - 评分标准（Rubric）：用户最终输出应覆盖哪些关键点

#### Feedback Agent（运行时）
- **输入**：用户答案 + Quiz 标准答案
- **输出**：
  - `score`：0-100
  - `gaps[]`：用户遗漏的关键点
  - `next_action`：`advance`（进入下一题）/ `retry`（同类型再来）/ `remediate`（回退一个表达自由度层级）
- **MVP 策略**：答对 → advance；答错 → 显示 explanation + retry

#### Mastery Agent（运行时）
- **输入**：用户在 Module 内的全部答题记录
- **输出**：`Mastery{}`，包含：
  - `module_completion`：0-100%
  - `concept_mastery`：每个概念的掌握度
- **MVP 策略**：简单答对率统计，不使用 IRT/BKT/DKT 等复杂模型

---

## 第四章 Learning Flow（学习流程）

本章从用户视角描述完整的学习旅程。

### 4.1 完整学习流程

```
用户上传 Markdown
        │
        ▼
┌─────────────────────┐
│ 系统编译（离线）      │  Knowledge Compiler 运行
│ 生成 Module 树       │  通常 10-30 秒
└─────────────────────┘
        │
        ▼
┌─────────────────────┐
│ 展示课程概览         │  "本课程包含 3 个模块，预计 45 分钟"
│ 用户点击"开始"       │
└─────────────────────┘
        │
        ▼
┌─────────────────────────────────────────────┐
│              Module 学习循环                  │
│                                             │
│  ┌─ Module Introduction ──────────────────┐ │
│  │ "完成本模块后，你能解释 RAG 是什么"     │ │
│  └────────────────────────────────────────┘ │
│                  │                          │
│                  ▼                          │
│  ┌─ Concept A 循环 ────────────────────────┐│
│  │  Recognition Quiz ×2                   ││
│  │  Discrimination Quiz ×2                ││
│  │  Association Quiz ×2                   ││
│  │  Application Quiz ×2                   ││
│  └────────────────────────────────────────┘│
│                  │                          │
│                  ▼                          │
│  ┌─ Concept B 循环 ────────────────────────┐│
│  │  （同上结构）                           ││
│  └────────────────────────────────────────┘│
│                  │                          │
│                  ▼                          │
│  ┌─ Concept C 循环 ────────────────────────┐│
│  │  （同上结构）                           ││
│  └────────────────────────────────────────┘│
│                  │                          │
│                  ▼                          │
│  ┌─ Module Challenge ─────────────────────┐│
│  │  混合 Quiz：跨概念综合题 ×3-5          ││
│  └────────────────────────────────────────┘│
│                  │                          │
│                  ▼                          │
│  ┌─ Module Feynman ───────────────────────┐│
│  │  Feynman Step 1: 选择（解释开头）       ││
│  │  Feynman Step 2: 选择（解释方向）       ││
│  │  Feynman Step 3: 选择（举例）          ││
│  │  Feynman Step 4: 选择（最佳完整解释）   ││
│  │  Feynman Step 5: 短句补全              ││
│  │  Feynman Final: 完整自主输出            ││
│  └────────────────────────────────────────┘│
│                  │                          │
│                  ▼                          │
│         Mastery Update（掌握度更新）         │
└─────────────────────────────────────────────┘
        │
        ▼
┌─────────────────────┐
│ 下一 Module 解锁     │  或课程完成
└─────────────────────┘
```

### 4.2 单题交互流程

```
展示 Quiz
   │
   ▼
用户作答（选择/排序/填空/输入）
   │
   ▼
Feedback Agent 评估
   │
   ├── 答对 ──→ 显示肯定反馈 ──→ 进入下一题
   │
   └── 答错 ──→ 显示 explanation
                  │
                  ▼
              生成同类型新题（换干扰项/换场景）
                  │
                  ▼
              用户重新作答
```

### 4.3 关键体验节点

| 节点 | 体验目标 | 设计要点 |
|------|---------|---------|
| 课程开始 | 让用户知道"我能走完" | 展示预计时长、模块数，降低启动焦虑 |
| Concept 循环 | 让用户"一直赢" | 前 2 题必须是 Level 1（识别），确保成功开局 |
| Module Challenge | 让用户感受"概念开始连起来" | 题干要跨概念，制造 Aha Moment |
| Feynman Step 1-4 | 让用户"不知不觉学会表达" | 这 4 步是脚手架，用户不应感到困难 |
| Feynman Final | 让用户"惊讶于自己能做到" | 这是高潮，要让用户有成就感 |
| 课程完成 | 让用户"想再来一次" | 展示掌握度、鼓励分享 |

---

## 第五章 MVP（最小可行产品）

MVP 的核心原则是**极度克制**。只验证一件事：**用户是否愿意走完一条"Markdown → 编译 → Quiz 阶梯 → 费曼"的路径，并在走完后感到自己真的学会了**。

### 5.1 MVP 功能范围

#### 包含

| 模块 | 功能 |
|------|------|
| 知识导入 | 仅支持 Markdown 文本输入（粘贴或上传 .md） |
| Knowledge Compiler | 将 Markdown 编译为单个 Learning Module（MVP 不支持多 Module） |
| Quiz 交互 | 支持三种交互类型：Choice（选择）、Sorting（排序）、Fill Blank（填空） |
| Concept 微循环 | 每个 Concept 包含 Recognition / Discrimination / Application 三层 Quiz |
| Module Feynman | 包含低摩擦阶梯（4 步选择）+ 1 步短句补全 + 1 步完整输出 |
| Feedback | 答对进入下一题，答错显示解释 + 同类型重试 |
| Mastery | 简单完成度展示（Module 完成百分比） |

#### 不包含

| 排除项 | 原因 |
|--------|------|
| PDF / 网页 / 视频输入 | 每增加一种输入，Pipeline 复杂度翻倍，MVP 不需要 |
| 多 Module 课程 | MVP 聚焦单 Module 闭环，验证核心体验 |
| Concept Graph / Dependency Graph | Graph 维护成本远高于生成成本，V2 再做 |
| Adaptive Learning（自适应） | 需要用户画像/IRT/BKT，MVP 用简单规则替代 |
| Spaced Repetition（间隔重复） | 需要长期记忆模型，V2 再做 |
| Today's Mission / 每日任务 | 这是 V2 的多邻国式体验，MVP 先验证单次学习闭环 |
| 用户账号 / 云端同步 | MVP 可纯前端/单机运行，不设登录 |

### 5.2 MVP 验证指标

MVP 上线后，关注以下指标：

| 指标 | 目标 | 含义 |
|------|------|------|
| Module 完成率 | > 40% | 用户愿意走完整个闭环 |
| Feynman Final 提交率 | > 60%（已完成前置步骤的用户中） | 用户愿意做最终表达 |
| 平均答题正确率 | 70-85% | 太低=挫败，太高=无聊 |
| 用户主观掌握感评分 | > 4/5 | "我感觉自己学会了" |
| 次日回访率 | > 25% | 用户愿意再来学习 |

### 5.3 MVP 技术栈建议

- **前端**：Next.js + React（支持快速迭代 + 未来 SaaS 化）
- **AI**：调用 LLM API（OpenAI / Claude / 本地 Ollama），MVP 不需要训练
- **存储**：LocalStorage（MVP 无需后端）
- **部署**：纯前端静态部署（Vercel），零后端成本

---

## 第六章 数据结构

本章定义核心数据模型。MVP 的数据库 schema 可直接照此设计。

### 6.1 实体关系图

```
KnowledgeSource (1) ──→ (N) Module
Module (1) ──→ (N) Concept
Concept (1) ──→ (1) QuizSeries
QuizSeries (1) ──→ (N) Quiz
Module (1) ──→ (1) FeynmanTask
User (1) ──→ (N) AttemptRecord
Quiz (1) ──→ (N) AttemptRecord
```

### 6.2 核心数据模型

#### KnowledgeSource

```typescript
interface KnowledgeSource {
  id: string
  type: 'markdown'  // MVP 仅此一种
  content: string   // 原始文本
  createdAt: timestamp
}
```

#### Module

```typescript
interface Module {
  id: string
  sourceId: string          // FK → KnowledgeSource
  title: string             // "理解 RAG"
  intro: string             // "完成本模块后，你能向高中生解释 RAG"
  goal: string              // 费曼目标："解释 RAG 是什么、为什么需要它"
  concepts: Concept[]       // 线性排列
  feynmanTask: FeynmanTask
  order: number             // MVP 固定为 1
}
```

#### Concept

```typescript
interface Concept {
  id: string
  moduleId: string          // FK → Module
  name: string              // "Attention"
  definition: string        // 一句话定义
  type: 'fact' | 'procedure' | 'theory'
  quizSeries: QuizSeries
  order: number             // 在 Module 中的顺序
}
```

#### QuizSeries

```typescript
interface QuizSeries {
  conceptId: string
  quizzes: Quiz[]           // 按 Quiz Ladder 排列
}
```

#### Quiz

```typescript
interface Quiz {
  id: string
  conceptId: string
  ladderLevel: 1 | 2 | 3 | 4   // Recognition / Discrimination / Association / Application
  expressionLevel: 1 | 2 | 3   // 表达自由度层级
  interactionType: 'choice' | 'sorting' | 'fill_blank' | 'sentence'
  stem: string                 // 题干
  options?: string[]           // 选项（choice/sorting）
  answer: string               // 正确答案
  explanation: string          // 反馈解释
  distractors: string[]        // 干扰项（用于动态生成同类题）
}
```

#### FeynmanTask

```typescript
interface FeynmanTask {
  moduleId: string
  steps: FeynmanStep[]         // 低摩擦阶梯
  finalPrompt: string          // 最终开放输出任务
  rubric: string[]             // 评分关键点
}

interface FeynmanStep {
  order: number
  type: 'choice' | 'fill_blank' | 'sentence'
  stem: string
  options?: string[]
  answer: string
  explanation: string
}
```

#### AttemptRecord（运行时）

```typescript
interface AttemptRecord {
  id: string
  userId: string
  quizId: string
  userAnswer: string
  score: number               // 0-100
  gaps: string[]              // 遗漏的关键点
  timestamp: timestamp
}
```

#### Mastery（运行时）

```typescript
interface Mastery {
  userId: string
  moduleId: string
  moduleCompletion: number    // 0-100
  conceptMastery: {
    conceptId: string
    mastery: number           // 0-100，基于答对率
  }[]
  feynmanCompleted: boolean
  feynmanScore?: number
}
```

---

## 第七章 Prompt 设计

本章定义各核心 Agent 的 Prompt 设计原则与模板框架。具体 Prompt 在实现时迭代调优。

### 7.1 设计原则

1. **每个 Agent 只做一件事**：Prompt 职责单一，输出格式严格（JSON Schema）
2. **输出必须结构化**：所有 Agent 输出 JSON，不允许自由文本
3. **约束表达自由度**：Quiz Agent 的 Prompt 必须明确指定目标 `expressionLevel`，不允许 Agent 自行决定
4. **干扰项必须合理**：选择题的 distractor 必须是" plausible but wrong"，不能是显而易见的错误

### 7.2 核心 Prompt 框架

#### Concept Agent Prompt

```
角色：你是一个知识结构化专家。

输入：一段 Markdown 文本。

任务：从中提取原子概念。每个概念必须满足：
1. 可以用一句话定义
2. 是一个独立的知识单元（去掉它，整体理解会缺失）
3. 不超过 3 个概念（贪多会降低质量）

输出格式（JSON）：
{
  "concepts": [
    {
      "name": "概念名",
      "definition": "一句话定义",
      "type": "fact | procedure | theory",
      "keyPoints": ["关键点1", "关键点2"]
    }
  ]
}

约束：
- definition 不超过 30 字
- keyPoints 每个不超过 15 字
- 不要提取过于琐碎的细节
```

#### Quiz Agent Prompt

```
角色：你是一个学习体验设计师，擅长设计低摩擦的练习题。

输入：
- 概念：{concept.name}
- 定义：{concept.definition}
- 关键点：{concept.keyPoints}
- 目标层级：{ladderLevel}（Recognition/Discrimination/Association/Application）
- 目标表达自由度：{expressionLevel}（1=纯选择，2=选择+排序，3=选择+填空）
- 交互类型：{interactionType}

任务：生成 1 道 Quiz，满足：
1. 题干清晰，用户不需要思考"这道题要我做什么"
2. 4 个选项，其中 1 个正确，3 个为 plausible distractor
3. 干扰项必须来自常见的误解或相近概念，不能是荒谬选项
4. 正确答案不能通过常识排除法猜出
5. explanation 必须解释"为什么对"和"为什么错"

层级指导：
- Recognition：让用户"认出来"概念的特征
- Discrimination：让用户在相似项中"分辨"正误
- Association：让用户理解概念的"因果/语境"
- Application：让用户把概念"迁移"到新场景

输出格式（JSON）：
{
  "stem": "题干",
  "options": ["A", "B", "C", "D"],
  "answer": "B",
  "explanation": "为什么是 B，其他为什么不对",
  "distractors": ["用于生成同类题的干扰项特征"]
}
```

#### Feynman Agent Prompt

```
角色：你是一个费曼学习法教练。

输入：
- Module 标题：{module.title}
- Module 目标：{module.goal}
- 模块包含的概念：{module.concepts}

任务：生成一个费曼任务序列，把开放式表达编译为低摩擦阶梯。

序列结构（6 步）：
Step 1: "如果让你解释 {goal}，第一句话应该是什么？" → 4 选项
Step 2: "接下来应该解释什么方向？" → 4 选项
Step 3: "如果对方没懂，你会举什么例子？" → 4 选项
Step 4: "下面四个完整解释，哪一个最好？" → 4 选项
Step 5: "请补充一句话：____" → 短句填空
Step 6 (Final): "现在请用你自己的话完整解释 {goal}" → 开放输出

要求：
- Step 1-4 的选项必须覆盖不同的解释策略，让用户内化"如何组织一个解释"
- Step 4 的四个选项应该是真实的、不同质量的解释，让用户学会判断
- Final 的 rubric 必须列出 3-5 个关键点，用于 AI 评分

输出格式（JSON）：
{
  "steps": [ ... ],
  "finalPrompt": "...",
  "rubric": ["关键点1", "关键点2", ...]
}
```

#### Feedback Agent Prompt（运行时）

```
角色：你是一个学习反馈专家。

输入：
- Quiz 题干：{quiz.stem}
- 正确答案：{quiz.answer}
- 标准解释：{quiz.explanation}
- 用户答案：{userAnswer}

任务：评估用户答案，输出：
1. score：0-100（完全正确=100，部分正确=50，错误=0）
2. gaps：用户遗漏的关键概念点
3. next_action：advance（答对，进入下一题）/ retry（答错，同类型再来）

输出格式（JSON）：
{
  "score": 100,
  "gaps": [],
  "next_action": "advance",
  "feedback_text": "给用户的即时反馈（不超过 50 字，鼓励性语气）"
}
```

---

## 第八章 产品路线图

### V1：Markdown Learning Compiler（MVP）

- **目标**：验证核心体验闭环
- **范围**：见第五章 MVP
- **输入**：仅 Markdown
- **输出**：单 Module，Choice/Sorting/Fill Blank + Module Feynman
- **关键里程碑**：用户主观掌握感评分 > 4/5

### V2：多 Module 课程 + 概念关联

- **多 Module**：一次编译生成完整课程（3-7 个 Module），Module 间线性解锁
- **Module Challenge 强化**：跨 Module 的综合题
- **掌握度可视化**：Mastery Graph（如 Prompt★★★★★、RAG★★★），让用户看到自己的能力地图
- **Today's Mission**：每日推荐学习任务，开始像多邻国

### V3：多输入格式

- **PDF 导入**：含 OCR 能力
- **网页导入**：URL → 正文提取
- **视频导入**：ASR → 文本 → 编译

### V4：Adaptive Learning（自适应）

- **用户画像**：长期记忆模型（BKT/DKT）
- **难度自适应**：根据用户历史表现动态调整 Quiz 难度
- **间隔重复**：基于遗忘曲线的复习推荐

### V5：Knowledge Graph（知识图谱）

- **概念依赖图**：Concept 间的 prerequisite 关系
- **个性化路径**：根据已有掌握度跳过已知概念
- **跨课程关联**：不同课程的概念互相关联

### V6：多人学习

- **学习小组**：共同完成 Module
- **同伴互评**：费曼输出的同伴评分
- **排行榜**：掌握度排名（可选）

---

## 第九章 Learning Psychology（学习心理学）

本章是产品的理论基础。它不是技术章节，而是解释**为什么这个产品能让用户坚持学、真的学会**。

### 9.1 Expression Cost（表达成本）

> **不是知识难，而是表达难。**

学习的最大障碍不是认知层面的"看不懂"，而是表达层面的"说不出来"。一个用户可以读懂 RAG 的原理、可以认出 RAG 的架构图，但当他被要求"用你自己的话解释 RAG"时，大脑会瞬间空白。

这种空白不是因为他不懂，而是因为**"用自己的话组织输出"是一种完全不同的认知能力**，它需要工作记忆同时完成"检索知识 + 组织结构 + 选择词汇 + 监控表达"四件事。

传统学习产品要么不要求表达（视频、阅读），要么突然要求完整表达（"请写一段话"），后者直接触发表达恐惧，导致放弃。

**本产品的解法**：把表达拆解为从 Level 1（纯选择）到 Module End（完整费曼）的连续曲线，让表达能力的成长**无感、连续、永远在成功区间内**。

### 9.2 Continuous Success（连续成功）

> **用户应该一直成功，而不是一直被考。**

游戏之所以让人上瘾，核心机制是"持续的正反馈"。每一次操作都有奖励，每一次失败都有补救。多邻国把这个机制搬到了语言学习上。

本产品要求：**用户在整个学习路径中，成功率应保持在 70-85%**。

- 低于 70%：用户感到挫败，放弃
- 高于 85%：用户感到无聊，也放弃
- 70-85%：用户处于"心流"状态（Flow），既不焦虑也不无聊

实现方式：
- 前 2 题永远是 Level 1（识别），确保开局成功
- 答错不惩罚，而是显示解释 + 提供同类型新题
- Quiz 难度由 Quiz Ladder 的层级控制，而非由 AI 即时生成超纲题

### 9.3 Quiz as Scaffold（Quiz 是脚手架）

> **Quiz 不是考试，Quiz 帮助表达。**

这是本产品与传统 Quiz 工具的根本分歧。传统 Quiz 的目的是"评估"（Assessment），本产品的 Quiz 目的是"辅助构建"（Scaffolding）。

脚手架理论（Vygotsky 的 ZPD）指出：学习者在"最近发展区"内，如果有适当的支持，可以完成独立无法完成的任务。本产品的 Quiz 就是这种支持——

- 用户独立无法写出"解释 Attention 的完整段落"
- 但通过 30 道低摩擦 Quiz，用户在每一步都被支撑
- 走完 Quiz，用户发现自己能写出那个段落了
- **脚手架（Quiz）随后可以撤除，但能力（表达）留下了**

### 9.4 Expression Freedom（表达自由）

> **用户真正成长的是表达能力，不是选择能力。**

这是表达自由度曲线（2.5 节）的心理学基础。

传统选择题训练的是"识别正确答案"的能力。这种能力的迁移价值很低——现实生活中没有人给你四个选项让你选。

真正的学习能力是"在没有提示的情况下，自主组织语言、结构化地表达理解"。这种能力只能通过**逐渐减少支持、逐渐增加自由度**来训练。

表达自由度曲线的设计正是基于此：它让用户从"100% 被支撑"开始，逐步走向"100% 自主表达"，中间没有任何断裂。用户的表达能力在无意识中成长。

### 9.5 Module Mastery（模块掌握）

> **为什么费曼放在 Module 最后，而不是 Concept 最后。**

费曼学习法的本质是"用简单的语言完整解释一个概念"。但"一个概念"的粒度很关键：

- 如果费曼放在每个 Concept 之后（如"解释什么是 Embedding"），用户做的是**概念复述**——这是记忆层面的任务。
- 如果费曼放在 Module 之后（如"解释 RAG 为什么会出现、它解决了什么问题"），用户做的是**知识组织**——这是理解层面的任务。

知识组织（Knowledge Organization）要求用户建立概念之间的关联，形成一个连贯的心智模型。这种能力才是"掌握"的真正标志。

心理学研究（Bransford et al., 2000）表明：专家与新手的区别不在于知道多少事实，而在于**事实如何组织**。新手拥有孤立的事实，专家拥有 interconnected 的心智模型。

因此，Module 级别的费曼验证的是"心智模型是否形成"，而不是"概念是否记住"。这是本产品最关键的学习心理学决策。

### 9.6 Desirable Difficulty（合理困难）

> **学习需要一些困难，但不能太多。**

Robert Bjork 提出的"Desirable Difficulty"理论指出：适当的困难能增强长期记忆，但过度的困难会导致放弃。

本产品的 Quiz Ladder 天然实现了这个原则：

- Level 1-2（识别/辨别）：低困难，确保成功感和基线理解
- Level 3-4（联想/应用）：合理困难，促进深度加工
- Module Challenge：跨概念综合，进一步增加合理困难
- Feynman Step 1-4：低摩擦脚手架，降低费曼的表达困难
- Feynman Final：最大的合理困难，但因为前序铺垫，处于可达成区间

整个曲线的困难度设计，始终保持在 ZPD（最近发展区）内。

---

## 附录 A：术语表

| 术语 | 定义 |
|------|------|
| Knowledge Compiler | 将原始知识编译为训练系统的核心引擎 |
| Learning Module | 自包含的学习单元，走完即掌握 |
| Concept | 不可再分的原子知识点 |
| Quiz Series | 一个 Concept 内的 Quiz 微循环 |
| Quiz Ladder | Concept 内的认知层级：识别→辨别→联想→应用 |
| Expression Freedom Curve | 表达自由度曲线：纯选择→排序→填空→短句→完整费曼 |
| Module Feynman | 模块末尾的费曼验证任务 |
| Interaction Primitive | Quiz 的本质：最低成本的交互方式 |
| Mastery | 用户对知识的掌握度，最终以费曼标准衡量 |
| Expression Cost | 表达成本：用户组织输出时的心理负担 |

## 附录 B：与现有产品的差异

| 维度 | 传统 Quiz 工具 | AI 出题器 | 多邻国 | **本产品** |
|------|--------------|----------|--------|-----------|
| 核心机制 | 题库刷题 | 知识→生成题 | 语言闯关 | 知识→编译→训练系统 |
| 表达成本 | 突然要求完整输出 | 突然要求完整输出 | 极低（选词为主） | **连续渐进提升** |
| 知识结构 | 无 | 无 | 课程固定 | **自动拆解为 Module+Concept** |
| 费曼验证 | 无 | 无 | 无 | **Module 末尾费曼** |
| 适用范围 | 通用 | 通用 | 仅语言 | **通用概念性知识** |
| 学习科学 | 间隔重复 | 无 | 游戏化 | **表达自由度理论 + 费曼 + Bloom** |

---

> **文档结束**
>
> 本规格说明书定义了 AI Learning Compiler 的完整产品设计。后续的 PRD、UI 设计、技术架构、Prompt 工程均应从本文档拆解，并遵守第一章的五条产品原则与第九章的学习心理学基础。
>
> 任何对本文档的修改都应经过充分讨论，因为本文件是整个项目的设计宪法。
