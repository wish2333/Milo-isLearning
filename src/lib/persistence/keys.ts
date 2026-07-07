/**
 * LocalStorage Key 命名规范
 *
 * 对应 docs/PRD.md §8 "LocalStorage Key 命名规范" 表格。
 * 所有 Key 以 `alc:` 前缀防冲突，所有写入路径必须经此模块，禁止裸字符串拼接。
 *
 * 命名空间：`alc` = AI Learning Compiler
 */

export const STORAGE_NAMESPACE = 'alc' as const

/**
 * Key 模板。所有访问 LocalStorage 的代码必须从此表取模板，
 * 再用 `keyFor()` 注入动态 id。
 */
export const StorageKeys = {
  /** KnowledgeSource：用户导入的原始 Markdown */
  source: (sourceId: string) => `${STORAGE_NAMESPACE}:source:${sourceId}`,
  /** Module：编译产物（完整 Module 树） */
  module: (moduleId: string) => `${STORAGE_NAMESPACE}:module:${moduleId}`,
  /** Mastery：掌握度计算结果 */
  mastery: (moduleId: string) => `${STORAGE_NAMESPACE}:mastery:${moduleId}`,
  /** AttemptRecord[]：单道 Quiz 的全部作答历史 */
  attempts: (quizId: string) => `${STORAGE_NAMESPACE}:attempts:${quizId}`,
  /** FeynmanAttempt：模块费曼整体作答 */
  feynman: (moduleId: string) => `${STORAGE_NAMESPACE}:feynman:${moduleId}`,
  /** ProgressState：学习状态机当前态 */
  progress: (moduleId: string) => `${STORAGE_NAMESPACE}:progress:${moduleId}`,
  /** 用户设置（LLM Provider / API Key 等），单一全局 key */
  settings: `${STORAGE_NAMESPACE}:settings`,
} as const

/**
 * 校验某字符串是否为本应用的 LocalStorage Key。
 *
 * 用于 LocalStorage 遍历（如 quota 计算时）过滤无关 key。
 */
export function isAlcKey(key: string): boolean {
  return key.startsWith(`${STORAGE_NAMESPACE}:`)
}

/** 提取所有 alc: 前缀的 key（用于 quota 计算 / 清空进度） */
export const STORAGE_KEY_PREFIX = `${STORAGE_NAMESPACE}:`

/**
 * 容量阈值（PRD §6.1 NFR / FR-08 AC4）
 */
export const STORAGE_WARN_BYTES = 4.5 * 1024 * 1024 // 4.5MB 预警
export const STORAGE_HARD_LIMIT_BYTES = 5 * 1024 * 1024 // 5MB LocalStorage 上限
export const STORAGE_MAX_HISTORY_MODULES = 3 // 当前 + 历史 3 = 最多 4 个 Module
