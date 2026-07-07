import type { NextConfig } from 'next'

/**
 * Next.js 15 配置（M1 最小可运行版本）
 * 详见 docs/Technical-Specification.md §12
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Vercel Functions 超时配置在 vercel.json 中按路由单独定义
  // experimental 特性按需在后续里程碑开启
}

export default nextConfig
