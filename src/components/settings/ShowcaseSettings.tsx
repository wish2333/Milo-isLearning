'use client'

/**
 * 展示模式设置 — 纯信息页，无表单、无 settings store 访问。
 *
 * 显示可用题库列表和完整版入口链接。
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  fetchShowcaseManifest,
  listShowcaseModules,
  type ShowcaseManifest,
} from '@/lib/showcase/showcase-loader'

export function ShowcaseSettings() {
  const [manifest, setManifest] = useState<ShowcaseManifest | null>(null)

  useEffect(() => {
    fetchShowcaseManifest()
      .then(setManifest)
      .catch(() => {
        // 静默失败 — 展示模式 Settings 不需要强健的错误处理
      })
  }, [])

  const modules = manifest ? listShowcaseModules(manifest) : []

  return (
    <main className="alc-page p-8">
      <section className="mx-auto max-w-2xl space-y-8">
        <h1 className="text-2xl font-semibold text-fg-primary">设置</h1>

        {/* 展示模式说明 */}
        <div className="alc-card p-5 space-y-2">
          <p className="alc-label uppercase tracking-wider">展示模式</p>
          <p className="text-sm leading-relaxed text-fg-secondary">
            当前为展示模式，无需配置 API。所有题库均为预编译内容，可直接开始学习。
          </p>
        </div>

        {/* 可用题库列表 */}
        {modules.length > 0 && (
          <div className="space-y-3">
            <p className="alc-label uppercase tracking-wider">可用题库</p>
            <ul className="space-y-2">
              {modules.map((m) => (
                <li key={m.id} className="text-sm text-fg-secondary">
                  • {m.title}
                  {m.featured && <span className="alc-muted"> （推荐）</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* 完整版链接 */}
        <div className="alc-card p-5 space-y-2">
          <p className="alc-label uppercase tracking-wider">完整功能</p>
          <p className="text-sm leading-relaxed text-fg-secondary">
            需要编译自己的内容？可以访问完整版进行配置。
          </p>
          <Link href="/studio" className="alc-button-secondary text-sm inline-block">
            访问完整版
          </Link>
        </div>

        {/* 关于 */}
        <div className="space-y-1 pt-4">
          <p className="alc-muted text-xs">AI Learning Compiler v1.0.0</p>
          <p className="alc-muted text-xs">Local-first · Zero-backend</p>
        </div>
      </section>
    </main>
  )
}
