/**
 * Storage Repository — 持久化层抽象接口
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

  /** 清空所有 `alc:` 前缀的数据（危险操作，仅用于 reset / 清空进度） */
  clearAll(): void
}
