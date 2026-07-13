/**
 * Namespace 工具 -- 一级 namespace 提取
 *
 * v1.0.0 评审 §0.2 定案：namespace 统一取 `key.split(':')[1]`，
 * 即 `module`、`source`、`state`、`compile-job` 等一级 namespace。
 * 不拆分 `state-progress`、`compile-job-index` 等二级 namespace——
 * 具体类型继续由完整 key 判断。
 *
 * 用于 SQLite kv 表的 namespace 列、BackupPackage entry.namespace 字段。
 */

/**
 * 从 `alc:module:xxx` 提取 `module`。
 * 缺失第二段时返回空字符串（不抛错，由调用方决定如何处理）。
 */
export function parseNamespace(key: string): string {
  return key.split(':')[1] ?? ''
}
