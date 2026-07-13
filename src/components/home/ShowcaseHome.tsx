'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  fetchShowcaseManifest,
  findFeaturedModule,
  listShowcaseModules,
  listShowcaseTopics,
  loadShowcaseModuleIntoStorage,
  loadShowcaseTopicIntoStorage,
  type ShowcaseManifest,
  type ShowcaseManifestEntry,
  type ShowcaseTopicEntry,
} from '@/lib/showcase/showcase-loader'
import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'
import { useTopicSessionStore } from '@/lib/state/topic-session-store'
import { ShowcaseModuleCard } from '@/components/showcase/ShowcaseModuleCard'
import { ShowcaseTopicCard } from '@/components/showcase/ShowcaseTopicCard'
import { MockCompileOverlay } from '@/components/showcase/MockCompileOverlay'
import { loadStoredModule } from '@/lib/persistence/module-library'
import { storage } from '@/lib/persistence/client/local-storage'

type ShowcaseHomeStatus = 'idle' | 'loading-manifest' | 'ready' | 'mock-compiling' | 'error'

export function ShowcaseHome() {
  const router = useRouter()
  const [status, setStatus] = useState<ShowcaseHomeStatus>('idle')
  const [manifest, setManifest] = useState<ShowcaseManifest | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const setModule = useModuleStore((s) => s.setModule)
  const startModule = useProgressStore((s) => s.startModule)

  useEffect(() => {
    setStatus('loading-manifest')
    fetchShowcaseManifest()
      .then((m) => {
        setManifest(m)
        setStatus('ready')
      })
      .catch((e) => {
        setErrorMsg(e instanceof Error ? e.message : '加载题库失败')
        setStatus('error')
      })
  }, [])

  const handleStartModule = async (entry: ShowcaseManifestEntry) => {
    try {
      const loadedModule = await loadShowcaseModuleIntoStorage(entry)
      setModule(loadedModule)
      startModule(loadedModule.id)
      router.push(`/learn/module/${loadedModule.id}`)
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '加载题库失败')
      setStatus('error')
    }
  }

  const handleMockCompile = () => {
    setStatus('mock-compiling')
  }

  const handleStartTopic = async (entry: ShowcaseTopicEntry) => {
    try {
      setStatus('loading-manifest')
      const topic = await loadShowcaseTopicIntoStorage(entry)
      const ok = useTopicSessionStore.getState().startSession(topic.id)
      if (!ok) throw new Error('主题会话启动失败')
      const firstModuleId = useTopicSessionStore.getState().getCurrentModuleId()
      if (!firstModuleId) throw new Error('无法获取第一个模块')
      const moduleData = loadStoredModule(storage, firstModuleId)
      if (!moduleData) throw new Error('模块加载失败')
      setModule(moduleData)
      startModule(firstModuleId)
      router.push(`/learn/module/${firstModuleId}`)
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : '主题加载失败')
      setStatus('error')
    }
  }

  const handleMockComplete = async () => {
    if (!manifest) return
    const featured = findFeaturedModule(manifest)
    if (!featured) return
    await handleStartModule(featured)
  }

  // --- Mock compiling state ---
  if (status === 'mock-compiling') {
    return (
      <MockCompileOverlay
        onComplete={handleMockComplete}
        onError={(msg) => {
          setErrorMsg(msg)
          setStatus('error')
        }}
      />
    )
  }

  // --- Error state ---
  if (status === 'error') {
    return (
      <main className="alc-page items-center justify-center p-8">
        <div className="w-full max-w-md space-y-4 text-center">
          <p className="text-sm text-fg-secondary">{errorMsg}</p>
          <button onClick={() => window.location.reload()} className="alc-button-secondary text-sm">
            重试
          </button>
        </div>
      </main>
    )
  }

  // --- Loading state ---
  if (status === 'loading-manifest' || status === 'idle') {
    return (
      <main className="alc-page items-center justify-center p-8">
        <p className="alc-muted text-sm">加载中...</p>
      </main>
    )
  }

  // --- Ready state ---
  const modules = manifest ? listShowcaseModules(manifest) : []
  const showcaseTopics = manifest ? listShowcaseTopics(manifest) : []

  return (
    <main className="alc-page p-8">
      <section className="mx-auto max-w-4xl space-y-8">
        <div className="space-y-3 text-center">
          <p className="alc-label uppercase tracking-wider">Learning path compiler</p>
          <h1 className="text-4xl font-semibold text-fg-primary">AI Learning Compiler</h1>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-fg-secondary">
            将任何知识编译成一条低摩擦、高掌握度的学习路径：先理解，再练习，最后讲清楚。
          </p>
        </div>

        <div className="flex justify-center gap-3">
          <button onClick={handleMockCompile} className="alc-button-primary text-sm">
            模拟编译
          </button>
          <Link href="/learn/library" className="alc-button-secondary text-sm">
            进入题库
          </Link>
        </div>

        <div className="grid gap-6 md:grid-cols-2 items-stretch">
          {showcaseTopics.length > 0 && (
            <section className="flex flex-col">
              <h2 className="alc-label uppercase tracking-wider mb-3">主题学习</h2>
              <div className="space-y-4 flex-1 flex flex-col">
                {showcaseTopics.map((topic) => (
                  <ShowcaseTopicCard key={topic.id} entry={topic} onStart={handleStartTopic} />
                ))}
              </div>
            </section>
          )}

          {modules.length > 0 && (
            <section className="flex flex-col">
              <h2 className="alc-label uppercase tracking-wider mb-3">精选题库</h2>
              <div className="space-y-4 flex-1 flex flex-col">
                {modules.map((entry) => (
                  <ShowcaseModuleCard key={entry.id} entry={entry} onStart={handleStartModule} />
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="text-center pt-4">
          <p className="alc-muted text-xs">
            想编译自己的内容？{' '}
            <Link href="/studio" className="underline hover:text-fg-primary">
              访问完整版
            </Link>
          </p>
        </div>
      </section>
    </main>
  )
}
