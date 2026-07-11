'use client'

import { useParams } from 'next/navigation'

import { TopicTransitionView } from '@/components/learn/TopicTransitionView'
import { LearnShell } from '@/components/learn/LearnShell'

export default function TopicTransitionPage() {
  const params = useParams<{ topicId: string }>()
  return (
    <LearnShell stageLabel="主题进度">
      <TopicTransitionView topicId={params.topicId} />
    </LearnShell>
  )
}
