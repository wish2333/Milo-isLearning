// Mission Agent 输出 Schema
// 对应 lib/compiler/prompts/mission.md
// PRD §7.5
import { z } from 'zod'

const placeholderSchema = z.object({
  id: z.string().regex(/^concept-\d+:slot-\d+$/, 'id 必须为 concept-N:slot-N 格式'),
  ladderLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  interactionType: z.enum(['choice', 'sorting', 'fill_blank']),
  expressionLevel: z.union([z.literal(1), z.literal(2), z.literal(3)]),
})

export const missionSchema = z
  .object({
    reasoning: z.string().min(1, '私有 CoT 不能为空'),
    seriesByConcept: z.record(z.string(), z.array(placeholderSchema).min(8).max(15)),
  })
  .superRefine((val, ctx) => {
    for (const [conceptId, placeholders] of Object.entries(val.seriesByConcept)) {
      // 检查 conceptId 格式
      if (!/^concept-\d+$/.test(conceptId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `seriesByConcept 的 key 必须为 concept-N 格式，实际：${conceptId}`,
          path: ['seriesByConcept', conceptId],
        })
        continue
      }

      // 检查 id 唯一性 + slot 序号连续
      // id 格式已由 regex 保证为 concept-N:slot-N；split[1] 兜底为空串让 parseInt 返回 NaN
      const slotNums = placeholders.map((p) => parseInt(p.id.split(':slot-')[1] ?? '', 10))
      const dupSlots = slotNums.filter((n, i) => slotNums.indexOf(n) !== i)
      if (dupSlots.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${conceptId} 内 slot 序号重复：${dupSlots.join(', ')}`,
          path: ['seriesByConcept', conceptId],
        })
      }

      // 检查前 2 个占位符必须是 L1 Choice E1（PRD §7.5 硬性约束）
      if (placeholders.length >= 2) {
        for (let i = 0; i < 2; i++) {
          const p = placeholders[i]
          if (!p) continue // 类型收窄；min(8) 已保证 length ≥ 8
          if (p.ladderLevel !== 1 || p.interactionType !== 'choice' || p.expressionLevel !== 1) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              message: `${conceptId} 前 2 个占位符必须是 {ladderLevel:1, interactionType:'choice', expressionLevel:1}，slot-${i + 1} 实际：${JSON.stringify(p)}`,
              path: ['seriesByConcept', conceptId, String(i)],
            })
          }
        }
      }

      // 检查 Quiz Ladder 分布（30-40% / 30-40% / 20-30%）
      const total = placeholders.length
      const l1 = placeholders.filter((p) => p.ladderLevel === 1).length
      const l2 = placeholders.filter((p) => p.ladderLevel === 2).length
      const l3 = placeholders.filter((p) => p.ladderLevel === 3).length
      const pct = (n: number): number => Math.round((n / total) * 100)
      if (pct(l1) < 30 || pct(l1) > 40) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${conceptId} L1 Recognition 占比 ${pct(l1)}%，应在 30-40%`,
          path: ['seriesByConcept', conceptId],
        })
      }
      if (pct(l2) < 30 || pct(l2) > 40) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${conceptId} L2 Discrimination 占比 ${pct(l2)}%，应在 30-40%`,
          path: ['seriesByConcept', conceptId],
        })
      }
      if (pct(l3) < 20 || pct(l3) > 30) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${conceptId} L3 Application 占比 ${pct(l3)}%，应在 20-30%`,
          path: ['seriesByConcept', conceptId],
        })
      }

      // 检查 Expression Level 分布（≥60% / ≤20% / ≤20%）
      const e1 = placeholders.filter((p) => p.expressionLevel === 1).length
      const e2 = placeholders.filter((p) => p.expressionLevel === 2).length
      const e3 = placeholders.filter((p) => p.expressionLevel === 3).length
      if (pct(e1) < 60) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${conceptId} E1 Choice 占比 ${pct(e1)}%，应 ≥ 60%`,
          path: ['seriesByConcept', conceptId],
        })
      }
      if (pct(e2) > 20) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${conceptId} E2 Sorting 占比 ${pct(e2)}%，应 ≤ 20%`,
          path: ['seriesByConcept', conceptId],
        })
      }
      if (pct(e3) > 20) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${conceptId} E3 Fill Blank 占比 ${pct(e3)}%，应 ≤ 20%`,
          path: ['seriesByConcept', conceptId],
        })
      }

      // 检查 expressionLevel 单调非递减
      // W9：去掉 zod 硬校验。回顾型 E1 选择题在 E3 之后出现是合理教学设计，
      // prompt 保留"建议单调递增"但不再强制。
      /* 旧逻辑已删除 */
    }
  })

export type MissionAgentOutput = z.infer<typeof missionSchema>
