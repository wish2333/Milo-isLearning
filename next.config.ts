import type { NextConfig } from 'next'

/**
 * Next.js 15 配置（M1 最小可运行版本）
 * 详见 docs/Technical-Specification.md §12
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // better-sqlite3 是 Node 原生 C++ addon，不应被 webpack/turbopack 打包。
  // 必须保留为外部 require —— 否则 webpack 会尝试把 .node 二进制打进 bundle 并失败。
  // 之前用 bun:sqlite 是错误的（next CLI 永远跑在 Node 上，bun:sqlite 不可用）。
  // E2E isolation: two `next dev` servers (port 3001 + 3002) share the same
  // source tree. Without separate cache dirs they corrupt each other's
  // compiled output, causing intermittent navigation failures in showcase tests.
  // Only active when E2E_CACHE_DIR is set by playwright.config.ts.
  ...(process.env.E2E_CACHE_DIR ? { distDir: process.env.E2E_CACHE_DIR } : {}),
  serverExternalPackages: ['better-sqlite3'],
  // Vercel Functions 超时由 vercel.json 中按路由设置（不同路由不同时限）

  // 让 Prompt 模板（.md）进入 serverless 的文件追踪，
  // 否则 Next 不会把 .next/server 之外的 fs 读取 prompts/ 当作依赖打包。
  // （见 lib/compiler/prompts/loader.ts）
  outputFileTracingIncludes: {
    '/api/**': ['./src/lib/compiler/prompts/**/*.md'],
  },
}

export default nextConfig
