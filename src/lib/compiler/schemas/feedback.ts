// Feedback Agent 输出 Schema（运行时）
// 对应 lib/compiler/prompts/feedback.md
// PRD §7.8
import { z } from 'zod'

export const feedbackSchema = z
  .object({
    reasoning: z.string().max(100, 'reasoning ≤ 100 字').optional(),
    score: z.union([z.literal(0), z.literal(50), z.literal(100)]),
    gaps: z.array(z.string().max(30)).max(2, 'gaps ≤ 2 条'),
    next_action: z.enum(['advance', 'retry']),
    feedback_text: z
      .string()
      .min(5, 'feedback_text 至少 5 字')
      .max(50, 'feedback_text ≤ 50 字')
      .refine(
        (s) => !/(错误|失败|不正确|错了|不行|很差)/.test(s),
        'feedback_text 禁用强烈负面词：错误/失败/不正确/错了/不行/很差',
      ),
  })
  .superRefine((val, ctx) => {
    // score 与 next_action 一致性
    if (val.score >= 80 && val.next_action !== 'advance') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `score=${val.score} 应触发 next_action='advance'，实际：${val.next_action}`,
        path: ['next_action'],
      })
    }
    if (val.score < 80 && val.next_action !== 'retry') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `score=${val.score} 应触发 next_action='retry'，实际：${val.next_action}`,
        path: ['next_action'],
      })
    }
    // 答对时 gaps 应为空
    if (val.score === 100 && val.gaps.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `score=100 时 gaps 应为空数组`,
        path: ['gaps'],
      })
    }
  })

export type FeedbackAgentOutput = z.infer<typeof feedbackSchema>
