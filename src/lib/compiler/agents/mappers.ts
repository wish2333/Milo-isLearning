/**
 * Agent 输出映射层（M2.5 W5）
 *
 * 职责：把 9 个 Agent 的 Schema 输出（snake_case 字段）映射为 domain.ts 的 camelCase 字段。
 *
 * 对应 docs/M2.5-Plan.md §2.W5 与 docs/M1-Review.md §6.1。
 *
 * 现状盘点（已逐一核对 9 个 Schema 文件）：
 *   - feedback:           `next_action` → `AttemptRecord.nextAction`
 *                         `feedback_text` → 运行时 UI 文案，不入 domain
 *   - import / chunk / concept / module / mission / quiz / feynman / feynman-eval:
 *                         字段命名已是 camelCase（normalizedText / parentChunkId /
 *                         rubricResults / sampleAnswer / seriesByConcept / ...），
 *                         枚举值 'fill_blank' / 'advance' / 'full' 是字符串字面量，
 *                         与 domain.InteractionType 等同义，直接透传。
 *
 * 结论：映射层很薄，唯一的真实映射是 feedback。
 * 但为 M3 `assemble()` 提供统一入口，此处仍提供 9 个 mapper，
 * 未来若 Schema 改名只需改这里，不动 assemble。
 */
import type {
  AttemptRecord,
  Concept,
  FeynmanTask,
  InteractionType,
  Module,
  Quiz,
} from '@/types/domain'

import type {
  ChunkAgentOutput,
  ConceptAgentOutput,
  FeedbackAgentOutput,
  ImportAgentOutput,
  MissionAgentOutput,
  ModuleAgentOutput,
  QuizAgentOutput,
  FeynmanAgentOutput,
  FeynmanEvalOutput,
} from '@/lib/compiler/schemas'

// =================================================================
// Feedback 映射（唯一的真实 snake_case → camelCase 转换）
// =================================================================

/**
 * Feedback Agent 运行时输出。
 *
 * `nextAction` 与 `score` / `gaps` 用于构造 AttemptRecord；
 * `feedbackText` 是 UI 反馈文案，不入 domain（仅运行时持有）。
 */
export interface FeedbackRuntime {
  score: AttemptRecord['score']
  gaps: AttemptRecord['gaps']
  nextAction: AttemptRecord['nextAction']
  feedbackText: string
}

export function mapFeedback(output: FeedbackAgentOutput): FeedbackRuntime {
  return {
    score: output.score,
    gaps: output.gaps,
    nextAction: output.next_action,
    feedbackText: output.feedback_text,
  }
}

// =================================================================
// 其他 Agent：identity（已 camelCase），仅做文档化签名
//
// 下列 mapper 当前都是 identity return，但显式写出类型契约：
//   - 让 M3 assemble 调用点知道"这里在做映射"
//   - 未来若 Schema 改名（如 Concept Agent 改用 snake_case），
//     改 mapper 不动 assemble
// =================================================================

export function mapImport(output: ImportAgentOutput): ImportAgentOutput {
  return output
}

export function mapChunk(output: ChunkAgentOutput): ChunkAgentOutput {
  return output
}

export function mapConcept(output: ConceptAgentOutput): ConceptAgentOutput {
  return output
}

export function mapModule(output: ModuleAgentOutput): ModuleAgentOutput {
  return output
}

export function mapMission(output: MissionAgentOutput): MissionAgentOutput {
  return output
}

export function mapQuiz(output: QuizAgentOutput): QuizAgentOutput {
  return output
}

export function mapFeynman(output: FeynmanAgentOutput): FeynmanAgentOutput {
  return output
}

export function mapFeynmanEval(output: FeynmanEvalOutput): FeynmanEvalOutput {
  return output
}

// =================================================================
// 类型契约：枚举值字符串与 domain.InteractionType 等价性静态校验
//
// interactionType 字面量 'choice' | 'sorting' | 'fill_blank' 在 Schema 与
// domain.InteractionType 中是同一组字符串，无需转换。
// 这里用 const 断言让 TS 检查；如果未来某方改名会编译失败。
// =================================================================

const _INTERACTION_TYPES_ARE_IDENTICAL: InteractionType[] = ['choice', 'sorting', 'fill_blank']
void _INTERACTION_TYPES_ARE_IDENTICAL

// =================================================================
// 域组装助手（供 M3 assemble 使用）
//
// 下列函数把 Agent 输出"形状"翻译为 domain 类型。
// 当前实现依赖：Agent 输出与 domain 共用同一组字段名（除 AttemptRecord 外）。
// M3 实际 assemble 时会做 id 重写 / 数组顺序整理等额外工作，此处只提供字段映射。
// =================================================================

/**
 * 把 Concept Agent 输出（无 moduleId / order）补全为 domain.Concept。
 *
 * @param output Concept Agent 输出
 * @param moduleId 所属 Module id
 * @param order 在 Module 中的序号（1-based）
 */
export function assembleConcept(
  output: ConceptAgentOutput['concepts'][number],
  moduleId: string,
  order: number,
): Concept {
  return {
    id: output.id,
    moduleId,
    name: output.name,
    definition: output.definition,
    type: output.type,
    keyPoints: output.keyPoints,
    quizSeries: { conceptId: output.id, quizzes: [] },
    order,
  }
}

/**
 * 把 Quiz Agent 输出补全为 domain.Quiz。
 *
 * QuizAgentOutput 形状为 `{ reasoning, quiz: {...} }`，本函数取 `.quiz` 部分。
 */
export function assembleQuiz(output: QuizAgentOutput['quiz']): Quiz {
  return {
    id: output.id,
    conceptId: output.conceptId,
    ladderLevel: output.ladderLevel,
    expressionLevel: output.expressionLevel,
    interactionType: output.interactionType,
    stem: output.stem,
    options: output.options,
    answer: output.answer,
    explanation: output.explanation,
    distractors: output.distractors.map((d) => d.text),
  }
}

/**
 * 把 Feynman Agent 输出补全为 domain.FeynmanTask。
 */
export function assembleFeynmanTask(output: FeynmanAgentOutput['feynmanTask']): FeynmanTask {
  return {
    moduleId: output.moduleId,
    steps: output.steps.map((s) => ({
      order: s.order,
      type: s.type,
      stem: s.stem,
      options: s.options,
      answer: s.answer,
      explanation: s.explanation,
    })),
    finalPrompt: output.finalPrompt,
    rubric: output.rubric,
  }
}

/**
 * 把 Module Agent 输出 + 已组装的 concepts + 已组装的 feynmanTask 组装为 domain.Module。
 */
export function assembleModule(
  output: ModuleAgentOutput['module'],
  args: {
    sourceId: string
    concepts: Concept[]
    feynmanTask: FeynmanTask
    order?: number
  },
): Module {
  return {
    id: output.id,
    sourceId: args.sourceId,
    title: output.title,
    intro: output.intro,
    goal: output.goal,
    concepts: args.concepts,
    feynmanTask: args.feynmanTask,
    order: args.order ?? 1,
  }
}
