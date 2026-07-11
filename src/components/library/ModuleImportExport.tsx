'use client'

/**
 * ModuleImportExport — JSON package 导入导出（M7.5 Task 3）
 *
 * 行为：
 *   - 导出：读取 source + module + qualityReport，序列化为 .alc-module.json 下载
 *   - 导入：读取用户上传的 .json，parseModulePackage + importModulePackage，不调用 /api/compile
 *
 * 安全约束：parseModulePackage 已拒绝含 "apiKey" 的 JSON。
 */

import { useRef, useState } from 'react'

import type { CompileQualityReport } from '@/lib/compiler/quality/quality-report'
import {
  createModulePackage,
  importModulePackage,
  parseModulePackage,
  serializeModulePackage,
} from '@/lib/persistence/module-package'
import { importTopicPackage, parseTopicPackage } from '@/lib/persistence/topic-package'
import { storage } from '@/lib/persistence/local-storage'
import { StorageKeys } from '@/lib/persistence/keys'
import type { KnowledgeSource, Module, Topic } from '@/types/domain'

interface ModuleImportExportProps {
  /** 模块导入成功后调用（通常刷新列表 + toast） */
  onImported?: (module: Module) => void
  /** 主题导入成功后调用（刷新主题列表） */
  onTopicImported?: (topic: Topic) => void
  /** 错误反馈 */
  onError?: (message: string) => void
}

export function ModuleImportExport({
  onImported,
  onTopicImported,
  onError,
}: ModuleImportExportProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  // ---------- 导出 ----------

  const handleExport = () => {
    // 导出入口在 ModuleLibraryList 行内（按 module 触发），这里只用于重新挂载入口
    if (onError) onError('请使用列表中的导出按钮')
  }

  // ---------- 导入 ----------

  const handleImportClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setBusy(true)
    try {
      const text = await file.text()

      let parsedJson: unknown
      try {
        parsedJson = JSON.parse(text)
      } catch {
        parsedJson = undefined
      }

      if (
        parsedJson &&
        typeof parsedJson === 'object' &&
        !Array.isArray(parsedJson) &&
        'topic' in parsedJson &&
        'modules' in parsedJson
      ) {
        const result = parseTopicPackage(parsedJson)
        if (!result.ok) {
          if (onError) onError(result.error)
          if (fileInputRef.current) fileInputRef.current.value = ''
          setBusy(false)
          return
        }
        const topic = importTopicPackage(storage, result.pkg)
        if (onTopicImported) onTopicImported(topic)
      } else {
        const result = parseModulePackage(text)
        if (!result.ok) {
          if (onError) onError(result.error)
          if (fileInputRef.current) fileInputRef.current.value = ''
          setBusy(false)
          return
        }
        const importedModule = importModulePackage(storage, result.pkg)
        if (onImported) onImported(importedModule)
      }
    } catch (err) {
      if (onError) onError(err instanceof Error ? err.message : '导入失败：未知错误')
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
      setBusy(false)
    }
  }

  return (
    <div className="flex gap-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={handleFileChange}
      />
      <button
        type="button"
        onClick={handleImportClick}
        disabled={busy}
        className="alc-button-secondary text-sm"
      >
        {busy ? '导入中...' : '导入 JSON'}
      </button>
      {/* Export entry is intentionally hidden here; per-module export lives in the list. */}
      <button type="button" onClick={handleExport} className="hidden" aria-hidden>
        导出
      </button>
    </div>
  )
}

// =================================================================
// 导出 helper（被 ModuleLibraryList 调用）
// =================================================================

/**
 * 把指定 Module 导出为 .alc-module.json 文件下载。
 *
 * @param moduleId 要导出的 module id
 * @returns true 表示成功；false 表示 module 或 source 不存在
 */
export function exportModuleToBrowserDownload(moduleId: string): boolean {
  const storedModule = storage.get<Module>(StorageKeys.module(moduleId))
  if (!storedModule) return false

  const source = storage.get<KnowledgeSource>(StorageKeys.source(storedModule.sourceId))
  if (!source) return false

  const qualityReport = storage.get<CompileQualityReport>(StorageKeys.qualityReport(moduleId))

  const pkg = createModulePackage({
    source,
    module: storedModule,
    qualityReport,
    generatedBy: {
      // 不暴露 apiKey；只暴露模型名（如果未来加 metadata）
      generatedAt: storedModule.generatedAt,
    },
  })

  const json = serializeModulePackage(pkg)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  // 文件名做安全化：去掉不安全字符
  const safeTitle = storedModule.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 60) || storedModule.id
  a.download = `${safeTitle}.alc-module.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return true
}
