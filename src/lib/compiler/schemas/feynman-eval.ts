// Feynman Evaluator 输出 Schema（运行时，Step 6 评分）
// 对应 lib/compiler/prompts/feynman-eval.md
// PRD §7.9
import { z } from 'zod'

const rubricResultSchema = z.object({
  point: z.string().min(1),
  hit: z.enum(['full', 'partial', 'none']),
  comment: z
    .string()
    .min(5)
    .max(80, 'comment ≤ 80 字')
    .refine((s) => !/(错误|失败|不行)/.test(s), 'comment 禁用强烈负面词'),
})

export const feynmanEvalSchema = z
  .object({
    reasoning: z.string().min(1, '私有 CoT 不能为空'),
    score: z.number().int().min(0).max(100),
    rubricResults: z.array(rubricResultSchema).min(3).max(5),
    gaps: z.array(z.string()),
    sampleAnswer: z.string().min(150, 'sampleAnswer ≥ 150 字').max(600, 'sampleAnswer ≤ 600 字'),
  })
  .superRefine((val, ctx) => {
    // score 必须等于各 rubric 点得分之和
    const total = val.rubricResults.length
    if (total === 0) return
    const perPoint = 100 / total
    let expected = 0
    for (const r of val.rubricResults) {
      if (r.hit === 'full') expected += perPoint
      else if (r.hit === 'partial') expected += perPoint / 2
    }
    expected = Math.round(expected)
    if (Math.abs(val.score - expected) > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `score=${val.score} 与根据 rubricResults 计算的 ${expected} 不符（每点满分=${perPoint.toFixed(2)}）`,
        path: ['score'],
      })
    }

    // gaps 必须等于 hit='none' 的 point 列表
    const expectedGaps = val.rubricResults.filter((r) => r.hit === 'none').map((r) => r.point)
    const gapSet = new Set(val.gaps)
    const expectedSet = new Set(expectedGaps)
    if (gapSet.size !== expectedSet.size || [...gapSet].some((g) => !expectedSet.has(g))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `gaps 应等于 hit='none' 的 point 列表（期望：${expectedGaps.join(' / ')}）`,
        path: ['gaps'],
      })
    }

    // rubricResults 数量必须 ∈ [3, 5]（与输入 rubric 数量一致由调用方保证）
    if (!val.sampleAnswer || val.sampleAnswer.length < 150) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `sampleAnswer 必须 ≥ 150 字（实际：${val.sampleAnswer.length}）`,
        path: ['sampleAnswer'],
      })
    }
  })

export type FeynmanEvalOutput = z.infer<typeof feynmanEvalSchema>
