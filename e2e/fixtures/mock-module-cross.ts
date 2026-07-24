/**
 * Cross-module topic fixture — a module with 2 concepts (1 quiz each)
 * so a concept transfer occurs within the topic learning flow.
 * Used by e2e/topic-cross-module-review.spec.ts to validate V2.1.6
 * cross-module review-slot injection.
 */
import type { Module } from '../../src/types/domain'

export const mockModuleCross: Module = {
  id: 'module-cross-a',
  sourceId: 'source-cross-a',
  title: '穿插模块A',
  intro: '两个概念的模块，用于验证跨 concept 转移注入',
  goal: '验证跨模块穿插',
  concepts: [
    {
      id: 'cross-c0',
      moduleId: 'module-cross-a',
      name: '概念零',
      definition: '概念零定义',
      type: 'fact',
      keyPoints: ['要点零'],
      quizSeries: {
        conceptId: 'cross-c0',
        quizzes: [
          {
            id: 'cross-c0:0',
            conceptId: 'cross-c0',
            ladderLevel: 1,
            expressionLevel: 1,
            interactionType: 'choice',
            stem: '概念零的唯一题目？',
            options: ['正确零', '错误一', '错误二', '错误三'],
            answer: '正确零',
            explanation: '正确零是概念零的答案。',
            distractors: ['错误一', '错误二', '错误三'],
          },
        ],
      },
      order: 1,
    },
    {
      id: 'cross-c1',
      moduleId: 'module-cross-a',
      name: '概念一',
      definition: '概念一定义',
      type: 'fact',
      keyPoints: ['要点一'],
      quizSeries: {
        conceptId: 'cross-c1',
        quizzes: [
          {
            id: 'cross-c1:0',
            conceptId: 'cross-c1',
            ladderLevel: 1,
            expressionLevel: 1,
            interactionType: 'choice',
            stem: '概念一的唯一题目？',
            options: ['正确一', '错误甲', '错误乙', '错误丙'],
            answer: '正确一',
            explanation: '正确一是概念一的答案。',
            distractors: ['错误甲', '错误乙', '错误丙'],
          },
        ],
      },
      order: 2,
    },
  ],
  feynmanTask: {
    moduleId: 'module-cross-a',
    steps: [
      { stepOrder: 1, prompt: '用自己的话解释概念零', hint: '聚焦定义' },
      { stepOrder: 2, prompt: '用自己的话解释概念一', hint: '聚焦定义' },
    ],
    finalPrompt: '综合讲解两个概念',
    rubric: ['讲解清晰'],
  },
  order: 1,
}
