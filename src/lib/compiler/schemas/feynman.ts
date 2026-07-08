/**
 * Feynman Agent 输出 Schema（编译期，生成 6 步 + Rubric）
 *
 * 对应 lib/compiler/prompts/feynman.md
 * PRD §7.7
 *
 * 设计说明：
 *   - 所有 6 步经过同一个 base schema，但 options/explanation 设为可选
 *     （因为 Step 6 是元数据占位，不严格需要这些字段）
 *   - 严格校验（options.length=4、explanation.min=20 等）放在 superRefine
 *     针对 Step 1-4（choice）和 Step 5（fill_blank）单独做
 *   - 这样 Step 6 不会被 base schema 挡掉
 */
import { z } from 'zod'

const feynmanStepSchema = z.object({
  order: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.literal(6),
  ]),
  type: z.enum(['choice', 'fill_blank']),
  stem: z.string().min(5),
  options: z.union([z.array(z.string().min(1)), z.null()]).optional(),
  answer: z.string().min(1),
  explanation: z.string().max(500).optional(),
})

export const feynmanSchema = z
  .object({
    reasoning: z.string().min(1, '私有 CoT 不能为空'),
    feynmanTask: z.object({
      moduleId: z.string().regex(/^module-\d+$/),
      steps: z.array(feynmanStepSchema).length(6, '必须恰好 6 步'),
      finalPrompt: z.string().min(10),
      rubric: z.array(z.string().min(5).max(80)).min(3).max(5),
    }),
  })
  .superRefine((val, ctx) => {
    const steps = val.feynmanTask.steps

    // 检查 order 连续 1-6
    const orders = steps.map((s) => s.order).sort((a, b) => a - b)
    for (let i = 0; i < 6; i++) {
      if (orders[i] !== ((i + 1) as 1 | 2 | 3 | 4 | 5 | 6)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `step.order 必须为 1,2,3,4,5,6（实际：${orders.join(',')}）`,
          path: ['feynmanTask', 'steps'],
        })
        break
      }
    }

    // Step 1-4 必须 choice + 4 options + options[0]=answer + explanation≥20
    // 注：z.array(...).length(6) 已保证 steps.length === 6，superRefine 在 length 校验通过后运行
    for (let i = 0; i < 4; i++) {
      const s = steps[i]
      if (!s) continue // 类型收窄；运行时不可达（length=6 已校验）
      if (s.type !== 'choice') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Step ${i + 1} 必须 type='choice'，实际：${s.type}`,
          path: ['feynmanTask', 'steps', String(i), 'type'],
        })
      }
      if (!Array.isArray(s.options) || s.options.length !== 4) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Step ${i + 1} 必须有 4 个 options`,
          path: ['feynmanTask', 'steps', String(i), 'options'],
        })
      } else if (s.options[0] !== s.answer) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Step ${i + 1} options[0] 必须等于 answer（正解永远放第一）`,
          path: ['feynmanTask', 'steps', String(i), 'options', '0'],
        })
      }
      if (!s.explanation || s.explanation.length < 20) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Step ${i + 1} explanation 至少 20 字`,
          path: ['feynmanTask', 'steps', String(i), 'explanation'],
        })
      }
    }

    // Step 5 (index 4) 必须 fill_blank + options=null + explanation≥20
    const step5 = steps[4]
    if (step5) {
      if (step5.type !== 'fill_blank') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Step 5 必须 type='fill_blank'`,
          path: ['feynmanTask', 'steps', '4', 'type'],
        })
      }
      if (step5.options !== null && step5.options !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Step 5 options 必须为 null`,
          path: ['feynmanTask', 'steps', '4', 'options'],
        })
      }
      if (!step5.explanation || step5.explanation.length < 20) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Step 5 explanation 至少 20 字`,
          path: ['feynmanTask', 'steps', '4', 'explanation'],
        })
      }
    }

    // Step 6 (index 5) 是元数据占位，只校验 order=6
    // options/explanation 前端不用，不做要求
    const step6 = steps[5]
    if (step6 && step6.order !== 6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Step 6 order 必须=6`,
        path: ['feynmanTask', 'steps', '5', 'order'],
      })
    }

    // Rubric 唯一性（不允许重复 rubric 点）
    const rubricSet = new Set(val.feynmanTask.rubric)
    if (rubricSet.size !== val.feynmanTask.rubric.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Rubric 存在重复点`,
        path: ['feynmanTask', 'rubric'],
      })
    }
  })

export type FeynmanAgentOutput = z.infer<typeof feynmanSchema>
