import Link from 'next/link'

/**
 * 首页 — 引导用户进入学习流程
 */
export default function HomePage() {
  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col items-center justify-center gap-6 p-8">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-semibold">AI Learning Compiler</h1>
        <p className="text-sm text-neutral-500">
          将任何知识自动编译为一条低摩擦、高掌握度的学习路径
        </p>
      </div>
      <div className="flex gap-3">
        <Link
          href="/learn/import"
          className="px-6 py-3 rounded-md bg-neutral-100 text-neutral-900 text-sm font-medium hover:bg-white transition-colors"
        >
          开始学习
        </Link>
        <Link
          href="/settings"
          className="px-4 py-3 rounded-md border border-neutral-800 text-neutral-400 text-sm hover:text-neutral-200 hover:border-neutral-700 transition-colors"
        >
          设置
        </Link>
      </div>
    </main>
  )
}
