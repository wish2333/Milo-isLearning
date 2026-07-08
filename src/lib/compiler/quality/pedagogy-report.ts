import type { Module, Quiz } from '@/types/domain'

export interface PedagogyReport {
  quizCount: number
  backgroundCoverage: number
  extendedKnowledgeCoverage: number
  fillBlankAcceptableAnswerCoverage: number
  averageExplanationLength: number
}

function collectQuizzes(module: Module): Quiz[] {
  return [
    ...module.concepts.flatMap((concept) => concept.quizSeries.quizzes),
    ...(module.challengeQuizzes ?? []),
  ]
}

function ratio(count: number, total: number): number {
  return total === 0 ? 0 : count / total
}

export function buildPedagogyReport(module: Module): PedagogyReport {
  const quizzes = collectQuizzes(module)
  const fillBlankQuizzes = quizzes.filter((quiz) => quiz.interactionType === 'fill_blank')
  const explanationLength = quizzes.reduce((sum, quiz) => sum + quiz.explanation.length, 0)

  return {
    quizCount: quizzes.length,
    backgroundCoverage: ratio(
      quizzes.filter((quiz) => Boolean(quiz.background && quiz.background.length >= 20)).length,
      quizzes.length,
    ),
    extendedKnowledgeCoverage: ratio(
      quizzes.filter((quiz) =>
        Boolean(quiz.extendedKnowledge && quiz.extendedKnowledge.length >= 20),
      ).length,
      quizzes.length,
    ),
    fillBlankAcceptableAnswerCoverage: ratio(
      fillBlankQuizzes.filter((quiz) => (quiz.acceptableAnswers?.length ?? 0) > 0).length,
      fillBlankQuizzes.length,
    ),
    averageExplanationLength: quizzes.length === 0 ? 0 : explanationLength / quizzes.length,
  }
}
