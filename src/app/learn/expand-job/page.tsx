'use client'

import { useEffect, useState } from 'react'

import { ExpandJobView, type TopicExpandRequest } from '@/components/learn/ExpandJobView'

const TOPIC_EXPAND_REQUEST_KEY = 'alc:topic-expand-request'

export default function ExpandJobPage() {
  const [request, setRequest] = useState<TopicExpandRequest | null>(null)
  const [jobId, setJobId] = useState<string | null>(null)

  useEffect(() => {
    const rawRequest = sessionStorage.getItem(TOPIC_EXPAND_REQUEST_KEY)
    if (rawRequest) {
      try {
        setRequest(JSON.parse(rawRequest) as TopicExpandRequest)
      } catch {
        sessionStorage.removeItem(TOPIC_EXPAND_REQUEST_KEY)
      }
    }
    setJobId(new URLSearchParams(window.location.search).get('jobId'))
  }, [])

  return <ExpandJobView initialRequest={request} jobId={jobId} />
}
