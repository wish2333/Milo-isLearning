'use client'

/**
 * QualitySummary — 编译质量摘要（M7.5 Task 6 配套 UI）
 *
 * 只读展示：题数、表达层级分布、Challenge 题数与涉及概念覆盖。
 * 不做成本估算（推迟到 M7.6）。
 */

import type { CompileQualityReport } from '@/lib/compiler/quality/quality-report'

interface QualitySummaryProps {
  report: CompileQualityReport
}

const EXPRESSION_LABELS: Record<1 | 2 | 3, string> = {
  1: '选择题',
  2: '排序题',
  3: '填空题',
}

export function QualitySummary({ report }: QualitySummaryProps) {
  const totalExpression =
    report.expressionDistribution[1] +
    report.expressionDistribution[2] +
    report.expressionDistribution[3]

  return (
    <div className="alc-card-elevated p-4 space-y-3 text-sm">
      <p className="alc-label uppercase tracking-wider">编译质量</p>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <p className="text-base text-fg-primary tabular-nums">{report.conceptCount}</p>
          <p className="alc-label">概念数</p>
        </div>
        <div>
          <p className="text-base text-fg-primary tabular-nums">{report.quizCount}</p>
          <p className="alc-label">题目总数</p>
        </div>
        <div>
          <p className="text-base text-fg-primary tabular-nums">{report.challengeCount}</p>
          <p className="alc-label">综合挑战</p>
        </div>
      </div>

      {totalExpression > 0 && (
        <div className="space-y-1">
          <p className="alc-label">表达层级分布</p>
          <div className="flex gap-2 text-xs">
            {([1, 2, 3] as const).map((lv) => {
              const count = report.expressionDistribution[lv]
              const pct = totalExpression === 0 ? 0 : Math.round((count / totalExpression) * 100)
              return (
                <div
                  key={lv}
                  className="flex-1 px-2 py-1.5 rounded border border-border-subtle bg-bg-surface"
                >
                  <p className="text-fg-secondary">{EXPRESSION_LABELS[lv]}</p>
                  <p className="text-fg-primary tabular-nums">
                    {count} <span className="alc-muted">({pct}%)</span>
                  </p>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {report.challengeCoverage.length > 0 && (
        <div className="space-y-1">
          <p className="alc-label">Challenge 概念覆盖</p>
          <div className="space-y-1">
            {report.challengeCoverage.map((c) => (
              <div
                key={c.quizId}
                className="flex items-center justify-between text-xs px-2 py-1 rounded border border-border-subtle bg-bg-surface"
              >
                <span className="text-fg-secondary font-mono truncate">{c.quizId}</span>
                <span className="text-fg-primary tabular-nums shrink-0 ml-2">
                  {c.involvedConceptIds.length} 概念
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
