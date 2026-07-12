/**
 * Second Mock Module fixture for topic E2E tests
 *
 * A minimal valid Module with1 concept (2 quizzes) + 3-step Feynman task.
 * Used alongside mock-module.ts for topic CRUD and topic learning flow tests.
 */

import type { Module } from '../../src/types/domain'

export const mockModule2: Module = {
  id: 'module-test-2',
  sourceId: 'source-test-2',
  title: '测试模块二',
  intro: '这是第二个用于 E2E 测试的模块',
  goal: '验证主题刷题流程',
  concepts: [
    {
      id: 'concept-2',
      moduleId: 'module-test-2',
      name: '进阶概念',
      definition: '测试用的进阶概念定义',
      type: 'theory',
      keyPoints: ['要点X', '要点Y'],
      quizSeries: {
        conceptId: 'concept-2',
        quizzes: [
          {
            id: 'concept-2:0',
            conceptId: 'concept-2',
            ladderLevel: 1,
            expressionLevel: 1,
            interactionType: 'choice',
            stem: '进阶概念的核心理论是什么？',
            options: ['理论A正确', '理论B错误', '理论C错误', '理论D错误'],
            answer: '理论A正确',
            explanation: '理论A正确是进阶概念的核心。',
            distractors: ['理论B错误', '理论C错误', '理论D错误'],
          },
          {
            id: 'concept-2:1',
            conceptId: 'concept-2',
            ladderLevel: 1,
            expressionLevel: 1,
            interactionType: 'choice',
            stem: '进阶概念的应用场景？',
            options: ['场景一', '场景二', '场景三', '场景四'],
            answer: '场景一',
            explanation: '进阶概念主要应用于场景一。',
            distractors: ['场景二', '场景三', '场景四'],
          },
        ],
      },
      order: 1,
    },
  ],
  feynmanTask: {
    moduleId: 'module-test-2',
    steps: [
      {
        order: 1,
        type: 'choice',
        stem: '费曼步骤1：进阶概念属于哪个领域？',
        options: ['数学领域', '物理领域', '化学领域', '生物领域'],
        answer: '数学领域',
        explanation: '进阶概念属于数学领域。',
      },
      {
        order: 2,
        type: 'choice',
        stem: '费曼步骤2：进阶概念的主要应用？',
        options: ['数据处理', '图像识别', '语音合成', '文本生成'],
        answer: '数据处理',
        explanation: '进阶概念主要用于数据处理。',
      },
      {
        order: 3,
        type: 'choice',
        stem: '费曼步骤3：哪个描述最准确？',
        options: ['精确描述', '模糊描述A', '模糊描述B', '错误描述C'],
        answer: '精确描述',
        explanation: '精确描述完整涵盖了进阶概念。',
      },
      {
        order: 4,
        type: 'choice',
        stem: '费曼步骤4：进阶概念的关键组成部分？',
        options: ['理论框架', '辅助组件', '无关要素', '干扰内容'],
        answer: '理论框架',
        explanation: '理论框架是进阶概念的核心组成部分。',
      },
      {
        order: 5,
        type: 'fill_blank',
        stem: '费曼步骤5：进阶概念的关键术语是____',
        options: null,
        answer: '关键术语',
        explanation: '关键术语是进阶概念的标志性词汇。',
      },
    ],
    finalPrompt: '请用你自己的话完整解释进阶概念。',
    rubric: ['概念定义准确', '理论框架完整'],
  },
  order: 2,
}
