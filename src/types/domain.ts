/**
 * AI Learning Compiler 领域模型
 *
 * 对应：
 *   - docs/PRD.md §8 数据模型（基础契约）
 *   - docs/Technical-Specification.md §5 运行时扩展（state machine / retry 语义）
 *
 * 当本文档与 PRD §8 冲突时：以 PRD §8 为基础形状，Tech Spec §5 为运行时扩展，
 * 扩展点处显式标注（如 AttemptRecord.originalQuizId、ProgressState.stage）。
 */

// =================================================================
// 编译产物（持久化）
// =================================================================

/**
 * 内容来源标记 — 用于展示模式与实用模式的题库分离。
 *
 * - `'showcase'`：从 public/showcase-modules/ 加载的展示题库
 * - `'user'` 或 `undefined`：用户编译/导入的题库（向后兼容旧数据）
 *
 * listStoredModules / library 页面按 APP_MODE 过滤：
 *   展示模式只看 showcase，实用模式只看 user。
 */
export type ContentOrigin = 'showcase' | 'user'

/**
 * 用户导入的原始知识材料
 */
export interface KnowledgeSource {
  id: string
  type: 'markdown'
  content: string
  createdAt: number
}

/**
 * 学习模块（MVP 编译产物 = 单 Module）
 *
 * `order` 字段为多 Module 预留，MVP 固定为 1（PRD §10.1）。
 */
export interface Module {
  id: string
  sourceId: string
  title: string
  intro: string
  goal: string
  concepts: Concept[]
  feynmanTask: FeynmanTask
  order: number
  /** Module Challenge 综合题（3-5 道），编译产物。可选字段保持向后兼容 */
  challengeQuizzes?: Quiz[]
  /** 编译产物生成时间戳（M7.5 package 元数据，可选以兼容旧数据） */
  generatedAt?: number
  /** 通过 Library 导入的时间戳（M7.5 package 元数据，可选以兼容旧数据） */
  importedAt?: number
  /** 内容来源标记（展示模式 vs 实用模式分离）。undefined = user（向后兼容） */
  origin?: ContentOrigin
}

/**
 * 概念（Module 内的原子学习单元）
 */
export interface Concept {
  id: string
  moduleId: string
  name: string
  definition: string
  type: 'fact' | 'procedure' | 'theory'
  keyPoints: string[]
  quizSeries: QuizSeries
  order: number
}

/**
 * 单个 Concept 内的 Quiz 序列
 */
export interface QuizSeries {
  conceptId: string
  quizzes: Quiz[]
}

/**
 * 单道练习题
 *
 * - `ladderLevel`：MVP 仅 3 层（1=Recognition, 2=Discrimination, 3=Application）
 *   Association 层级（PRD §10.2）推迟到 V2。
 * - `expressionLevel`：1=Choice, 2=Sorting, 3=Fill Blank
 * - `interactionType`：决定前端渲染组件
 */
export interface Quiz {
  id: string
  conceptId: string
  ladderLevel: 1 | 2 | 3
  expressionLevel: 1 | 2 | 3
  interactionType: 'choice' | 'sorting' | 'fill_blank'
  stem: string
  /** Choice 题：4 选项；Sorting 题：3-5 选项；Fill Blank 题：null */
  options?: string[] | null
  answer: string
  explanation: string
  distractors: string[]
  /**
   * Challenge 综合题涉及的 Concept id 列表（M7.5 质量报告使用）。
   * 仅 Challenge 题有值；Concept 题 undefined。可选以兼容旧数据。
   */
  involvedConceptIds?: string[]
  /** 题目前背景材料。M7.6 新增，可选以兼容旧 Module。 */
  background?: string
  /** Fill Blank 或开放回答的语境提示。 */
  answerHint?: string
  /** 可接受答案变体，主要用于 Fill Blank。 */
  acceptableAnswers?: string[]
  /** 常见误区，用于错误反馈补强。 */
  misconception?: string
  /** 延伸知识，默认可折叠展示。 */
  extendedKnowledge?: string
  /** 运行时判分模式。未设置时按题型默认。 */
  evaluationMode?: 'exact' | 'normalized' | 'semantic'
  /** 用户标记为忽略（F41）。忽略的题不计入掌握度、不在学习/重刷序列展示。undefined = 未忽略。 */
  ignored?: boolean
}

/**
 * 模块费曼任务（6 步序列 + Rubric）
 *
 * Step 序列约束（PRD §7.7 / FR-06）：
 *   - Step 1-4：Choice（解释开头 / 方向 / 例子 / 最佳完整解释判断）
 *   - Step 5：Fill Blank（短句补全）
 *   - Step 6：开放输出（不在 steps 数组内，由 finalPrompt 渲染）
 */
export interface FeynmanTask {
  moduleId: string
  /** 恰好 6 个 Step（第 6 项作为元数据占位） */
  steps: FeynmanStep[]
  finalPrompt: string
  rubric: string[]
}

export interface FeynmanStep {
  order: 1 | 2 | 3 | 4 | 5 | 6
  type: 'choice' | 'fill_blank'
  stem: string
  /** Choice 步：4 选项；Fill Blank 步：null */
  options?: string[] | null
  answer: string
  explanation: string
  answerHint?: string
  acceptableAnswers?: string[]
  misconception?: string
  extendedKnowledge?: string
  evaluationMode?: 'exact' | 'normalized' | 'semantic'
}

// =================================================================
// 运行时数据（LocalStorage 持久化）
// =================================================================

/**
 * 单次作答记录
 *
 * 扩展点（Tech Spec §5.3）：
 *   - `originalQuizId`：Concept 槽位 id（用于 Mastery 聚合），格式 `{conceptId}:{slotIndex}`
 *   - `attemptVersion`：0=首次，N=第 N 次重试
 *
 * 这两字段允许 Mastery 计算跳过重试，统计"首次答对率"（FR-07）。
 */
export interface AttemptRecord {
  id: string
  /** 当前实际作答的 quiz（可能是重试生成的新题） */
  quizId: string
  /** 概念位置上的"槽位" id，格式 `{conceptId}:{slotIndex}` */
  originalQuizId: string
  /** 0=首次，N=第 N 次重试 */
  attemptVersion: number
  userAnswer: string
  score: number
  gaps: string[]
  nextAction: 'advance' | 'retry'
  timestamp: number
  /** 用户自报"蒙对"，默认 undefined/false。蒙对题不计入真正掌握度。 */
  guessed?: boolean
  /** 提交时间戳（F13 学习时长统计） */
  answeredAt?: number
  /** 本题耗时毫秒（F13 学习时长统计） */
  timeSpentMs?: number
}

/**
 * 模块费曼整体作答记录
 */
export interface FeynmanAttempt {
  moduleId: string
  stepResults: { stepOrder: number; score: number }[]
  finalOutput?: string
  finalScore?: number
  finalGaps?: string[]
  submittedAt: number
}

/**
 * Module 掌握度（Mastery Tracking，FR-07）
 *
 * 计算逻辑（Tech Spec §5.4 computeMastery 纯函数）：
 *   - `conceptMastery` = Concept 内所有槽位的"首次答对率"
 *   - `moduleCompletion` = 已完成 Quiz 数 / 总 Quiz 数（含费曼 6 步）
 *   - `feynmanScore` = Step 6 Rubric 总分（提交前为 undefined）
 */
export interface Mastery {
  moduleId: string
  /** 0-100 */
  moduleCompletion: number
  /** Concept 首次答对率（含蒙对，乐观值） */
  conceptMastery: { conceptId: string; mastery: number }[]
  /** Concept 首次答对率（排除蒙对，真实掌握度） */
  conceptMasteryExcludingGuessed?: { conceptId: string; mastery: number }[]
  /** Challenge 题首次答对率（含蒙对，无 Challenge 题时为 undefined） */
  challengeMastery?: number
  /** Challenge 题首次答对率（排除蒙对，无 Challenge 题时为 undefined） */
  challengeMasteryExcludingGuessed?: number
  feynmanCompleted: boolean
  feynmanScore?: number
}

/**
 * 学习进度状态（Progress Persistence，FR-08）
 *
 * 扩展点（Tech Spec §5.1）：`stage` 用 discriminated union 替代 PRD §8 的字符串字段，
 * 让非法转移在编译期被拒绝。
 */
export type ModuleStage =
  | { kind: 'module_intro' }
  | { kind: 'concept'; conceptIndex: number; quizIndex: number; reviewSlots?: string[] }
  | { kind: 'challenge'; quizIndex: number }
  | { kind: 'feynman_intro' }
  | { kind: 'feynman_step'; stepOrder: 1 | 2 | 3 | 4 | 5 }
  | { kind: 'feynman_final' }
  | { kind: 'done' }

export interface ProgressState {
  moduleId: string
  stage: ModuleStage
  updatedAt: number
}

// =================================================================
// 主题归类（M8.1）
// =================================================================

/**
 * 主题 — 一组有序的题库引用，用于主题刷题模式。
 *
 * 一对多关系：一个题库最多归属一个主题（由 UI 层保证）。
 * 删除主题不删除题库本身，题库变为未归属。
 */
export interface Topic {
  id: string
  name: string
  description?: string
  /** 有序的题库 ID 列表，决定主题刷题的顺序 */
  moduleIds: string[]
  createdAt: number
  updatedAt: number
  /** 内容来源标记（展示模式 vs 实用模式分离）。undefined = user（向后兼容） */
  origin?: ContentOrigin
}

/**
 * 主题会话中单个题库的状态。
 */
export type ModuleTopicStatus = 'pending' | 'in_progress' | 'done' | 'skipped'

/**
 * 主题刷题会话 — 持久化到 LocalStorage，支持刷新恢复。
 *
 * 编排在 ModuleStage 状态机之上：
 * 每个 module 仍走完整的 module_intro → … → done 流程，
 * 主题层在 done 阶段拦截，决定「进入下一个模块」还是「主题完成」。
 */
export interface TopicSession {
  topicId: string
  moduleIds: string[]
  currentIndex: number
  moduleStatus: Record<string, ModuleTopicStatus>
  startedAt: number
}

/**
 * 主题级别聚合掌握度（F23 / PB.6）
 *
 * 通过加权平均各模块的 moduleCompletion 计算主题整体掌握度。
 * 权重 = 模块总测验数（Concept quiz + Challenge quiz + Feynman steps）。
 */
export interface TopicMastery {
  topicId: string
  /** 加权平均掌握度 0-100 */
  aggregateMastery: number
  moduleMasteries: Array<{
    moduleId: string
    moduleTitle: string
    mastery: Mastery
    weight: number
  }>
  totalQuizzes: number
  completedModules: number
}

/**
 * 错题重刷的筛选维度。
 * - 'all'：错题 + 蒙对题（当前行为）
 * - 'wrong'：仅错题（score < 80）
 * - 'guessed'：仅蒙对题（guessed === true）
 */
export type ReviewFilter = 'all' | 'wrong' | 'guessed'

/**
 * 主题进度快照（F22 主题进度恢复）。
 * exitSession 时写入，startSession 时读取合并。
 * 独立于 TopicSession（运行时会话状态），用于 TopicCard 展示"上次进度"。
 */
export interface TopicProgress {
  topicId: string
  completedModuleIds: string[]
  /** F24: Modules the user skipped. Backward-compatible: absent = empty. */
  skippedModuleIds?: string[]
  lastVisitedAt: number
}

// =================================================================
// 便捷类型导出
// =================================================================

/** Concept id 与 slot 索引组合而成的"槽位 id"（用于 AttemptRecord.originalQuizId） */
export type QuizSlotId = `${string}:${number}`

/** 所有 Ladder Level 取值 */
export type LadderLevel = 1 | 2 | 3

/** 所有 Expression Level 取值 */
export type ExpressionLevel = 1 | 2 | 3

/** 所有 Quiz 交互类型 */
export type InteractionType = 'choice' | 'sorting' | 'fill_blank'
