import Link from 'next/link'

/**
 * 首页（M1 占位）
 * M3 起按 docs/PRD.md §5.1 / docs/ui-design/DESIGN-SPEC.md §5.1 实现真实首页
 */
export default function HomePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-3xl font-semibold">AI Learning Compiler</h1>
      <p className="text-sm text-neutral-500">
        M1 scaffolding ready. M3 起接入 Knowledge Compiler.
      </p>
      <Link
        href="/settings"
        className="px-4 py-2 rounded-md border border-neutral-300 hover:bg-neutral-50"
      >
        进入设置
      </Link>
    </main>
  )
}
