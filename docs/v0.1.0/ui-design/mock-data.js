/* =========================================================================
   AI Learning Compiler — Mock Data
   Phase 3 · §10.3.4 deliverable

   Single source of truth for all Phase 3 prototype pages.

   Loaded via <script src="./mock-data.js"></script> in every page.
   Exposes window.MOCK with:
     - MOCK.module              RAG Module full data
     - MOCK.quizzes             Sample quizzes per interactionType
     - MOCK.compileStages       Compile pipeline stages (for 02-compiling.html)
     - MOCK.errors              Sample error scenarios (for 11-error.html)
     - MOCK.feedbackPhrases     Encouraging phrase libraries (§4.6.2)

   Schema aligns with PRD §8 data model; simplified for prototype use.
   ========================================================================= */

'use strict'

/* @type {Readonly<{ module: object, quizzes: object, compileStages: array, errors: object, feedbackPhrases: object }>} */
window.MOCK = Object.freeze({
  /* ======================================================================
     §1. RAG Module — main learning path
     ====================================================================== */

  module: {
    id: 'rag-001',
    title: '理解 RAG',
    goal: '完成本模块后，你能向一个高中生解释 RAG 是什么、为什么需要它。',
    compiledAt: '2026-07-06T12:34:56Z',
    estimatedMinutes: 18,
    conceptCount: 3,
    sourceExcerpt:
      '# 检索增强生成（RAG）\n\n' +
      '## 什么是 RAG\n' +
      'RAG（Retrieval-Augmented Generation）是一种结合外部知识检索与生成模型的技术...\n',

    concepts: [
      {
        id: 'C1',
        name: '什么是检索',
        definition: '从大量信息中找到与查询相关内容的过程',
        keyPoints: ['检索的定义', '检索在大模型中的作用'],
        quizCount: 8,
        masteryPercent: 87,
        masteryLevel: 5, // out of 6 (mini-staircase fill)
        status: 'completed', // 'completed' | 'active' | 'locked' | 'skipped'
      },
      {
        id: 'C2',
        name: '什么是 Embedding',
        definition: '将文本转换为向量表示，让机器能计算语义相似度',
        keyPoints: ['向量表示', '语义相似度'],
        quizCount: 7,
        masteryPercent: 75,
        masteryLevel: 4,
        status: 'completed',
      },
      {
        id: 'C3',
        name: 'RAG 完整流程',
        definition: '从用户提问到模型生成答案的完整链路',
        keyPoints: ['检索-生成串联', '与微调的区别'],
        quizCount: 9,
        masteryPercent: 82,
        masteryLevel: 5,
        status: 'completed',
      },
    ],

    challenge: {
      id: 'CHL',
      title: '综合挑战',
      subtitle: '3 道跨概念题',
      quizCount: 3,
      status: 'completed',
    },

    feynman: {
      totalSteps: 6,
      finalStep: 6,
      finalScore: 80,
      status: 'completed',
      steps: [
        {
          stepNum: 1,
          type: 'choice',
          stem: '如果让你解释 RAG 是什么、为什么需要它，第一句话应该是什么？',
          options: [
            { letter: 'A', text: 'RAG 是一种结合检索与生成的技术。', correct: true },
            { letter: 'B', text: 'RAG 解决了大模型的幻觉问题。', correct: false },
            { letter: 'C', text: 'RAG 是 OpenAI 提出的技术。', correct: false },
            { letter: 'D', text: 'RAG 必须用 GPT-4 才能实现。', correct: false },
          ],
        },
        {
          stepNum: 2,
          type: 'choice',
          stem: '解释 RAG 时，"为什么需要"的核心动机是什么？',
          options: [
            { letter: 'A', text: '让模型变得更小，节省算力。', correct: false },
            { letter: 'B', text: '在不重新训练模型的前提下，引入最新或私有知识。', correct: true },
            { letter: 'C', text: '让模型可以理解多模态输入。', correct: false },
            { letter: 'D', text: '让模型生成速度更快。', correct: false },
          ],
        },
        {
          stepNum: 3,
          type: 'choice',
          stem: '解释 RAG 时，"它解决了什么问题"应该提到？',
          options: [
            { letter: 'A', text: '大模型的知识截止时间与幻觉问题。', correct: true },
            { letter: 'B', text: '计算机的存储成本问题。', correct: false },
            { letter: 'C', text: '深度学习的训练时间问题。', correct: false },
            { letter: 'D', text: '前端的渲染性能问题。', correct: false },
          ],
        },
        {
          stepNum: 4,
          type: 'choice',
          stem: '解释 RAG 与微调的区别时，最关键的对比是？',
          options: [
            { letter: 'A', text: '微调用 Python，RAG 用 JavaScript。', correct: false },
            {
              letter: 'B',
              text: '微调更新模型参数；RAG 不改模型，只在推理时提供上下文。',
              correct: true,
            },
            { letter: 'C', text: '微调准确率更高，RAG 速度更快。', correct: false },
            { letter: 'D', text: '微调在线上用，RAG 在线下用。', correct: false },
          ],
        },
        {
          stepNum: 5,
          type: 'fill-blank',
          stemPrefix: 'RAG 之所以能减少幻觉，是因为它能',
          stemSuffix: '外部知识。',
          answer: '检索',
          acceptableAnswers: ['检索', ' retrieve', ' retrieval'],
        },
        // Step 6 — full output — handled by 09-feynman-final.html
      ],
    },
  },

  /* ======================================================================
     §2. Sample quizzes — one per interactionType for variant demos
     ====================================================================== */

  quizzes: {
    /* Used by 05-learn-choice.html */
    choice: {
      conceptId: 'C1',
      conceptName: '什么是检索',
      stepInConcept: 3,
      totalStepsInConcept: 8,
      stem: '下面哪一个属于 Few-shot Prompting？',
      options: [
        { letter: 'A', text: '让模型自由生成，不提供任何示例', correct: false },
        { letter: 'B', text: '给模型一个示例：「将句子翻译为英文：你好 → Hello」', correct: true },
        { letter: 'C', text: '使用强化学习训练模型', correct: false },
        { letter: 'D', text: '调整模型参数以适应新任务', correct: false },
      ],
      explanation:
        'Few-shot 的核心是提供示例，让模型模仿输出格式。' +
        '其他选项：A 是 zero-shot（无示例），C 是 RLHF，D 是 fine-tuning。',
    },

    /* Used by 06-learn-sorting.html */
    sorting: {
      conceptId: 'C3',
      conceptName: 'RAG 完整流程',
      stepInConcept: 5,
      totalStepsInConcept: 9,
      stem: '请按 RAG 流程的正确顺序排列以下步骤。',
      items: [
        { id: 's1', text: '用户提问' },
        { id: 's2', text: '文档向量化（Embedding）' },
        { id: 's3', text: '检索相关文档' },
        { id: 's4', text: '把检索结果作为上下文喂给模型' },
        { id: 's5', text: '模型生成最终回答' },
      ],
      correctOrder: ['s1', 's2', 's3', 's4', 's5'],
      explanation:
        'RAG 的流程是：先准备向量化的文档库 → 用户提问时检索相关文档 → ' +
        '把文档作为上下文喂给模型 → 模型基于上下文生成答案。' +
        '文档向量化可以离线完成，所以放在第二位。',
    },

    /* Used by 07-learn-fill-blank.html */
    'fill-blank': {
      conceptId: 'C1',
      conceptName: '什么是检索',
      stepInConcept: 7,
      totalStepsInConcept: 8,
      stemPrefix: 'RAG 的全称是',
      stemSuffix: '-Augmented Generation。',
      answer: 'Retrieval',
      acceptableAnswers: ['Retrieval', 'retrieval', 'Retrieval'.toLowerCase()],
      placeholder: '……',
      explanation:
        'RAG 的 R 代表 Retrieval（检索）。' +
        '全名 Retrieval-Augmented Generation，即"检索增强生成"。',
    },

    /* Used by 08-challenge.html — cross-concept question */
    challenge: {
      stage: 'Challenge',
      stepInStage: 1,
      totalStepsInStage: 3,
      stem: 'Embedding 与检索的关系是？',
      options: [
        {
          letter: 'A',
          text: 'Embedding 是检索的前置步骤——把文档变成向量后才能做语义检索。',
          correct: true,
        },
        { letter: 'B', text: '检索是 Embedding 的前置步骤。', correct: false },
        { letter: 'C', text: '两者毫无关系。', correct: false },
        { letter: 'D', text: 'Embedding 取代了检索。', correct: false },
      ],
      explanation:
        '在 RAG 中，文档首先被 Embedding 成向量存入向量库；' +
        '用户提问时，问题也被 Embedding，然后通过向量相似度检索相关文档。' +
        '所以 Embedding 是语义检索的基础。',
    },
  },

  /* ======================================================================
     §3. Compile pipeline stages — for 02-compiling.html
     ====================================================================== */

  compileStages: [
    { id: 's1', name: '清洗', label: '清洗 Markdown...', agent: 'Import Agent', range: [0, 15] },
    { id: 's2', name: '切分', label: '语义切分...', agent: 'Chunk Agent', range: [15, 40] },
    {
      id: 's3',
      name: '概念',
      label: '从知识块提取概念...',
      agent: 'Concept Agent',
      range: [40, 55],
    },
    {
      id: 's4',
      name: '练习',
      label: '生成练习...',
      agent: 'Mission + Quiz Agent',
      range: [55, 80],
    },
    { id: 's5', name: '费曼', label: '设计费曼任务...', agent: 'Feynman Agent', range: [80, 100] },
  ],

  /* ======================================================================
     §4. Error scenarios — for 11-error.html
     ====================================================================== */

  errors: {
    compile: {
      title: '编译遇到了问题',
      message: '我们无法从这段 Markdown 中提取足够的概念。',
      hint: '请补充至 200 字以上，或尝试更结构化的内容。',
      actions: [
        { label: '返回修改', variant: 'secondary', target: '01-home.html' },
        { label: '使用示例重试', variant: 'text', target: '01-home.html?sample=rag' },
      ],
    },
    network: {
      title: '网络有些慢',
      message: '你的作答已保存，但反馈需要联网才能生成。',
      hint: '请检查网络后重试。',
      actions: [
        { label: '重试', variant: 'primary', target: '#retry' },
        { label: '跳过此题', variant: 'text', target: '#skip' },
      ],
    },
  },

  /* ======================================================================
     §5. Encouraging phrase libraries — §4.6.2 反馈短语
     ====================================================================== */

  feedbackPhrases: {
    correct: ['很好。', '正是这样。', '对。', '没错。', '你已经掌握了。'],
    wrong: ['差一点。', '再看一遍。', '关键在于……', '这次偏离了。'],
  },
})

/* ---------- Convenience helpers (read-only) ---------- */

/**
 * Pick a random feedback phrase.
 * @param {'correct'|'wrong'} kind
 * @returns {string}
 */
window.MOCKPickFeedback = function (kind) {
  const list = window.MOCK.feedbackPhrases[kind] || ['']
  return list[Math.floor(Math.random() * list.length)] || list[0]
}

/**
 * Find a Concept by id.
 * @param {string} id
 */
window.MOCKFindConcept = function (id) {
  return window.MOCK.module.concepts.find((c) => c.id === id)
}
