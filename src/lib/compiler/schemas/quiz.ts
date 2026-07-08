// Quiz Agent 输出 Schema
// 对应 lib/compiler/prompts/quiz.md
// PRD §7.6
import { z } from 'zod'

export const distractorItemSchema = z.object({
  text: z.string().min(1),
  type: z.enum([
    'A_Overcorrection',
    'B_Outdated',
    'C_WrongContext',
    'D_Incomplete',
    'E_Misunderstanding',
  ]),
  used: z.boolean(),
})

// 主体 schema：含 options union 字段（一次性定义完整结构）
const quizCoreSchema = z.object({
  id: z.string().regex(/^concept-\d+:slot-\d+$/, 'id 必须为 concept-N:slot-N 格式'),
  conceptId: z.string().regex(/^concept-\d+$/),
  ladderLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  expressionLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  interactionType: z.enum(['choice', 'sorting', 'fill_blank']),
  stem: z.string().min(5, 'stem 至少 5 字符'),
  options: z.union([z.array(z.string().min(1)).min(3).max(5), z.null()]),
  answer: z.string().min(1),
  explanation: z.string().min(20, 'explanation 至少 20 字').max(500, 'explanation ≤ 500 字'),
  distractors: z.array(distractorItemSchema).min(3, '至少 3 个 distractor 候选'),
})

/**
 * 单道 Quiz 的校验 Schema（不含外层 reasoning），
 * 同时被 quizSchema（单题输出）和 quizBatchSchema（批量输出）复用。
 */
export const quizItemSchema = quizCoreSchema.superRefine((val, ctx) => {
  // 按 interactionType 校验 options
  if (val.interactionType === 'choice') {
    if (!Array.isArray(val.options)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Choice 题 options 必须是数组（不能为 null）`,
        path: ['options'],
      })
    } else if (val.options.length !== 4) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Choice 题必须有 4 个选项，实际：${val.options.length}`,
        path: ['options'],
      })
    } else {
      // options[0] 必须等于 answer（ClassBuild 模式：正解永远放第一，前端打乱）
      if (val.options[0] !== val.answer) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Choice 题 options[0] 必须等于 answer（正解永远放第一，前端打乱），options[0]="${val.options[0]}", answer="${val.answer}"`,
          path: ['options', 0],
        })
      }
      // 选项不能完全相同
      const uniqueOpts = new Set(val.options)
      if (uniqueOpts.size !== val.options.length) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `选项存在重复`,
          path: ['options'],
        })
      }
    }
  } else if (val.interactionType === 'sorting') {
    if (!Array.isArray(val.options) || val.options.length < 3 || val.options.length > 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Sorting 题必须有 3-5 个选项，实际：${Array.isArray(val.options) ? val.options.length : 'null'}`,
        path: ['options'],
      })
    }
  } else if (val.interactionType === 'fill_blank') {
    if (val.options !== null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Fill Blank 题 options 必须为 null`,
        path: ['options'],
      })
    }
  }

  // 至少 3 个 distractor 标记为 used=true
  const usedCount = val.distractors.filter((d) => d.used).length
  if (usedCount < 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `至少 3 个 distractor 必须 used=true（实际 ${usedCount}）`,
      path: ['distractors'],
    })
  }

  // used=true 的 distractor 文本不能与 answer 相同
  const usedTexts = val.distractors.filter((d) => d.used).map((d) => d.text)
  if (usedTexts.includes(val.answer)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `distractor.text 不能等于 answer（会导致两个选项都是正解）`,
      path: ['distractors'],
    })
  }
})

/** 单题输出（含 reasoning CoT + 一道 quiz） */
export const quizSchema = z.object({
  reasoning: z.string().min(1, '私有 CoT 不能为空'),
  quiz: quizItemSchema,
})

export type QuizAgentOutput = z.infer<typeof quizSchema>
export type QuizItem = z.infer<typeof quizItemSchema>
