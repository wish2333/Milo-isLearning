/**
 * App Mode — 构建时环境变量控制展示模式与实用模式
 *
 * NEXT_PUBLIC_APP_MODE=showcase  → Vercel 默认，展示页
 * NEXT_PUBLIC_APP_MODE=production（或未设）→ 本地 dev 默认，实用页
 *
 * 因为 NEXT_PUBLIC_ 前缀，此常量在构建时被 Next.js inline 为字面量，
 * client component 和 server component 均可直接 import。
 */

export type AppMode = 'showcase' | 'production'

export const APP_MODE: AppMode =
  process.env.NEXT_PUBLIC_APP_MODE === 'showcase' ? 'showcase' : 'production'

export const isShowcaseMode = APP_MODE === 'showcase'
export const isProductionMode = APP_MODE === 'production'
