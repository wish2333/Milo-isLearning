// Module Agent 输出 Schema
// 对应 lib/compiler/prompts/module.md
// PRD §7.4
import { z } from 'zod'

export const moduleSchema = z
  .object({
    reasoning: z.string().min(1, '私有 CoT 不能为空'),
    module: z.object({
      id: z.string().regex(/^module-\d+$/, 'id 必须为 module-N 格式'),
      title: z.string().min(1).max(20, 'title ≤ 20 字'),
      intro: z
        .string()
        .min(1)
        .max(40, 'intro ≤ 40 字')
        .refine((s) => s.startsWith('完成本模块后，你能'), 'intro 必须以"完成本模块后，你能"开头'),
      goal: z.string().min(1).max(30, 'goal ≤ 30 字'),
      conceptOrder: z
        .array(z.string().regex(/^concept-\d+$/))
        .min(2)
        .max(5),
    }),
  })
  .superRefine((val, ctx) => {
    // conceptOrder 唯一性
    const ids = val.module.conceptOrder
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i)
    if (dup.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `conceptOrder 存在重复 id：${dup.join(', ')}`,
        path: ['module', 'conceptOrder'],
      })
    }
  })

export type ModuleAgentOutput = z.infer<typeof moduleSchema>
