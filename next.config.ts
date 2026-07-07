import type { NextConfig } from 'next'

/**
 * Next.js 15 配置（M1 最小可运行版本）
 * 详见 docs/Technical-Specification.md §12
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Vercel Functions 超时配置在 vercel.json 中按路由单独定义
  // experimental 特性按需在后续里程碑开启

  // 把 Prompt 模板（.md）纳入 serverless 函数的文件追踪，
  // 否则生产构建（.next/server）里 fs 读取 prompts/ 会失败。
  // 见 lib/compiler/prompts/loader.ts。
  outputFileTracingIncludes: {
    '/api/**': ['./src/lib/compiler/prompts/**/*.md'],
  },
}

export default nextConfig
