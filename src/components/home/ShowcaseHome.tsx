'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  fetchShowcaseManifest,
  findFeaturedModule,
  listShowcaseModules,
  loadShowcaseModuleIntoStorage,
  type ShowcaseManifest,
  type ShowcaseManifestEntry,
} from '@/lib/showcase/showcase-loader'
import { useModuleStore } from '@/lib/state/module-store'
import { useProgressStore } from '@/lib/state/progress-store'
import { ShowcaseModuleCard } from '@/components/showcase/ShowcaseModuleCard'
import { MockCompileOverlay } from '@/components/showcase/MockCompileOverlay'

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

  return (
    <main className="alc-page p-8">
      <section className="mx-auto max-w-3xl space-y-8">
        <div className="space-y-3 text-center">
          <p className="alc-label uppercase tracking-wider">Learning path compiler</p>
          <h1 className="text-4xl font-semibold text-fg-primary">AI Learning Compiler</h1>
          <p className="mx-auto max-w-md text-sm leading-relaxed text-fg-secondary">
            将任何知识编译成一条低摩擦、高掌握度的学习路径：先理解，再练习，最后讲清楚。
          </p>
        </div>

        <div className="text-center">
          <button onClick={handleMockCompile} className="alc-button-primary text-sm">
            模拟编译
          </button>
        </div>

        {modules.length > 0 && (
          <div className="space-y-4">
            <h2 className="alc-label uppercase tracking-wider">精选题库</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {modules.map((entry) => (
                <ShowcaseModuleCard key={entry.id} entry={entry} onStart={handleStartModule} />
              ))}
            </div>
          </div>
        )}

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
