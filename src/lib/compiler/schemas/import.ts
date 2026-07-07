// Import Agent 输出 Schema
// 对应 lib/compiler/prompts/import.md
// PRD §7.1
import { z } from 'zod'

export const importSchema = z.object({
  normalizedText: z.string().min(1, '标准化文本不能为空'),
  stats: z.object({
    originalLength: z.number().int().nonnegative(),
    normalizedLength: z.number().int().nonnegative(),
    removedElements: z.number().int().nonnegative(),
  }),
}).superRefine((val, ctx) => {
  if (val.stats.normalizedLength > val.stats.originalLength * 1.2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'normalizedLength 异常大于 originalLength，可能未做标准化',
      path: ['stats', 'normalizedLength'],
    })
  }
})

export type ImportAgentOutput = z.infer<typeof importSchema>
