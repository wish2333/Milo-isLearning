/**
 * Fill Blank 标准化匹配（Tech Spec §5.2 双策略兜底）
 *
 * 设计意图：
 *   Feedback Agent 对 Fill Blank 题的语义判断可能误判（如同义词、表述差异）。
 *   本模块提供"精确兜底"：对用户答案与正确答案做标准化处理后精确比较，
 *   命中则覆盖 Agent 的 retry 判定为 advance。
 *
 * 约束（FR-04）：
 *   - 仅用于 interactionType === 'fill_blank' 的题
 *   - 标准化后完全相等才返回 true（不做模糊匹配 / 语义近似）
 */

/**
 * 标准化字符串：用于 Fill Blank 答案比较。
 *
 * 步骤：
 *   1. 去首尾空白
 *   2. 全角字符 → 半角（常见中文输入法全角英文）
 *   3. 转小写
 *   4. 折叠连续空白为单个空格
 */
export function normalizeFillBlankAnswer(raw: string): string {
  return raw
    .trim()
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0)) // 全角→半角
    .replace(/\u3000/g, ' ') // 全角空格
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * 判断 Fill Blank 用户答案是否与正确答案精确匹配（标准化后）。
 *
 * @returns true = 命中（应覆盖为 advance）；false = 不匹配（维持 Agent 判定）
 */
export function isFillBlankCorrect(userAnswer: string, correctAnswer: string): boolean {
  const normalizedUser = normalizeFillBlankAnswer(userAnswer)
  const normalizedCorrect = normalizeFillBlankAnswer(correctAnswer)

  // 空字符串不视为命中（防止空答案意外匹配空正确答案）
  if (normalizedUser.length === 0) return false

  return normalizedUser === normalizedCorrect
}

export function isFillBlankAnswerAccepted(
  userAnswer: string,
  correctAnswer: string,
  acceptableAnswers: string[] = [],
): boolean {
  const candidates = [correctAnswer, ...acceptableAnswers]
  return candidates.some((candidate) => isFillBlankCorrect(userAnswer, candidate))
}
