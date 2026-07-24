/**
 * Cross-module topic fixture B — companion to mock-module-cross.ts.
 * A second 2-concept module so a topic of [crossA, crossB] triggers a concept
 * transfer in WHICHEVER module starts first (order-agnostic E2E).
 */
import type { Module } from '../../src/types/domain'

export const mockModuleCrossB: Module = {
  id: 'module-cross-b',
  sourceId: 'source-cross-b',
  title: '穿插模块B',
  intro: '第二个两概念模块，用于跨模块穿插',
  goal: '验证跨模块穿插',
  concepts: [
    {
      id: 'crossb-c0',
      moduleId: 'module-cross-b',
      name: '概念B零',
      definition: '概念B零定义',
      type: 'fact',
      keyPoints: ['要点B零'],
      quizSeries: {
        conceptId: 'crossb-c0',
        quizzes: [
          {
            id: 'crossb-c0:0',
            conceptId: 'crossb-c0',
            ladderLevel: 1,
            expressionLevel: 1,
            interactionType: 'choice',
            stem: '概念B零的唯一题目？',
            options: ['正确B零', '错误B一', '错误B二', '错误B三'],
            answer: '正确B零',
            explanation: '正确B零是概念B零的答案。',
            distractors: ['错误B一', '错误B二', '错误B三'],
          },
        ],
      },
      order: 1,
    },
    {
      id: 'crossb-c1',
      moduleId: 'module-cross-b',
      name: '概念B一',
      definition: '概念B一定义',
      type: 'fact',
      keyPoints: ['要点B一'],
      quizSeries: {
        conceptId: 'crossb-c1',
        quizzes: [
          {
            id: 'crossb-c1:0',
            conceptId: 'crossb-c1',
            ladderLevel: 1,
            expressionLevel: 1,
            interactionType: 'choice',
            stem: '概念B一的唯一题目？',
            options: ['正确B一', '错误B甲', '错误B乙', '错误B丙'],
            answer: '正确B一',
            explanation: '正确B一是概念B一的答案。',
            distractors: ['错误B甲', '错误B乙', '错误B丙'],
          },
        ],
      },
      order: 2,
    },
  ],
  feynmanTask: {
    moduleId: 'module-cross-b',
    steps: [
      { stepOrder: 1, prompt: '解释概念B零', hint: '聚焦定义' },
      { stepOrder: 2, prompt: '解释概念B一', hint: '聚焦定义' },
    ],
    finalPrompt: '综合讲解',
    rubric: ['讲解清晰'],
  },
  order: 1,
}
