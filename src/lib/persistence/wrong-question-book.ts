/**
 * Wrong Question Book — 错题本导出
 *
 * 收集 Module 中所有答错 / 蒙对的题目，生成 Markdown 文档并触发浏览器下载。
 */

import type { AttemptRecord, Module, Quiz } from '@/types/domain'

const PASS_THRESHOLD = 80

export interface WrongQuestionEntry {
  slotId: string
  conceptId: string
  conceptTitle: string
  stageLabel: string
  stem: string
  userAnswer: string
  correctAnswer: string
  explanation: string
  misconception?: string
  wrongCount: number
  guessed: boolean
}

/**
 * Collect all wrong/guessed quiz entries from a module + attempts.
 * Groups by concept, sorts by wrong count (desc), wrong first then guessed.
 */
export function collectWrongQuestions(
  module: Module,
  attemptsBySlot: Record<string, AttemptRecord[]>,
): WrongQuestionEntry[] {
  const entries: WrongQuestionEntry[] = []

  module.concepts.forEach((concept, conceptIndex) => {
    const stageLabel = `概念 ${conceptIndex + 1}`
    for (const quiz of concept.quizSeries.quizzes) {
      const entry = buildEntry(quiz, concept.id, concept.name, stageLabel, attemptsBySlot)
      if (entry) entries.push(entry)
    }
  })

  if (module.challengeQuizzes) {
    for (const quiz of module.challengeQuizzes) {
      const entry = buildEntry(quiz, 'challenge', '综合挑战', '综合挑战', attemptsBySlot)
      if (entry) entries.push(entry)
    }
  }

  return entries.sort((a, b) => {
    if (a.guessed !== b.guessed) return a.guessed ? 1 : -1
    return b.wrongCount - a.wrongCount
  })
}

function buildEntry(
  quiz: Quiz,
  conceptId: string,
  conceptTitle: string,
  stageLabel: string,
  attemptsBySlot: Record<string, AttemptRecord[]>,
): WrongQuestionEntry | null {
  const attempts = attemptsBySlot[quiz.id]
  if (!attempts || attempts.length === 0) return null

  const hasWrong = attempts.some((a) => a.score < PASS_THRESHOLD)
  const hasGuessed = attempts.some((a) => a.guessed === true)
  if (!hasWrong && !hasGuessed) return null

  const wrongCount = attempts.filter((a) => a.score < PASS_THRESHOLD).length
  const latest = attempts[attempts.length - 1]
  if (!latest) return null

  return {
    slotId: quiz.id,
    conceptId,
    conceptTitle,
    stageLabel,
    stem: quiz.stem,
    userAnswer: latest.userAnswer,
    correctAnswer: getCorrectAnswer(quiz),
    explanation: quiz.explanation ?? '',
    misconception: quiz.misconception,
    wrongCount,
    guessed: hasGuessed,
  }
}

function getCorrectAnswer(quiz: Quiz): string {
  switch (quiz.interactionType) {
    case 'choice':
      return quiz.answer
    case 'sorting':
      return (quiz.options ?? []).join(' → ')
    case 'fill_blank':
      return quiz.acceptableAnswers ? quiz.acceptableAnswers.join(' / ') : quiz.answer
  }
}

function escapeMarkdown(text: string): string {
  return text.replace(/[*_`~#\[\]()|>]/g, '\\$&')
}

/**
 * Build a Markdown document from wrong question entries.
 */
export function buildWrongQuestionMarkdown(entries: WrongQuestionEntry[], module: Module): string {
  const lines: string[] = []
  const date = new Date().toISOString().slice(0, 10)

  lines.push(`# 错题本 — ${escapeMarkdown(module.title)}`)
  lines.push(`> 导出日期：${date}｜共 ${entries.length} 道题`)
  lines.push('')

  const groups = new Map<string, WrongQuestionEntry[]>()
  for (const entry of entries) {
    const group = groups.get(entry.stageLabel) ?? []
    group.push(entry)
    groups.set(entry.stageLabel, group)
  }

  for (const [stageLabel, groupEntries] of groups) {
    const first = groupEntries[0]
    if (!first) continue
    lines.push(`## ${stageLabel}：${escapeMarkdown(first.conceptTitle)}`)
    lines.push('')

    const wrongEntries = groupEntries.filter((e) => !e.guessed)
    const guessedEntries = groupEntries.filter((e) => e.guessed)

    if (wrongEntries.length > 0) {
      lines.push('### ❌ 错题')
      lines.push('')
      wrongEntries.forEach((entry, i) => {
        lines.push(`**${i + 1}.** ${escapeMarkdown(entry.stem)}`)
        lines.push(`- 你的答案：${escapeMarkdown(entry.userAnswer)}`)
        lines.push(`- 正确答案：${escapeMarkdown(entry.correctAnswer)}`)
        if (entry.explanation) lines.push(`- 解析：${escapeMarkdown(entry.explanation)}`)
        if (entry.misconception) lines.push(`- 易错点：${escapeMarkdown(entry.misconception)}`)
        lines.push(`- 错误次数：${entry.wrongCount}`)
        lines.push('')
      })
    }

    if (guessedEntries.length > 0) {
      lines.push('### 🤔 蒙对的题')
      lines.push('')
      guessedEntries.forEach((entry, i) => {
        lines.push(`**${i + 1}.** ${escapeMarkdown(entry.stem)}`)
        lines.push(`- 你的答案：${escapeMarkdown(entry.userAnswer)}`)
        lines.push(`- 正确答案：${escapeMarkdown(entry.correctAnswer)}`)
        if (entry.explanation) lines.push(`- 解析：${escapeMarkdown(entry.explanation)}`)
        lines.push('')
      })
    }
  }

  return lines.join('\n')
}

/**
 * Trigger a browser download of the wrong question book as Markdown.
 * Returns true if download was initiated, false if no wrong questions.
 */
export function downloadWrongQuestionBook(
  module: Module,
  attemptsBySlot: Record<string, AttemptRecord[]>,
): boolean {
  const entries = collectWrongQuestions(module, attemptsBySlot)
  if (entries.length === 0) return false

  const markdown = buildWrongQuestionMarkdown(entries, module)
  const date = new Date().toISOString().slice(0, 10)
  const safeTitle = module.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 20)
  const filename = `错题本_${safeTitle}_${date}.md`

  const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  return true
}

/**
 * Check if a module has any wrong/guessed questions (for disabling buttons).
 */
export function hasWrongQuestions(
  module: Module,
  attemptsBySlot: Record<string, AttemptRecord[]>,
): boolean {
  return collectWrongQuestions(module, attemptsBySlot).length > 0
}
