'use client'

interface StaircaseProgressProps {
  total: number
  current: number
  stage: 'concept' | 'challenge' | 'feynman'
}

export function StaircaseProgress({ total, current, stage }: StaircaseProgressProps) {
  const count = Math.max(total, 1)
  const activeIndex = Math.min(Math.max(current, 0), count - 1)

  return (
    <div className="alc-staircase" aria-label="学习阶梯进度">
      {Array.from({ length: count }, (_, index) => {
        const state =
          index < activeIndex ? 'completed' : index === activeIndex ? 'current' : 'locked'
        return (
          <span
            key={index}
            className="alc-stair-step"
            data-state={state}
            data-stage={stage}
            style={{ height: `${8 + index * 3}px` }}
          />
        )
      })}
    </div>
  )
}
