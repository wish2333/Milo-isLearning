/**
 * Prompt 模板加载器
 *
 * 对应 docs/Prompt-Engineering.md §4.2 / §4.3 与 docs/Technical-Specification.md §4.4。
 *
 * 职责：
 *   1. 从文件系统读取 `.md` 模板（主模板 + _shared/ 片段）
 *   2. 递归展开 `{{> shared/name}}` partial 引用
 *   3. 展开 `{{> schema/<agent-kind>}}` 为对应 Agent 的 JSON Schema 文本
 *
 * 不做的事（由 builder.ts 负责）：
 *   - `{变量}` 占位符替换（白名单替换，保护 _shared 里的 {中文} 示例文本）
 *   - system/user 消息切分
 *
 * 文件路径解析：以 process.cwd() 为根（dev / vitest / Next serverless 一致），
 * Next.js 通过 next.config.ts 的 outputFileTracingIncludes 把 .md 纳入函数包。
 */
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { schemaToPromptHint, type AgentKind } from '@/lib/compiler/schemas'

/** prompts 目录的绝对路径 */
const PROMPTS_DIR = path.join(process.cwd(), 'src', 'lib', 'compiler', 'prompts')

/** Prompt 版本号，默认 v1。通过 PROMPT_VERSION 环境变量切换。 */
const PROMPT_VERSION: string = process.env.PROMPT_VERSION ?? 'v1'

/** Prompt 语言区域，默认 zh（中文）。通过 PROMPT_LOCALE 环境变量切换。 */
const PROMPT_LOCALE: string = process.env.PROMPT_LOCALE ?? 'zh'

/** 模板内容缓存（进程内），key = 相对路径，如 'import.md' / '_shared/json-output-rules.md' */
const fileCache = new Map<string, string>()

/** 展开后的完整模板缓存，key = `${kind}:${PROMPT_LOCALE}:${PROMPT_VERSION}` */
const expandedCache = new Map<string, string>()

/** 构建 expandedCache 的 key，包含 locale 和版本号以隔离缓存 */
function cacheKey(kind: AgentKind): string {
  return `${kind}:${PROMPT_LOCALE}:${PROMPT_VERSION}`
}

/**
 * 解析模板文件路径：优先加载 locale+版本化文件，逐级回退。
 *
 * 解析优先级（PROMPT_LOCALE=en, PROMPT_VERSION=v2 为例）：
 *   1. en/import.v2.md  （locale + versioned）
 *   2. en/import.md     （locale + fallback）
 *   3. import.v2.md     （base + versioned）
 *   4. import.md        （base + fallback）
 */
function resolveTemplatePath(kind: AgentKind): string {
  const localeDir = PROMPT_LOCALE === 'en' ? 'en/' : ''
  const candidates = [
    `${localeDir}${kind}.${PROMPT_VERSION}.md`,
    `${localeDir}${kind}.md`,
    `${kind}.${PROMPT_VERSION}.md`,
    `${kind}.md`,
  ]
  for (const candidate of candidates) {
    if (existsSync(path.join(PROMPTS_DIR, candidate))) {
      return candidate
    }
  }
  return `${kind}.md`
}

/** 返回当前生效的 Prompt 版本号（测试用） */
export function getPromptVersion(): string {
  return PROMPT_VERSION
}

/** 返回当前生效的 Prompt 语言区域（测试用） */
export function getPromptLocale(): string {
  return PROMPT_LOCALE
}

/**
 * partial 引用语法：`{{> shared/xxx}}` 或 `{{> schema/<agent-kind>}}`
 *
 * 字符类包含 `\w` / `/` / `<` / `>` / `-`，覆盖 `<agent-kind>` 这类带尖括号的占位符名。
 */
const PARTIAL_RE = /\{\{>\s*([\w/<>-]+)\s*\}\}/g

/** 最大递归深度，防 partial 循环引用 */
const MAX_PARTIAL_DEPTH = 8

/**
 * 读取单个模板文件（带进程内缓存）。
 *
 * 抛错策略：文件不存在直接抛（编程错误，应尽早暴露），不返回静默空串。
 */
function readTemplateFile(relPath: string): string {
  const cached = fileCache.get(relPath)
  if (cached !== undefined) return cached

  const abs = path.join(PROMPTS_DIR, relPath)
  const content = readFileSync(abs, 'utf-8')
  fileCache.set(relPath, content)
  return content
}

/**
 * 递归展开 `{{> shared/name }}` partial。
 *
 * 循环引用处理：每个 _shared/*.md 的文档注释里都有自引用
 * （`> 引用方式：{{> shared/xxx}}`），用 visiting 栈识别——当某 partial
 * 已在当前展开链中时，把它的自引用替换为空串（语义上"已包含，无需再嵌"）。
 *
 * shared 片段本身可能引用 `{{> schema/<agent-kind>}}`（json-output-rules.md），
 * 但 schema 引用依赖具体 AgentKind，故在 expandShared 内不展开 schema，
 * 留给 loadExpandedTemplate 在 shared 展开完成后一次性替换。
 */
function expandShared(content: string, depth: number, visiting: Set<string>): string {
  if (depth > MAX_PARTIAL_DEPTH) {
    throw new Error(`partial 展开超过最大深度 ${MAX_PARTIAL_DEPTH}，疑似循环引用`)
  }
  // 没有任何 partial 引用，直接返回
  if (!content.includes('{{>')) return content

  return content.replace(PARTIAL_RE, (full, ref: string) => {
    // schema 引用由 loadExpandedTemplate 处理，这里原样保留
    if (ref.startsWith('schema/')) return full
    // 仅处理 shared/ 命名空间，其他引用报错
    if (!ref.startsWith('shared/')) {
      throw new Error(`未知的 partial 引用：${full}（仅支持 shared/* 与 schema/*）`)
    }
    // 循环引用（含自引用的文档注释）：跳过，避免无限递归
    if (visiting.has(ref)) return ''
    const fileName = ref.slice('shared/'.length) + '.md'
    const partial = readTemplateFile(path.join('_shared', fileName))
    visiting.add(ref)
    const expanded = expandShared(partial, depth + 1, visiting)
    visiting.delete(ref)
    return expanded
  })
}

/**
 * 加载并完整展开某 Agent 的 Prompt 模板（shared partials + schema 注入）。
 *
 * 版本与语言区域解析：通过 PROMPT_VERSION + PROMPT_LOCALE 环境变量切换。
 *   - PROMPT_LOCALE=en 时优先加载 en/{kind}.md，不存在则回退到 {kind}.md
 *   - PROMPT_LOCALE 未设置时默认 zh，行为与改造前完全一致（零回归）
 *
 * 展开顺序：
 *   1. 读取版本/语言区域解析后的模板文件
 *   2. 递归展开所有 {{> shared/xxx}} 引用
 *   3. 把残留的 {{> schema/<agent-kind>}} 替换为对应 AgentKind 的 JSON Schema 文本
 *
 * 结果按 `${kind}:${locale}:${version}` 缓存（模板文件在运行期不可变；如需热更新，清 expandedCache）。
 */
export function loadExpandedTemplate(kind: AgentKind): string {
  const key = cacheKey(kind)
  const cached = expandedCache.get(key)
  if (cached !== undefined) return cached

  const templatePath = resolveTemplatePath(kind)
  const raw = readTemplateFile(templatePath)
  const sharedExpanded = expandShared(raw, 0, new Set<string>())

  // 展开 schema 引用。expandShared 已把 json-output-rules.md 内的
  // {{> schema/<agent-kind>}} 原样保留，此处统一替换。
  const schemaHint = schemaToPromptHint(kind)
  const fullyExpanded = sharedExpanded.replace(PARTIAL_RE, (full, ref: string) => {
    if (ref === 'schema/<agent-kind>') return schemaHint
    // expandShared 已处理 shared/*；此处再出现说明是漏网或循环
    throw new Error(`partial 展开后仍残留未识别引用：${full}`)
  })

  expandedCache.set(key, fullyExpanded)
  return fullyExpanded
}

/** 清空缓存（测试用：当测试替换了模板文件后需要重新读取） */
export function clearTemplateCache(): void {
  fileCache.clear()
  expandedCache.clear()
}

/** 测试钩子：直接注入展开后的模板（绕过文件系统，便于单测） */
export function setExpandedTemplate(kind: AgentKind, content: string): void {
  expandedCache.set(cacheKey(kind), content)
}
