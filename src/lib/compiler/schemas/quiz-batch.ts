/**
 * Quiz Batch Agent 输出 Schema
 *
 * 对应 lib/compiler/prompts/quiz-batch.md
 * 按 concept 分组，一次请求返回该 concept 下 8-15 道 Quiz
 */
import { z } from 'zod'

import { quizItemSchema } from './quiz'

export const quizBatchSchema = z.object({
  reasoning: z.string().min(1, '私有 CoT 不能为空'),
  quizzes: z.array(quizItemSchema).min(6).max(16), // 与 missionSchema 的 min(8).max(15) 对齐并留有弹性
})

export type QuizBatchAgentOutput = z.infer<typeof quizBatchSchema>
