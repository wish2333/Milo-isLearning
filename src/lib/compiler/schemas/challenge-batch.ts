/**
 * Challenge Batch Agent 输出 Schema
 *
 * 对应 lib/compiler/prompts/challenge-batch.md / PRD FR-05 Module Challenge
 *
 * Challenge 题 = 跨概念综合题，在所有 Concept 完成后、Feynman 之前出现。
 * 与普通 Quiz 的区别：
 *   - id 格式 challenge-N（非 concept-N:slot-M）
 *   - conceptId 固定为 'challenge'（不绑定单个 Concept）
 *   - 必须显式涉及 ≥ 2 个 Concept（involvedConceptIds）
 *   - 仅 Choice / Sorting（不含 Fill Blank）
 *   - ladderLevel 固定为 3（Application，综合应用）
 */
import { z } from 'zod'

import { distractorItemSchema } from './quiz'

/**
 * 单道 Challenge Quiz 的校验 Schema。
 *
 * 不继承 quizItemSchema——因 id / conceptId 正则规则不同，
 * 且需要 involvedConceptIds 字段。
 */
const challengeQuizItemSchema = z
  .object({
    id: z.string().regex(/^challenge-\d+$/, 'id 必须为 challenge-N 格式'),
    conceptId: z.literal('challenge'),
    ladderLevel: z.literal(3),
    expressionLevel: z.union([z.literal(1), z.literal(2)]),
    interactionType: z.enum(['choice', 'sorting']),
    stem: z.string().min(5, 'stem 至少 5 字符'),
    options: z.array(z.string().min(1)).min(3).max(5),
    answer: z.string().min(1),
    explanation: z.string().min(20, 'explanation 至少 20 字').max(500, 'explanation ≤ 500 字'),
    distractors: z.array(distractorItemSchema).min(3, '至少 3 个 distractor 候选'),
    /** Challenge 题特有：显式声明涉及的 Concept id（≥ 2） */
    involvedConceptIds: z.array(z.string()).min(2, 'Challenge 题必须涉及 ≥ 2 个 Concept'),
  })
  .superRefine((val, ctx) => {
    // Choice 题：4 选项，options[0] = answer
    if (val.interactionType === 'choice') {
      if (val.options.length !== 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Choice 题必须有 4 个选项，实际：${val.options.length}`,
          path: ['options'],
        })
      } else if (val.options[0] !== val.answer) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Choice 题 options[0] 必须等于 answer（正解永远放第一，前端打乱）`,
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
    } else if (val.interactionType === 'sorting') {
      if (val.options.length < 3 || val.options.length > 5) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Sorting 题必须有 3-5 个选项，实际：${val.options.length}`,
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

export const challengeBatchSchema = z.object({
  reasoning: z.string().min(1, '私有 CoT 不能为空'),
  quizzes: z.array(challengeQuizItemSchema).min(3).max(5),
})

export type ChallengeBatchAgentOutput = z.infer<typeof challengeBatchSchema>
