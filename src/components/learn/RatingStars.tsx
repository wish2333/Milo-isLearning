'use client'

import { useState } from 'react'

import { track } from '@/lib/runtime/analytics'
import { useRatingStore } from '@/lib/state/rating-store'

interface RatingStarsProps {
  moduleId: string
}

export function RatingStars({ moduleId }: RatingStarsProps) {
  const existingRating = useRatingStore((s) => s.ratings[moduleId])
  const setRating = useRatingStore((s) => s.setRating)

  const [hoverScore, setHoverScore] = useState(0)
  const [submitted, setSubmitted] = useState(false)

  const currentScore = existingRating?.score ?? 0
  const displayScore = hoverScore || currentScore

  const handleClick = (score: number) => {
    if (existingRating) return
    setRating(moduleId, score)
    setSubmitted(true)
    track('module_rate', { score })
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-xs text-fg-tertiary">
        {existingRating ? '你的评分' : '这个模块掌握得怎么样？'}
      </p>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={!!existingRating}
            onMouseEnter={() => !existingRating && setHoverScore(star)}
            onMouseLeave={() => !existingRating && setHoverScore(0)}
            onClick={() => handleClick(star)}
            className="text-2xl transition-transform hover:scale-110 disabled:hover:scale-100"
            style={{
              color: star <= displayScore ? 'var(--accent-primary)' : 'var(--border-subtle)',
            }}
            aria-label={`${star} 星`}
          >
            ★
          </button>
        ))}
      </div>
      {submitted && <p className="text-xs text-fg-quaternary">感谢评分</p>}
    </div>
  )
}
