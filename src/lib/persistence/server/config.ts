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
 * SQLite 数据库文件路径（相对于项目根目录）。
 * 仅在 isStorageEnabled=true 时使用。
 */
export const SQLITE_DB_PATH = 'data/alc.db'
