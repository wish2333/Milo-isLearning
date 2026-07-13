/**
 * App Mode — 构建时环境变量控制展示模式与实用模式
 *
 * 默认：showcase（与 server 端 isProductionMode 判断保持一致，避免 client/server 不匹配）
 *   - NEXT_PUBLIC_APP_MODE 未设 或 非 Showcase 显式设值 → showcase
 *   - NEXT_PUBLIC_APP_MODE=production → production（还需 ALC_STORAGE_BACKEND=sqlite 才启用 SQLite）
 *
 * 因为 NEXT_PUBLIC_ 前缀，此常量在构建时被 Next.js inline 为字面量，
 * client component 和 server component 均可直接 import。
 *
 * 注意：与 server 端 isStorageEnabled 的关系——
 *   server: isProductionMode = NEXT_PUBLIC_APP_MODE === 'production'
 *   server: isStorageEnabled = isProductionMode && ALC_STORAGE_BACKEND === 'sqlite'
 *   client: isShowcaseMode = APP_MODE !== 'production'
 * 所以未设环境变量时：client isShowcaseMode=true（showcase UI），server isStorageEnabled=false（API 404），一致。
 */

export type AppMode = 'showcase' | 'production'

export const APP_MODE: AppMode =
  process.env.NEXT_PUBLIC_APP_MODE === 'production' ? 'production' : 'showcase'

export const isShowcaseMode = APP_MODE === 'showcase'
export const isProductionMode = APP_MODE === 'production'
