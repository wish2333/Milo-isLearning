import 'server-only'

/**
 * Fail-closed 双开关 — v1.0.0 评审 3.2.1 节
 *
 * 仅当以下两个条件同时满足时，server 端才启用 SQLite：
 *   1. NEXT_PUBLIC_APP_MODE=production（client + server 均可见）
 *   2. ALC_STORAGE_BACKEND=sqlite（仅 server 端，不暴露给 client）
 *
 * 任一不满足 -> /api/data/* 一律 404。
 *
 * 默认 fail-closed：未配置时返回 false，永不静默启用 SQLite。
 */

export const isProductionMode: boolean = process.env.NEXT_PUBLIC_APP_MODE === 'production'

export const isStorageBackendConfigured: boolean = process.env.ALC_STORAGE_BACKEND === 'sqlite'

export const isStorageEnabled: boolean = isProductionMode && isStorageBackendConfigured

/**
 * SQLite 数据库文件路径。
 * 优先级：ALC_DB_PATH env > 默认 'data/alc.db'。
 * ALC_DB_PATH 用于测试/验证场景隔离，避免污染真实学习数据。
 * 仅在 isStorageEnabled=true 时使用。
 */
export const SQLITE_DB_PATH: string = process.env.ALC_DB_PATH ?? 'data/alc.db'

/** SQLite 自动备份目录，供隔离验证环境覆盖，默认保持向后兼容。 */
export const SQLITE_BACKUP_DIR: string = process.env.ALC_BACKUP_DIR ?? 'data/backup'
