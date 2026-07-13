/**
 * Storage Repository -- 持久化层抽象接口
 *
 * 对应 docs/Technical-Specification.md §6.1。
 *
 * 设计意图：
 *   - 把 LocalStorage 访问收敛到一处，禁止裸 localStorage.xxx 调用
 *   - 提供 JSON 序列化/反序列化的统一入口
 *   - 为 quota.ts 的容量扫描提供 keys() 枚举能力
 *
 * 不使用 Promise（LocalStorage 是同步 API），保持调用方代码简洁。
 * 若未来换 IndexedDB（V2），再改为 async 接口。
 */

export interface StorageRepository {
  /** 读取并 JSON.parse；不存在或解析失败返回 null */
  get<T>(key: string): T | null

  /** JSON.stringify 后写入；写入失败（QuotaExceeded）抛错 */
  set<T>(key: string, value: T): void

  /** 删除单个 key；key 不存在时静默忽略 */
  remove(key: string): void

  /** key 是否存在 */
  has(key: string): boolean

  /** 所有以 `alc:` 前缀开头的 key 列表（用于 quota 扫描） */
  keys(): string[]

  /** 获取 key 对应的原始字符串值（未 JSON.parse，用于字节计算） */
  getRaw(key: string): string | null

  /**
   * 写入原始字符串值（不 JSON.stringify）。
   *
   * 与 `set<T>` 的区别：set 会 JSON.stringify，setRaw 直接写传入的字符串。
   * 用于 BackupPackage 导入 / 迁移 staging commit 等场景，避免重复序列化破坏 valueRaw 一致性。
   *
   * 值必须是已序列化的合法字符串；写入失败抛错（与 set 一致）。
   */
  setRaw(key: string, value: string): void

  /** 清空所有 `alc:` 前缀的数据（危险操作，仅用于 reset / 清空进度） */
  clearAll(): void
}
